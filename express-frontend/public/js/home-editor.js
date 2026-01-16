// Helper function to check if token is expired
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const payload = JSON.parse(atob(base64));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp ? payload.exp < now : true;
  } catch (e) {
    return true;
  }
}

// Unified API helper for all /api calls
// Use centralized auth-utils.apiFetch if available, with fallback
// CRITICAL: Default to requireAuth = false for homepage to allow unauthenticated usage
async function apiFetch(path, options = {}, requireAuth = false) {
  // Use centralized auth-utils if available (handles token refresh and homepage checks)
  if (window.authUtils && window.authUtils.apiFetch) {
    try {
      // IMPORTANT: auth-utils only auto-adds Authorization when requireAuth=true.
      // For homepage we often call with requireAuth=false (to avoid redirects),
      // but we still want logged-in users to get authenticated responses.
      const token = localStorage.getItem('access_token');
      if (token && !isTokenExpired(token)) {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        options = { ...options, headers };
      }
      return await window.authUtils.apiFetch(path, options, requireAuth);
    } catch (error) {
      // If auth-utils throws, and we're on homepage with requireAuth=false, 
      // don't block - just rethrow (caller should handle)
      const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';
      if (isHomepage && !requireAuth) {
        console.warn('[API] Error on homepage (non-blocking):', error.message);
      }
      throw error;
    }
  }
  
  // Fallback for when auth-utils is not loaded
  const token = localStorage.getItem('access_token');
  if (requireAuth && (!token || isTokenExpired(token))) {
    if (token && isTokenExpired(token)) {
      // Clear expired token
      localStorage.removeItem('access_token');
      document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    }
    console.warn('[API] Missing or expired token for', path);
    // On homepage, don't throw - just log
    const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';
    if (isHomepage) {
      console.log('[API] On homepage, not throwing error to prevent blocking');
      // Return a mock 401 response that won't break the page
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error('login_required');
  }
  const headers = new Headers(options.headers || {});
  if (requireAuth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else if (token && !requireAuth) {
    // Even if not required, include token if available (for better UX)
    headers.set('Authorization', `Bearer ${token}`);
  }
  console.log('[API] tokenPresent=', !!token, 'path=', path, 'requireAuth=', requireAuth);
  const response = await fetch(path, { 
    ...options, 
    headers,
    credentials: 'include'
  });

  if (requireAuth && response.status === 401) {
    console.warn('[API] Unauthorized for', path);
    // IMPORTANT: Don't redirect from homepage
    const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';
    if (!isHomepage) {
      console.log('[API] Redirecting to login (not on homepage)');
      window.location.href = '/login';
    } else {
      console.log('[API] On homepage, not redirecting to prevent loops');
    }
    throw new Error('unauthorized');
  }

  return response;
}

async function callTransliterator(text, mode = 'spoken', limit = 8, signal) {
  if (window.transliteratorReady) {
    await Promise.resolve(window.transliteratorReady);
  }
  if (typeof window.transliterateViaRunner !== 'function') {
    console.error('[TRANSLITERATOR] transliterateViaRunner is not available');
    return [];
  }
  return window.transliterateViaRunner(text, mode, limit, signal);
}

function normalizeTamilWord(item) {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  const raw =
    item.word ??
    item.ta ??
    item.text ??
    item.suggestion ??
    item.value ??
    '';
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const nested =
      raw.word ??
      raw.ta ??
      raw.text ??
      raw.suggestion ??
      raw.value ??
      '';
    return (typeof nested === 'string' ? nested : String(nested || '')).trim();
  }
  return String(raw || '').trim();
}

function firstTextNode(root) {
  if (!root) return null;
  if (root.nodeType === Node.TEXT_NODE) return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  return walker.nextNode();
}

function lastTextNode(root) {
  if (!root) return null;
  if (root.nodeType === Node.TEXT_NODE) return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = null;
  let cur = walker.nextNode();
  while (cur) {
    n = cur;
    cur = walker.nextNode();
  }
  return n;
}

function resolveCaretTextPosition(editorRoot) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let node = range.startContainer;
  let offset = range.startOffset;

  if (editorRoot && node && !editorRoot.contains(node)) return null;

  if (node && node.nodeType === Node.TEXT_NODE) {
    return { node, offset: Math.min(offset, (node.nodeValue || '').length) };
  }

  // If caret is on an element boundary, resolve to a nearby text node.
  if (node && node.nodeType === Node.ELEMENT_NODE) {
    const el = node;
    const beforeChild = offset > 0 ? el.childNodes[offset - 1] : null;
    const afterChild = el.childNodes[offset] || null;
    const candidate = beforeChild || afterChild || el;
    const textNode = beforeChild ? lastTextNode(candidate) : firstTextNode(candidate);
    if (textNode) {
      const len = (textNode.nodeValue || '').length;
      return { node: textNode, offset: beforeChild ? len : 0 };
    }

    // As a last resort, create a text node so we can compute token boundaries.
    const tn = document.createTextNode('');
    el.appendChild(tn);
    return { node: tn, offset: 0 };
  }

  return null;
}

function getEnglishTokenAtCaret(editorRoot) {
  const pos = resolveCaretTextPosition(editorRoot);
  if (!pos) return null;
  const node = pos.node;
  const offset = pos.offset;

  const text = node.nodeValue || '';
  const before = text.slice(0, offset);
  const after = text.slice(offset);

  const left = (before.match(/([A-Za-z]+)$/) || [])[1] || '';
  const right = (after.match(/^([A-Za-z]+)/) || [])[1] || '';
  const token = left + right;
  if (!token || token.length < 2) return null;

  const start = offset - left.length;
  const end = offset + right.length;
  return { token, node, start, end };
}
// Home Page Editor - Simplified Tamil Editor with 200 Character Limit

class HomeEditor {
  constructor() {
    this.editor = document.getElementById('home-editor');
    this.charCount = document.getElementById('home-char-count');
    this.suggestionsContainer = document.getElementById('home-suggestions-container');
    this.modeSelect = document.getElementById('home-mode-select');
    this.translateBtn = document.getElementById('home-translate-english-btn');
    // Home toolbar buttons (match workspace behavior)
    this.formatDropdownBtn = document.getElementById('home-format-dropdown-btn');
    this.formatDropdown = document.getElementById('home-format-dropdown');
    this.alignDropdownBtn = document.getElementById('home-align-dropdown-btn');
    this.alignDropdown = document.getElementById('home-align-dropdown');
    this.insertLinkBtn = document.getElementById('home-insert-link-btn');
    this.searchBtn = document.getElementById('home-search-btn');
    this.maxWords = 200;
    
    // Auto-analysis state
    this.analysisTimeout = null;
    this.abortController = null;
    this.lastAnalyzedText = '';
    this.isAnalyzing = false;
    this.pendingAnalysis = false;
    
    // Transliteration autocomplete state
    this.translitTimeout = null;
    this.autocompleteBox = document.getElementById('home-autocomplete-dropdown');
    this.autocompleteList = document.getElementById('home-autocomplete-list');
    this.autocompleteCloseBtn = document.getElementById('home-autocomplete-close');
    this.autocompleteCache = {}; // Cache API responses
    this.previousText = ''; // Track previous text for space detection
    this.currentSuggestions = [];
    this.currentCaretInfo = null;
    // Prevent dropdown re-opening immediately after a selection (Google-IME style)
    this.justReplacedUntil = 0;
    this.lastReplacedToken = '';
    
    // Tamil conversion dictionary (simplified version)
    this.tamilDict = {
      'a': 'அ', 'aa': 'ஆ', 'i': 'இ', 'ii': 'ஈ', 'u': 'உ', 'uu': 'ஊ',
      'e': 'எ', 'ee': 'ஏ', 'ai': 'ஐ', 'o': 'ஒ', 'oo': 'ஓ', 'au': 'ஔ',
      'ka': 'க', 'kaa': 'கா', 'ki': 'கி', 'kii': 'கீ', 'ku': 'கு', 'kuu': 'கூ',
      'nga': 'ங', 'ngaa': 'ஙா', 'ngi': 'ஙி', 'ngii': 'ஙீ',
      'cha': 'ச', 'chaa': 'சா', 'chi': 'சி', 'chii': 'சீ', 'chu': 'சு', 'chuu': 'சூ',
      'ja': 'ஜ', 'jaa': 'ஜா', 'ji': 'ஜி', 'jii': 'ஜீ',
      'nya': 'ஞ', 'nyaa': 'ஞா', 'nyi': 'ஞி', 'nyii': 'ஞீ',
      'ta': 'ட', 'taa': 'டா', 'ti': 'டி', 'tii': 'டீ', 'tu': 'டு', 'tuu': 'டூ',
      'na': 'ந', 'naa': 'நா', 'ni': 'நி', 'nii': 'நீ', 'nu': 'நு', 'nuu': 'நூ',
      'pa': 'ப', 'paa': 'பா', 'pi': 'பி', 'pii': 'பீ', 'pu': 'பு', 'puu': 'பூ',
      'ma': 'ம', 'maa': 'மா', 'mi': 'மி', 'mii': 'மீ', 'mu': 'மு', 'muu': 'மூ',
      'ya': 'ய', 'yaa': 'யா', 'yi': 'யி', 'yii': 'யீ', 'yu': 'யு', 'yuu': 'யூ',
      'ra': 'ர', 'raa': 'ரா', 'ri': 'ரி', 'rii': 'ரீ', 'ru': 'ரு', 'ruu': 'ரூ',
      'la': 'ல', 'laa': 'லா', 'li': 'லி', 'lii': 'லீ', 'lu': 'லு', 'luu': 'லூ',
      'va': 'வ', 'vaa': 'வா', 'vi': 'வி', 'vii': 'வீ', 'vu': 'வு', 'vuu': 'வூ',
      'zha': 'ழ', 'zhaa': 'ழா', 'zhi': 'ழி', 'zhii': 'ழீ',
      'lla': 'ள', 'llaa': 'ளா', 'lli': 'ளி', 'llii': 'ளீ',
      'rra': 'ற', 'rraa': 'றா', 'rri': 'றி', 'rrii': 'றீ',
      'nna': 'ண', 'nnaa': 'ணா', 'nni': 'ணி', 'nnii': 'ணீ',
      'vanakkam': 'வணக்கம்', 'nandri': 'நன்றி', 'tamil': 'தமிழ்',
      'eppadi': 'எப்படி', 'irukinga': 'இருக்கிங்க', 'nalladhu': 'நல்லது'
    };
    
    this.init();

    // Transliteration V2 (feature-flagged)
    const editorEl = this.editor;
    if (window.TRANS_SUGGEST_V2 && window.TransliterationTypeahead && window.HomeEditorAdapter && editorEl) {
      this.translitTypeahead = new window.TransliterationTypeahead(
        new window.HomeEditorAdapter(editorEl),
        {
          getMode: () => this.getMode(),
        }
      );
    }
  }

  getMode() {
    const v = this.modeSelect && this.modeSelect.value ? String(this.modeSelect.value) : 'spoken';
    return v || 'spoken';
  }
  
  init() {
    console.log('[INIT] HomeEditor init called, editor element:', this.editor ? 'FOUND' : 'NOT FOUND');
    if (!this.editor) {
      console.log('[INIT] ERROR: home-editor element not found! Cannot initialize.');
      return;
    }
    console.log('[INIT] Editor element found, attaching event listeners');
    
    // Toolbar buttons (execCommand)
    document.querySelectorAll('.home-toolbar .toolbar-btn[data-command]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const cmd = btn.getAttribute('data-command');
        if (!cmd) return;
        document.execCommand(cmd, false, null);
        this.editor.focus();

        // Toggle active state for formatting buttons
        if (['bold', 'italic', 'underline', 'strikeThrough'].includes(cmd)) {
          const isActive = document.queryCommandState(cmd);
          if (isActive) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
    });

    // Text style dropdown (Paragraph/Heading)
    if (this.formatDropdownBtn && this.formatDropdown) {
      this.formatDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.formatDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (e.target.closest('a[href]')) return;
        this.formatDropdown.classList.add('hidden');
      });
      this.formatDropdown.querySelectorAll('[data-format]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const tag = item.getAttribute('data-format') || 'p';
          document.execCommand('formatBlock', false, tag);
          this.formatDropdown.classList.add('hidden');
          this.editor.focus();
        });
      });
    }

    // Alignment dropdown
    if (this.alignDropdownBtn && this.alignDropdown) {
      this.alignDropdownBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.alignDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (e.target.closest('a[href]')) return;
        this.alignDropdown.classList.add('hidden');
      });
      this.alignDropdown.querySelectorAll('[data-command]').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const cmd = item.getAttribute('data-command');
          if (!cmd) return;
          document.execCommand(cmd, false, null);
          this.alignDropdown.classList.add('hidden');
          this.editor.focus();
        });
      });
    }

    // Link + Search
    if (this.insertLinkBtn) {
      this.insertLinkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = prompt('Enter URL:');
        if (url) document.execCommand('createLink', false, url);
        this.editor.focus();
      });
    }
    if (this.searchBtn) {
      this.searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const term = prompt('Search in text:');
        if (term) window.find(term);
      });
    }

    // Mode selector (match Workspace; affects transliteration suggestion endpoint params)
    if (this.modeSelect) {
      this.modeSelect.addEventListener('change', () => {
        this.autocompleteCache = {};
        this.currentSuggestions = [];
        this.currentCaretInfo = null;
        if (this.autocompleteBox) this.autocompleteBox.classList.add('hidden');
        // re-render suggestions for the current token
        this.showAutocomplete();
      });
    }

    // Translate English → Tamil (match Workspace behavior; do not save drafts)
    if (this.translateBtn) {
      this.translateBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const text = (this.getPlainText() || '').trim();
        if (!text) {
          alert('Please enter some English text to translate.');
          return;
        }
        const wc = this.countWords(text);
        if (wc < 5 || text.length < 20) {
          alert('Type at least 5 words to translate.');
          return;
        }

        const original = this.translateBtn.innerHTML;
        this.translateBtn.disabled = true;
        this.translateBtn.innerHTML = 'Submitting...';

        try {
          const response = await apiFetch(
            '/api/submit',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, save_draft: false }),
            },
            false
          );

          if (response.status === 401) {
            // Anonymous home-page fallback: use Gemini translate proxy (does not require auth)
            const gem = await apiFetch(
              '/api/gemini/translate',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
              },
              false
            );
            const rawGem = await gem.text();
            let dataGem = null;
            try {
              dataGem = rawGem ? JSON.parse(rawGem) : null;
            } catch (e2) {
              // ignore
            }
            if (!gem.ok) {
              const msg =
                (dataGem && (dataGem.error || dataGem.message || dataGem.details)) ||
                (rawGem && rawGem.trim().slice(0, 300)) ||
                `HTTP ${gem.status}`;
              throw new Error(msg);
            }
            if (dataGem && (dataGem.translated_text || dataGem.translated)) {
              this.editor.textContent = dataGem.translated_text || dataGem.translated;
              this.moveCursorToEnd();
              this.updateWordCount();
              this.scheduleAutoAnalysis();
            } else {
              alert('No translation returned. Please try again.');
            }
            return;
          }

          const raw = await response.text();
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (e2) {
            // ignore
          }

          if (!response.ok) {
            const msg =
              (data && (data.error || data.message || data.details)) ||
              (raw && raw.trim().slice(0, 300)) ||
              `HTTP ${response.status}`;
            throw new Error(msg);
          }

          if (data && data.translated_text) {
            this.editor.textContent = data.translated_text;
            this.moveCursorToEnd();
            this.updateWordCount();
            this.scheduleAutoAnalysis();
          } else {
            alert('No translation returned. Please try again.');
          }
        } catch (err) {
          console.error('[HomeEditor][Translate] Error:', err);
          alert('Translation failed. Please try again.');
        } finally {
          this.translateBtn.innerHTML = original;
          this.translateBtn.disabled = false;
        }
      });
    }
    
    // Handle input events
    this.editor.addEventListener('keydown', (e) => {
      console.log('[EVENT-DEBUG] keydown fired, key:', e.key, 'code:', e.code);
      if (e.key === ' ' || e.code === 'Space' || e.keyCode === 32) {
        console.log('[EVENT-DEBUG] Space key detected in keydown');
        this.handleKeyDown(e);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Allow arrow key navigation in suggestions
        e.preventDefault();
      }
    });
    this.editor.addEventListener('input', () => {
      this.handleInput();
      this.showAutocomplete();
    });
    this.editor.addEventListener('paste', (e) => this.handlePaste(e));

    // Close button + click-outside to dismiss
    if (this.autocompleteCloseBtn) {
      this.autocompleteCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.autocompleteBox?.classList.add('hidden');
      });
    }
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!this.autocompleteBox || this.autocompleteBox.classList.contains('hidden')) return;
      if (t && (this.autocompleteBox.contains(t) || this.editor.contains(t))) return;
      this.autocompleteBox.classList.add('hidden');
    });
    
    // Update word count on load
    this.updateWordCount();
  }

  getCaretRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects && rects.length) return rects[0];

    // Fallback: insert a temporary marker to reliably get caret coordinates (line ends / empty blocks)
    try {
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      marker.style.display = 'inline-block';
      marker.style.width = '1px';
      marker.style.height = '1em';
      marker.style.pointerEvents = 'none';
      marker.setAttribute('data-caret-marker', 'true');

      const liveRange = sel.getRangeAt(0);
      liveRange.insertNode(marker);
      const rect = marker.getBoundingClientRect();

      const newRange = document.createRange();
      newRange.setStartAfter(marker);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      marker.remove();
      return rect;
    } catch (e) {
      return null;
    }
  }

  positionAutocomplete() {
    if (!this.autocompleteBox) return;
    const rect = this.getCaretRect();
    const fallback = this.editor?.getBoundingClientRect?.();
    const anchor = rect || fallback;
    if (!anchor) return;

    const boxW = 320;
    const pad = 12;
    const viewW = window.innerWidth || 360;
    const viewH = window.innerHeight || 640;

    let left = Math.max(pad, Math.min(anchor.left, viewW - boxW - pad));
    let top = (anchor.bottom || 0) + 8;
    // If near bottom, flip above caret
    if (top > viewH - 220) {
      top = Math.max(pad, (anchor.top || 0) - 8 - 260);
    }

    this.autocompleteBox.style.left = `${left}px`;
    this.autocompleteBox.style.top = `${top}px`;
  }
  
  formatText(command) {
    document.execCommand(command, false, null);
    this.editor.focus();
  }
  
  handleKeyDown(e) {
    // If autocomplete dropdown is open, allow quick selection
    const dropdownOpen = this.autocompleteBox && !this.autocompleteBox.classList.contains('hidden');
    if (dropdownOpen && this.currentSuggestions && this.currentSuggestions.length) {
      // Space selects top suggestion
      if (e.key === ' ' || e.code === 'Space' || e.keyCode === 32) {
        e.preventDefault();
        // Google IME behavior: Space commits the top suggestion and keeps the space
        this.insertSuggestion(0, true);
        return;
      }
      // Number keys 1-5 select matching suggestion
      if (/^[1-5]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (this.currentSuggestions[idx]) {
          // Do not auto-insert a space for number selection (user can type next char/space)
          this.insertSuggestion(idx, false);
        }
        return;
      }
      // Escape closes dropdown
      if (e.key === 'Escape') {
        e.preventDefault();
        this.autocompleteBox.classList.add('hidden');
        return;
      }
    }

    // Detect space key press BEFORE text is inserted
    if (e.key === ' ' || e.code === 'Space') {
      console.log('[KEYDOWN] Space key detected');
      // Get current text before space is inserted
      const fullText = (this.editor.textContent || '').trimEnd();
      const words = fullText.split(/\s+/);
      const lastWord = words[words.length - 1] || '';
      
      console.log('[KEYDOWN] Last word before space:', lastWord);
      
      // Check if we should prevent default and handle transliteration
      if (lastWord && /^[a-zA-Z]+$/.test(lastWord)) {
        // Try local dict first
        const tamilWord = this.convertWordToTamil(lastWord);
        console.log('[KEYDOWN] Local dict result:', tamilWord);
        
        if (tamilWord && tamilWord !== lastWord) {
          // Replace in editor and add space
          e.preventDefault();
          const beforeLastWord = fullText.substring(0, fullText.length - lastWord.length);
          this.editor.textContent = beforeLastWord + tamilWord + ' ';
          this.moveCursorToEnd();
          console.log('[KEYDOWN] Used local translation:', lastWord, '->', tamilWord);
          this.updateWordCount();
          this.scheduleAutoAnalysis();
          return;
        } else {
          // Call API for transliteration
          console.log('[KEYDOWN] Calling API for:', lastWord);
          e.preventDefault();
          const beforeLastWord = fullText.substring(0, fullText.length - lastWord.length);
          this.lastEditedWord = { word: lastWord, before: beforeLastWord };
          this.transliterateFromKeypress(lastWord);
          return;
        }
      }
    }
  }

  handleInput() {
    const fullText = this.editor.textContent || '';
    console.log('[INPUT-HANDLER] Current text length:', fullText.length, 'Previous length:', this.previousText.length);
    
    // Detect if space was just added
    const hasSpaceNow = fullText.length > this.previousText.length && fullText[fullText.length - 1] === ' ';
    
    if (hasSpaceNow) {
      console.log('[INPUT-HANDLER] Space detected! Calling handleSpaceInInput');
      this.handleSpaceInInput();
    } else {
      this.enforceWordLimit();
      this.updateWordCount();
      this.scheduleAutoAnalysis();
    }
    
    this.previousText = fullText; // Update previous text for next comparison
  }
  
  handleSpaceInInput() {
    // Disable auto-replace on space; IME suggestions are explicit
    return;
    const fullText = (this.editor.textContent || '').trimEnd();
    const words = fullText.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    
    console.log('[SPACE-INPUT] Space typed after word:', lastWord);
    
    // If last word is English, try translation
    if (lastWord && /^[a-zA-Z]+$/.test(lastWord)) {
      // Try local dict first
      const tamilWord = this.convertWordToTamil(lastWord);
      console.log('[SPACE-INPUT] Local dict result:', tamilWord);
      
      if (tamilWord && tamilWord !== lastWord) {
        // Replace in editor and move cursor to end
        const beforeLastWord = fullText.substring(0, fullText.length - lastWord.length);
        this.editor.textContent = beforeLastWord + tamilWord + ' ';
        this.moveCursorToEnd();
        console.log('[SPACE-INPUT] Used local translation:', lastWord, '->', tamilWord);
        this.updateWordCount();
        this.scheduleAutoAnalysis();
        return;
      } else {
        // Call API
        console.log('[SPACE-INPUT] Calling API for:', lastWord);
        this.transliterateFromInput(lastWord);
        return;
      }
    }
    
    // No transliteration needed, just schedule analysis
    this.scheduleAutoAnalysis();
  }
  
  moveCursorToEnd() {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this.editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    this.editor.focus();
  }

  async showAutocomplete() {
    if (!this.autocompleteBox) {
      console.warn('[AUTOCOMPLETE] Dropdown not found');
      return;
    }

    // Prefer the exact token at the caret (more accurate than "last word in full text")
    const caretInfo = getEnglishTokenAtCaret(this.editor);
    const lastWord = caretInfo?.token || '';

    // Only show for English words >= 2 chars
    if (!lastWord || !/^[a-z]+$/i.test(lastWord) || lastWord.length < 2) {
      this.autocompleteBox.classList.add('hidden');
      return;
    }

    // If we just committed a suggestion for this exact token, keep the dropdown hidden.
    // It should show only when typing the next word (i.e., token changes).
    const now = Date.now();
    const lw = String(lastWord).toLowerCase();
    if (now < (this.justReplacedUntil || 0) && lw && lw === (this.lastReplacedToken || '')) {
      this.autocompleteBox.classList.add('hidden');
      return;
    }

    console.log('[AUTOCOMPLETE] Checking word:', lastWord);

    const mode = this.getMode();
    const cacheKey = `${mode}:${lastWord.toLowerCase()}`;

    // Check cache first (mode-aware)
    if (this.autocompleteCache[cacheKey]) {
      console.log('[AUTOCOMPLETE] Using cached suggestions for:', lastWord);
      this.renderSuggestions(this.autocompleteCache[cacheKey]);
      return;
    }

    console.log('[AUTOCOMPLETE] Fetching suggestions for:', lastWord);

    // Debounced API call
    if (this.translitTimeout) clearTimeout(this.translitTimeout);
    this.translitTimeout = setTimeout(async () => {
      try {
        const suggestions = await callTransliterator(lastWord, mode, 8);
        const normalized = (suggestions || [])
          .map((s) => ({
            word: normalizeTamilWord(s),
            score: (typeof s === 'object' && s) ? (s.score || s.confidence || 0) : 0,
          }))
          .filter(s => s.word);
        this.autocompleteCache[cacheKey] = normalized;
        this.currentSuggestions = normalized;
        this.currentCaretInfo = caretInfo;
        this.renderSuggestions(normalized);
      } catch (err) {
        console.error('[AUTOCOMPLETE] Fetch error:', err);
      }
    }, 300); // 300ms debounce
  }

  renderSuggestions(suggestions) {
    if (!this.autocompleteBox) {
      console.error('[AUTOCOMPLETE] Dropdown element not found!');
      return;
    }
    
    if (!suggestions?.length) {
      this.autocompleteBox.classList.remove('hidden');
      const container = this.autocompleteList || this.autocompleteBox.querySelector('#home-autocomplete-list');
      if (container) container.innerHTML = `<div class="p-3 text-sm text-gray-500">No suggestions found</div>`;
      return;
    }

    try {
      const container = this.autocompleteList || this.autocompleteBox.querySelector('#home-autocomplete-list');
      if (!container) {
        console.error('[AUTOCOMPLETE] List container not found in dropdown');
        return;
      }

      container.innerHTML = suggestions
        .slice(0, 5)
        .map((item, idx) => {
          const tamilWord = typeof item === 'string' ? item : normalizeTamilWord(item.word || item);
          const active = idx === 0;
          return `
          <button type="button"
            class="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border transition ${active ? 'bg-purple-50 border-purple-200' : 'bg-white border-transparent hover:bg-gray-50'}"
            data-index="${idx}"
            onclick="homeEditor.insertSuggestion(${idx})">
            <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${active ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'}">
              ${idx + 1}
            </span>
            <span class="text-base font-semibold text-gray-900 flex-1">${tamilWord}</span>
          </button>
        `;
        })
        .join('');

      console.log('[AUTOCOMPLETE] Showing dropdown with', suggestions.length, 'suggestions');
      this.positionAutocomplete();
      this.autocompleteBox.classList.remove('hidden');
    } catch (err) {
      console.error('[AUTOCOMPLETE] Render error:', err);
    }
  }

  insertSuggestion(index, appendSpace = false) {
    if (!this.currentSuggestions?.[index]) return;
    
    const suggestion = this.currentSuggestions[index];
    const tamilWord = normalizeTamilWord(suggestion);
    let caretInfo = this.currentCaretInfo || getEnglishTokenAtCaret(this.editor);
    if (!caretInfo) return;

    // Ensure we operate on a text node and a Latin token
    if (!caretInfo.node || caretInfo.node.nodeType !== Node.TEXT_NODE) {
      caretInfo = getEnglishTokenAtCaret(this.editor);
      if (!caretInfo || caretInfo.node.nodeType !== Node.TEXT_NODE) return;
    }

    const node = caretInfo.node;
    let text = node.nodeValue || '';
    let start = caretInfo.start;
    let end = caretInfo.end;

    // Validate current token is still Latin; otherwise recompute at current caret.
    const currentToken = text.slice(start, end);
    if (!/^[A-Za-z]+$/.test(currentToken)) {
      const fresh = getEnglishTokenAtCaret(this.editor);
      if (!fresh || !fresh.node || fresh.node.nodeType !== Node.TEXT_NODE) return;
      if (fresh.node !== node) {
        // Switch nodes if caret moved
        caretInfo = fresh;
        text = fresh.node.nodeValue || '';
        start = fresh.start;
        end = fresh.end;
      } else {
        start = fresh.start;
        end = fresh.end;
      }
    }

    // If user continued typing, extend end to cover the full Latin run
    let actualEnd = end;
    while (actualEnd < text.length && /[A-Za-z]/.test(text.charAt(actualEnd))) actualEnd++;

    const replacementText = tamilWord + (appendSpace ? ' ' : '');
    node.nodeValue = text.slice(0, start) + replacementText + text.slice(actualEnd);

    // Place caret right after the inserted Tamil
    try {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.setStart(node, Math.min(start + replacementText.length, (node.nodeValue || '').length));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (e) {
      // non-fatal
    }

    this.autocompleteBox.classList.add('hidden');
    // Block re-open for the same token for a short window to avoid immediate re-fetch on the same word.
    this.lastReplacedToken = String(caretInfo.token || '').toLowerCase();
    this.justReplacedUntil = Date.now() + 600;
    this.currentCaretInfo = null;
    this.currentSuggestions = [];
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  async transliterateFromInput(englishWord) {
    console.log('[API-INPUT] Transliterating:', englishWord);
    try {
      const suggestions = await callTransliterator(englishWord, this.getMode(), 8);
      const suggestion = suggestions?.[0];
      if (suggestion) {
        const tamilWord = normalizeTamilWord(suggestion);
        const fullText = (this.editor.textContent || '').trimEnd();
        const beforeLastWord = fullText.substring(0, fullText.length - englishWord.length);
        this.editor.textContent = beforeLastWord + tamilWord + ' ';
        this.moveCursorToEnd();
        console.log('[API-INPUT] Inserted Tamil:', englishWord, '->', tamilWord);
        this.updateWordCount();
        this.scheduleAutoAnalysis();
        return;
      } else {
        console.log('[API-INPUT] No suggestions or error');
      }
    } catch (err) {
      console.log('[API-INPUT] Error:', err);
    }
    
    // Fallback: just leave the space there and analyze
    this.scheduleAutoAnalysis();
  }
  
  async transliterateFromKeypress(englishWord) {
    console.log('[KEYPRESS] Calling transliteration API for:', englishWord);
    try {
      const suggestions = await callTransliterator(englishWord, 'spoken', 8);
      const suggestion = suggestions?.[0];
      if (suggestion) {
        const tamilWord = normalizeTamilWord(suggestion);
        if (this.lastEditedWord) {
          this.editor.textContent = this.lastEditedWord.before + tamilWord + ' ';
        }
        this.moveCursorToEnd();
        console.log('[KEYPRESS] Inserted Tamil:', englishWord, '->', tamilWord);
        this.updateWordCount();
        this.scheduleAutoAnalysis();
        return;
      } else {
        console.log('[KEYPRESS] No suggestions or error');
      }
    } catch (err) {
      console.log('[KEYPRESS] Error:', err);
    }
    
    // Fallback: just add space and analyze
    if (this.lastEditedWord) {
      this.editor.textContent = this.lastEditedWord.before + englishWord + ' ';
      this.moveCursorToEnd();
    }
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  handleTransliterationAutocomplete() {
    if (this.translitTimeout) clearTimeout(this.translitTimeout);
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const textBeforeCursor = range.startContainer.textContent?.substring(0, range.startOffset) || '';
    const words = textBeforeCursor.split(/\s/);
    const currentWord = words[words.length - 1];
    
    console.log('[TRANSLIT-DEBUG] Current word:', currentWord, 'Length:', currentWord?.length, 'Is English:', /^[a-zA-Z]+$/.test(currentWord || ''));
    
    // Only trigger for English words (2+ chars)
    if (!currentWord || currentWord.length < 2 || !/^[a-zA-Z]+$/.test(currentWord)) {
      this.removeTranslitAutocomplete();
      return;
    }
    
    // Debounce transliteration API call
    this.translitTimeout = setTimeout(async () => {
      console.log('[TRANSLIT-DEBUG] Calling API with word:', currentWord);
      try {
        const suggestions = await callTransliterator(currentWord, 'spoken', 8);
        if (suggestions && suggestions.length > 0) {
          console.log('[TRANSLIT-DEBUG] Showing autocomplete with', suggestions.length, 'suggestions');
          this.showTranslitAutocomplete(suggestions);
        }
      } catch (err) {
        console.log('[TRANSLIT-DEBUG] Transliteration API error:', err);
      }
    }, 300);
  }
  
  showTranslitAutocomplete(suggestions) {
    this.removeTranslitAutocomplete();
    
    const box = document.createElement('div');
    box.className = 'autocomplete-box bg-white border-2 border-primary-200 rounded-lg shadow-xl z-50';
    box.style.cssText = 'position: fixed; max-height: 200px; overflow-y: auto; min-width: 150px;';
    
    suggestions.slice(0, 5).forEach((word) => {
      const item = document.createElement('div');
      item.className = 'px-3 py-2 cursor-pointer tamil-text hover:bg-accent-50';
      item.textContent = word;
      item.style.fontSize = '1rem';
      
      item.addEventListener('click', () => {
        this.insertTransliteratedWord(word);
        this.removeTranslitAutocomplete();
      });
      
      box.appendChild(item);
    });
    
    const selection = window.getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      box.style.left = rect.left + 'px';
      box.style.top = (rect.bottom + 5) + 'px';
    }
    
    document.body.appendChild(box);
    this.autocompleteBox = box;
  }
  
  insertTransliteratedWord(tamilWord) {
    // Use the more reliable approach: select the English word and replace it
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const fullText = this.editor.textContent;
    const textBeforeCursor = fullText.substring(0, range.startOffset);
    
    // Extract current English word
    const words = textBeforeCursor.split(/\s/);
    const currentWord = words[words.length - 1];
    
    // Only replace if it's an English word
    if (!currentWord || !/^[a-zA-Z]+$/.test(currentWord)) {
      return;
    }
    
    // Position range to select the English word backwards
    const wordStartOffset = range.startOffset - currentWord.length;
    
    // Create a new range to select the English word
    const newRange = document.createRange();
    newRange.setStart(range.startContainer, wordStartOffset);
    newRange.setEnd(range.startContainer, range.startOffset);
    
    // Replace the selection with Tamil word using execCommand
    selection.removeAllRanges();
    selection.addRange(newRange);
    document.execCommand('insertText', false, tamilWord);
    
    this.updateWordCount();
    this.scheduleAutoAnalysis();
  }
  
  removeTranslitAutocomplete() {
    if (this.autocompleteBox) {
      this.autocompleteBox.remove();
      this.autocompleteBox = null;
    }
  }
  
  handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    
    // Check if text contains mostly English characters
    const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    
    let processedText = text;
    if (englishRatio > 0.5) {
      // Convert English to Tamil
      processedText = this.convertEnglishToTamil(text);
    }
    
    // Enforce word limit
    const currentText = this.getPlainText();
    const currentWords = this.countWords(currentText);
    const remainingWords = this.maxWords - currentWords;
    const textWords = this.countWords(processedText);
    
    if (textWords > remainingWords) {
      // Truncate to fit remaining words
      const wordsArray = processedText.split(/\s+/);
      const textToInsert = wordsArray.slice(0, remainingWords).join(' ');
      document.execCommand('insertText', false, textToInsert);
    } else {
      document.execCommand('insertText', false, processedText);
    }
    
    this.updateWordCount();
    // Paste should trigger analysis immediately (no "lost" debounce on delete → paste flows)
    // Also reset lastAnalyzedText so re-pasting different content always triggers a request.
    this.lastAnalyzedText = '';
    // Run on next tick so the DOM insertText has applied.
    setTimeout(() => this.autoAnalyze(), 0);
  }
  
  convertWordToTamil(word) {
    const lower = word.toLowerCase();
    
    // ONLY check local dictionary - API handles anything not here
    if (this.tamilDict[lower]) {
      return this.tamilDict[lower];
    }
    
    // Return null to trigger API call for words not in dict
    return null;
  }
  
  convertEnglishToTamil(text) {
    const words = text.split(/(\s+)/);
    return words.map(word => {
      if (/^[a-zA-Z]+$/.test(word)) {
        const converted = this.convertWordToTamil(word);
        return converted || word;
      }
      return word;
    }).join('');
  }
  
  countWords(text) {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }

  enforceWordLimit() {
    const text = this.getPlainText();
    const wordCount = this.countWords(text);
    
    if (wordCount > this.maxWords) {
      // Truncate to max words
      const wordsArray = text.split(/\s+/);
      const truncated = wordsArray.slice(0, this.maxWords).join(' ');
      this.editor.textContent = truncated;
      
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(this.editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  
  updateWordCount() {
    const text = this.getPlainText();
    const count = this.countWords(text);
    const isOverLimit = count >= this.maxWords;
    
    if (this.charCount) {
      this.charCount.textContent = `${count} / ${this.maxWords} words`;
      this.charCount.style.color = isOverLimit ? '#dc2626' : '#6b7280';
    }
  }
  
  getPlainText() {
    return this.editor.textContent.trim();
  }
  
  scheduleAutoAnalysis() {
    // Clear existing timeout
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }

    // Debounce: Wait 1 second after user stops typing
    this.analysisTimeout = setTimeout(() => {
      this.autoAnalyze();
    }, 1000);
  }

  /**
   * When /api/submit returns 202 (async), wait for the backend SSE result.
   * This mirrors Workspace behavior but keeps the Home logic lightweight.
   */
  async awaitSubmissionResult(submissionId) {
    if (!submissionId) return {};
    const canSse = typeof window !== 'undefined' && typeof window.EventSource === 'function';
    if (!canSse) return {};

    const url = `/api/v1/stream/submissions/${submissionId}`;
    console.log('[HomeEditor] Waiting for SSE result:', url);

    return await new Promise((resolve, reject) => {
      const es = new EventSource(url, { withCredentials: true });
      const timeout = setTimeout(() => {
        try { es.close(); } catch (_e) {}
        reject(new Error('sse_timeout'));
      }, 30000);

      const cleanup = () => {
        clearTimeout(timeout);
        try { es.close(); } catch (_e) {}
      };

      es.addEventListener('result', (evt) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          cleanup();
          resolve(data);
        } catch (e) {
          cleanup();
          reject(e);
        }
      });

      es.addEventListener('failure', (evt) => {
        cleanup();
        try {
          const data = JSON.parse(evt.data || '{}');
          reject(new Error(data.message || 'submission_failed'));
        } catch (_e) {
          reject(new Error('submission_failed'));
        }
      });

      es.addEventListener('end', () => {
        cleanup();
        reject(new Error('sse_end_without_result'));
      });

      es.onerror = () => {
        cleanup();
        reject(new Error('sse_error'));
      };
    });
  }

  normalizeRawSuggestions(raw) {
    // Backend often stores JSON as a string in submission.suggestions
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === '[]') return [];
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_e) {
        return [];
      }
    }
    return Array.isArray(raw) ? raw : [];
  }

  extractSuggestionsFromPayload(payload) {
    // 1) GoTamil-style corrections from SSE stream handler (preferred)
    if (Array.isArray(payload?.corrections)) {
      return payload.corrections.map((c, index) => ({
        id: index,
        original: c.originalText || c.original || '',
        corrected: c.correction || c.corrected || '',
        reason: c.reason || '',
        type: c.type || 'grammar',
        alternatives: [],
      }));
    }

    // 2) Raw suggestions stored on submission (stringified JSON)
    const raw = payload?.submission?.suggestions ?? payload?.submission?.corrections ?? payload?.suggestions ?? payload?.corrections;
    const list = this.normalizeRawSuggestions(raw);

    return list.map((item, index) => ({
      id: index,
      original: item.original || item.originalText || '',
      corrected: item.corrected || item.correction || item.suggestion || '',
      reason: item.reason || item.description || '',
      type: item.type || 'grammar',
      alternatives: item.alternatives || [],
    }));
  }
  
  async autoAnalyze() {
    const text = this.getPlainText();
    const wc = this.countWords(text);
    if (wc < 5 || text.length < 20) {
      this.showInfo('Grammar suggestions require a full sentence.');
      this.lastAnalyzedText = '';
      this.displaySuggestions([]);
      return;
    }
    
    // If empty, clear suggestions and reset
    if (!text) {
      this.lastAnalyzedText = '';
      this.displaySuggestions([]);
      return;
    }
    
    // If already analyzing, mark that we need to re-run after completion
    if (this.isAnalyzing) {
      this.pendingAnalysis = true;
      return;
    }
    
    // Skip if same as last analyzed
    if (text === this.lastAnalyzedText) return;
    
    // Check if text is mostly Tamil (not English)
    const tamilChars = text.match(/[\u0B80-\u0BFF]/g) || [];
    const tamilRatio = tamilChars.length / text.length;
    
    console.log('Tamil analysis check:', { 
      text, 
      tamilChars: tamilChars.length, 
      totalChars: text.length, 
      tamilRatio: tamilRatio.toFixed(2),
      willAnalyze: tamilRatio >= 0.3
    });
    
    if (tamilRatio < 0.3) {
      // Not enough Tamil content, skip analysis
      console.log('Skipping analysis - not enough Tamil content');
      return;
    }
    
    // We'll set lastAnalyzedText only after we have a successful response,
    // so deleting/re-pasting doesn't accidentally suppress requests.
    this.isAnalyzing = true;
    this.pendingAnalysis = false;
    
    // Show loading state
    this.showLoading();
    
    try {
      // Abort previous request if exists
      if (this.abortController) {
        this.abortController.abort();
      }
      
      this.abortController = new AbortController();

      // Home page always calls /api/submit.
      // If user is logged out, the server-side /api/submit route will fallback to Gemini.
      const response = await apiFetch(
        '/api/submit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, save_draft: false }),
          signal: this.abortController.signal,
        },
        false // requireAuth=false to avoid homepage redirect loops; token still sent if present
      );
      
      if (!response.ok) {
        // On homepage, handle 401 gracefully (user not logged in)
        if (response.status === 401) {
          // Anonymous home-page fallback: use Gemini analyze proxy (does not require auth)
          try {
            console.log('[HomeEditor] /api/submit returned 401; falling back to /api/gemini/analyze');
            const gem = await apiFetch(
              '/api/gemini/analyze',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
                signal: this.abortController.signal,
              },
              false
            );
            const rawGem = await gem.text();
            let gemData = null;
            try {
              gemData = rawGem ? JSON.parse(rawGem) : null;
            } catch (e) {
              // ignore
            }
            if (!gem.ok) {
              const msg =
                (gemData && (gemData.error || gemData.message || gemData.details)) ||
                (rawGem && rawGem.trim().slice(0, 300)) ||
                `HTTP ${gem.status}`;
              this.showError(`AI analysis failed: ${msg}`);
              return;
            }
            const rawSuggestions = Array.isArray(gemData?.suggestions) ? gemData.suggestions : [];
            const suggestions = rawSuggestions.map((item, index) => ({
              id: index,
              original: item.original || '',
              corrected: item.suggestion || item.corrected || '',
              reason: item.description || item.reason || '',
              type: item.type || 'grammar',
              alternatives: [],
            }));
            this.displaySuggestions(suggestions);
            return;
          } catch (e) {
            console.error('[HomeEditor] Gemini fallback failed:', e);
            this.showError('Please sign in to get AI suggestions (fallback failed).');
            return;
          }
        }
        const rawErr = await response.text();
        let msg = `AI analysis failed (HTTP ${response.status})`;
        try {
          const j = rawErr ? JSON.parse(rawErr) : null;
          if (j && (j.error || j.message || j.details)) {
            msg = String(j.error || j.message || j.details);
          }
        } catch (e) {
          // ignore
        }
        if (rawErr && rawErr.trim() && msg === `AI analysis failed (HTTP ${response.status})`) {
          msg = `${msg}: ${rawErr.trim().slice(0, 300)}`;
        }
        this.showError(msg);
        return;
      }
      
      const rawOk = await response.text();
      let data = {};
      try {
        data = rawOk ? JSON.parse(rawOk) : {};
      } catch (e) {
        console.error('[HomeEditor] /api/submit returned non-JSON:', rawOk?.slice?.(0, 300));
        this.showError('AI analysis failed: server returned an invalid response.');
        return;
      }
      console.log('AI analysis response (full):', JSON.stringify(data, null, 2));
      console.log('Response structure check:', {
        hasResult: !!data.result,
        resultType: typeof data.result,
        resultKeys: data.result ? Object.keys(data.result) : 'no result',
        hasCorrections: !!data.corrections,
        hasResultCorrections: !!data.result?.corrections,
      });
      
      // If backend accepted async (202/pending), wait for completion via SSE
      const submissionId = data?.submission?.id;
      const status = data?.submission?.status;
      const looksAsync = response.status === 202 || status === 'pending' || status === 'processing';

      if (looksAsync && submissionId) {
        try {
          const resultPayload = await this.awaitSubmissionResult(submissionId);
          const suggestions = this.extractSuggestionsFromPayload(resultPayload);
          console.log('[HomeEditor] SSE suggestions:', suggestions.length, suggestions);
          this.displaySuggestions(suggestions);
          this.lastAnalyzedText = text;
          return;
        } catch (e) {
          console.warn('[HomeEditor] SSE wait failed:', e?.message);
          // Fall through: show what we have (often none) rather than hanging.
        }
      }

      // Non-async (or SSE failed): best-effort extraction from current payload
      const suggestions = this.extractSuggestionsFromPayload(data);
      console.log('[HomeEditor] Immediate suggestions:', suggestions.length, suggestions);
      this.displaySuggestions(suggestions);
      // Only now mark the text as analyzed successfully (prevents missing triggers on quick edits)
      this.lastAnalyzedText = text;
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        if (error.message === 'login_required' || error.message === 'unauthorized') {
          console.warn('Auto-analysis requires login');
          this.showError();
          return;
        }
        console.error('Auto-analysis error:', error);
        console.error('Error details:', {
          message: error.message,
          status: error.status,
          stack: error.stack
        });
        this.showError();
      }
    } finally {
      this.isAnalyzing = false;
      
      // If text changed during analysis, re-run
      if (this.pendingAnalysis) {
        this.pendingAnalysis = false;
        // Re-schedule analysis for new content
        this.scheduleAutoAnalysis();
      }
    }
  }
  
  showLoading() {
    if (!this.suggestionsContainer) return;
    
    this.suggestionsContainer.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600 mb-4"></div>
        <p class="text-sm">Analyzing your Tamil text...</p>
      </div>
    `;
  }
  
  showError() {
    if (!this.suggestionsContainer) return;
    
    this.suggestionsContainer.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <p class="text-sm text-red-600">Analysis failed. Please try again.</p>
      </div>
    `;
  }
  
  displaySuggestions(suggestions) {
    if (!this.suggestionsContainer) return;
    
    // Get current text to check if editor is empty
    const currentText = this.getPlainText().trim();
    
    if (suggestions.length === 0) {
      // Only show "Looks great!" if there's actual text
      if (currentText) {
        this.suggestionsContainer.innerHTML = `
          <div class="text-center text-gray-500 py-8">
            <svg class="w-16 h-16 mx-auto mb-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <p class="text-sm font-semibold text-green-600">Looks great!</p>
            <p class="text-xs text-gray-400 mt-2">No grammar issues found</p>
          </div>
        `;
      } else {
        // Show default empty state
        this.suggestionsContainer.innerHTML = `
          <div class="text-center text-gray-500 py-8">
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <p class="text-sm">Type or paste Tamil text in the editor</p>
            <p class="text-xs text-gray-400 mt-2">AI suggestions appear automatically as you type</p>
          </div>
        `;
      }
      return;
    }
    
    const suggestionsHTML = suggestions.map((suggestion, index) => {
      const typeLabel = (suggestion.type || 'grammar').toUpperCase();
      const hasCorrection = suggestion.original && suggestion.corrected;
      const hasAlternatives = suggestion.alternatives && Array.isArray(suggestion.alternatives) && suggestion.alternatives.length > 0;
      
      return `
        <div class="bg-accent-50 rounded-lg p-4 border-l-4 border-primary-500 mb-3">
          <div class="flex items-start gap-2">
            <span class="inline-block px-2 py-1 bg-primary-600 text-white text-xs rounded font-semibold flex-shrink-0 whitespace-nowrap">
              ${typeLabel}
            </span>
            <div class="flex-1 min-w-0">
              ${hasCorrection ? `
                <p class="text-sm text-gray-700 mb-2">
                  <span class="line-through text-red-600">"${suggestion.original}"</span>
                  <span class="mx-1 text-gray-400">→</span>
                  <span class="text-green-600 font-semibold">"${suggestion.corrected}"</span>
                </p>
              ` : ''}
              ${suggestion.reason ? `
                <p class="text-sm text-gray-700 mb-2">${suggestion.reason}</p>
              ` : ''}
              ${hasAlternatives ? `
                <div class="mt-2 pt-2 border-t border-primary-200">
                  <p class="text-xs font-semibold text-gray-600 mb-1">Alternatives:</p>
                  <div class="space-y-1">
                    ${suggestion.alternatives.map(alt => `
                      <p class="text-xs text-gray-600 pl-2 border-l-2 border-primary-200">
                        "${alt}"
                      </p>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    this.suggestionsContainer.innerHTML = `
      <div class="space-y-3">
        <p class="text-sm font-semibold text-gray-700 mb-3">
          ${suggestions.length} ${suggestions.length === 1 ? 'suggestion' : 'suggestions'} found
        </p>
        ${suggestionsHTML}
      </div>
    `;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const editor = new HomeEditor();
  // Simple close behavior for the right-side AI panel (UI-only; analysis still works)
  const closeBtn = document.getElementById('home-ai-close');
  const panel = document.getElementById('home-ai-panel');
  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => {
      panel.classList.add('hidden');
    });
  }
  window.__homeEditor = editor;
});
