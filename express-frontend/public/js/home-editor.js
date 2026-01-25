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

console.log('[HomeEditorJS] ✅ Loaded version v20260122a (normalizeComparable fix + paste double-submit fix)');

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
  try {
    if (window.transliteratorReady) {
      await Promise.resolve(window.transliteratorReady);
    }
    if (typeof window.transliterateViaRunner !== 'function') {
      console.error('[TRANSLITERATOR] transliterateViaRunner is not available');
      return [];
    }
    return await window.transliterateViaRunner(text, mode, limit, signal);
  } catch (error) {
    console.error('[TRANSLITERATOR] Error:', error);
    return [];
  }
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
    // emptyState controls what we show when grammar suggestions are empty.
    // - 'idle': initial guidance before successful analysis
    // - 'no-issues': analysis completed and no corrections found
    this.emptyState = 'idle';
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
    this.limitToastTimer = null;
    
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
    this.activeSuggestionIndex = 0;
    // Guard against double-commit (mobile taps + click, multiple listeners, etc.)
    this.isSelectingSuggestion = false;
    // Prevent dropdown re-opening immediately after a selection (Google-IME style)
    this.justReplacedUntil = 0;
    this.lastReplacedToken = '';

    // Transliteration V2 feature flag (if enabled, we must avoid attaching legacy V1 IME handlers)
    this.translitV2Enabled = !!(window.TRANS_SUGGEST_V2 && window.TransliterationTypeahead && window.HomeEditorAdapter && this.editor);
    
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
    if (this.translitV2Enabled && editorEl) {
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

    // Proofreading toggle: when OFF, we never call /api/submit automatically.
    this.proofreadToggle = document.getElementById('home-proofread-toggle');
    this.proofreadingEnabled = this.proofreadToggle ? !!this.proofreadToggle.checked : true;
    if (this.proofreadToggle) {
      this.proofreadToggle.addEventListener('change', () => {
        this.proofreadingEnabled = !!this.proofreadToggle.checked;
        // Cancel any pending analysis timer when turned off.
        if (!this.proofreadingEnabled && this.analysisTimeout) {
          clearTimeout(this.analysisTimeout);
          this.analysisTimeout = null;
        }
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
          // Always use the dedicated translation endpoint (pure output).
          // IMPORTANT: Do NOT trigger proofreading automatically after translation.
          const response = await apiFetch(
            '/api/gemini/translate',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text }),
            },
            false
          );

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

          const translated =
            (data && (data.translated_text || data.translated)) ||
            '';

          if (translated) {
            // Prevent any immediate scheduled analysis caused by DOM updates.
            this._suppressScheduledAnalysisUntil = Date.now() + 2000;
            this.editor.textContent = translated;
            this.moveCursorToEnd();
            this.updateWordCount();
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
    
    if (!this.translitV2Enabled) {
      // Handle keyboard for IME dropdown (arrow navigation + selection)
      this.editor.addEventListener('keydown', (e) => {
        const key = e.key;
        // Only intercept keys when dropdown is visible
        const dropdownOpen = this.autocompleteBox && !this.autocompleteBox.classList.contains('hidden');
        if (!dropdownOpen) return;

        const handledKeys = new Set([
          'ArrowDown',
          'ArrowUp',
          'Enter',
          'Tab',
          'Escape',
          ' ',
        ]);

        if (handledKeys.has(key) || /^[1-5]$/.test(key)) {
          this.handleKeyDown(e);
        }
      });
    }
    // Hard cap: prevent inserting more words once limit is reached (typing + paste)
    this.editor.addEventListener('beforeinput', (e) => {
      try {
        const type = e.inputType || '';
        // Only care about insertions
        const isInsert =
          type.startsWith('insert') ||
          type === 'insertFromPaste' ||
          type === 'insertParagraph' ||
          type === 'insertLineBreak';
        if (!isInsert) return;

        const text = this.getPlainText();
        const wc = this.countWords(text);
        if (wc < this.maxWords) return;

        // Allow pure whitespace inserts (e.g., formatting artifacts), block actual content.
        const data = typeof e.data === 'string' ? e.data : '';
        const hasNonWs = data ? /\S/.test(data) : true; // if unknown, be safe and block
        if (!hasNonWs) return;

        e.preventDefault();
        this.showWordLimitToast();
      } catch (_e2) {
        // non-fatal
      }
    });
    this.editor.addEventListener('input', () => {
      this.handleInput();
      if (!this.translitV2Enabled) {
        this.showAutocomplete();
      }
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
      // Arrow navigation (Google IME style)
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeSuggestionIndex = Math.min(this.activeSuggestionIndex + 1, Math.min(this.currentSuggestions.length, 5) - 1);
        this.updateSuggestionHighlight();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeSuggestionIndex = Math.max(this.activeSuggestionIndex - 1, 0);
        this.updateSuggestionHighlight();
        return;
      }

      // Space selects top suggestion
      if (e.key === ' ' || e.code === 'Space' || e.keyCode === 32) {
        e.preventDefault();
        // Google IME behavior: Space commits the active suggestion and keeps the space
        const idx = Number.isFinite(this.activeSuggestionIndex) ? this.activeSuggestionIndex : 0;
        this.insertSuggestion(idx, true);
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
      // Enter/Tab commits the active suggestion (no auto-space)
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const idx = Number.isFinite(this.activeSuggestionIndex) ? this.activeSuggestionIndex : 0;
        this.insertSuggestion(idx, false);
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

    // Detect if space was just added (we still enforce word limit in all cases)
    const hasSpaceNow = fullText.length > this.previousText.length && fullText[fullText.length - 1] === ' ';
    if (hasSpaceNow) {
      console.log('[INPUT-HANDLER] Space detected! Calling handleSpaceInInput');
      this.handleSpaceInInput();
    }

    // ALWAYS enforce 200-word cap (space typing previously skipped this, allowing >200 words)
    this.enforceWordLimit();
    this.updateWordCount();
    this.scheduleAutoAnalysis();

    // Update previous text for next comparison (after truncation, if any)
    this.previousText = this.editor.textContent || '';
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

    // Show suggestions per-keystroke while typing an English token.
    // Backend now supports 1-letter queries, so allow length >= 1.
    if (!lastWord || !/^[a-z]+$/i.test(lastWord) || lastWord.length < 1) {
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

    // Debounced API call (fast enough to feel "per letter" without spamming)
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
        this.activeSuggestionIndex = 0;
        this.renderSuggestions(normalized);
      } catch (err) {
        console.error('[AUTOCOMPLETE] Fetch error:', err);
      }
    }, lastWord.length <= 2 ? 60 : 90);
  }

  updateSuggestionHighlight() {
    try {
      if (!this.autocompleteList) return;
      const buttons = Array.from(this.autocompleteList.querySelectorAll('button[data-index]'));
      if (!buttons.length) return;
      const max = Math.min(buttons.length, 5);
      const idx = Math.max(0, Math.min(this.activeSuggestionIndex || 0, max - 1));
      this.activeSuggestionIndex = idx;

      buttons.forEach((btn, i) => {
        const active = i === idx;
        btn.classList.toggle('bg-purple-50', active);
        btn.classList.toggle('border-purple-200', active);
        btn.classList.toggle('hover:bg-gray-50', !active);
        // Update the number badge style
        const badge = btn.querySelector('span[data-badge]');
        if (badge) {
          badge.className =
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ' +
            (active ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200');
        }
      });

      // Ensure active item is visible
      const activeBtn = buttons[idx];
      activeBtn?.scrollIntoView?.({ block: 'nearest' });
    } catch (_e) {
      // ignore
    }
  }

  renderSuggestions(suggestions) {
    if (!this.autocompleteBox) {
      console.error('[AUTOCOMPLETE] Dropdown element not found!');
      return;
    }

    // Normalize + filter out empty/duplicate words (prevents "blank rows" + meaningless duplicates)
    const cleaned = (() => {
      const seen = new Set();
      const out = [];
      for (const item of (suggestions || [])) {
        const w = normalizeTamilWord(typeof item === 'string' ? item : (item.word || item.ta || item.text || item.suggestion || item.value || item));
        if (!w) continue;
        const key = w.normalize ? w.normalize('NFC') : w;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(w);
        if (out.length >= 5) break;
      }
      return out;
    })();

    if (!cleaned.length) {
      // Never show an "empty background" dropdown — just close it.
      this.autocompleteBox.classList.add('hidden');
      const container = this.autocompleteList || this.autocompleteBox.querySelector('#home-autocomplete-list');
      if (container) container.innerHTML = '';
      this.currentSuggestions = [];
      this.currentCaretInfo = null;
      return;
    }

    try {
      const container = this.autocompleteList || this.autocompleteBox.querySelector('#home-autocomplete-list');
      if (!container) {
        console.error('[AUTOCOMPLETE] List container not found in dropdown');
        return;
      }

      // Ensure the data we insert matches what we render.
      this.currentSuggestions = cleaned;

      container.innerHTML = cleaned
        .map((tamilWord, idx) => {
          const active = idx === (this.activeSuggestionIndex || 0);
          return `
          <button type="button"
            class="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border transition ${active ? 'bg-purple-50 border-purple-200' : 'bg-white border-transparent hover:bg-gray-50'}"
            data-index="${idx}"
            aria-label="Select suggestion ${idx + 1}">
            <span data-badge="1" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${active ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'}">
              ${idx + 1}
            </span>
            <span class="text-base font-semibold text-gray-900 flex-1">${tamilWord}</span>
          </button>
        `;
        })
        .join('');

      console.log('[AUTOCOMPLETE] Showing dropdown with', cleaned.length, 'suggestions');
      this.positionAutocomplete();
      this.autocompleteBox.classList.remove('hidden');

      // Attach click handlers (no inline onclick — works for mouse/touchpad reliably)
      Array.from(container.querySelectorAll('button[data-index]')).forEach((btn) => {
        // Prevent mousedown from moving the caret before we read caretInfo
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = Number(btn.getAttribute('data-index') || '0');
          this.activeSuggestionIndex = Number.isFinite(idx) ? idx : 0;
          this.updateSuggestionHighlight();
          // Click commits without auto-space (user keeps typing)
          this.insertSuggestion(this.activeSuggestionIndex, false);
        });
      });

      // Ensure highlight is in sync
      this.updateSuggestionHighlight();
    } catch (err) {
      console.error('[AUTOCOMPLETE] Render error:', err);
    }
  }

  insertSuggestion(index, appendSpace = false) {
    if (this.isSelectingSuggestion) return;
    if (!this.currentSuggestions?.[index]) return;
    this.isSelectingSuggestion = true;
    setTimeout(() => { this.isSelectingSuggestion = false; }, 320);
    
    const suggestion = this.currentSuggestions[index];
    const tamilWord = normalizeTamilWord(suggestion);
    // Prefer a fresh caret read at click-time; fall back to cached caretInfo if focus moved.
    let caretInfo = getEnglishTokenAtCaret(this.editor) || this.currentCaretInfo;
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

    // Expand to cover the full Latin run (handles stale caretInfo + caret-in-middle cases)
    while (start > 0 && /[A-Za-z]/.test(text.charAt(start - 1))) start--;
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
    // Prevent double-submit: paste triggers an input event which also schedules analysis.
    // We suppress the debounced path briefly and run exactly once on next tick.
    this._suppressScheduledAnalysisUntil = Date.now() + 1200;
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
      this.charCount.textContent = `${count} / ${this.maxWords} words${isOverLimit ? ' (limit reached)' : ''}`;
      this.charCount.style.color = isOverLimit ? '#dc2626' : '#6b7280';
    }
  }

  showWordLimitToast() {
    // Lightweight UX: reuse the word counter area (no modal)
    if (!this.charCount) return;
    const original = this.charCount.textContent;
    this.charCount.textContent = `Max ${this.maxWords} words on Home demo. Please sign in for full access.`;
    this.charCount.style.color = '#dc2626';
    if (this.limitToastTimer) clearTimeout(this.limitToastTimer);
    this.limitToastTimer = setTimeout(() => {
      this.limitToastTimer = null;
      // Restore the normal counter (in case user deletes words)
      this.updateWordCount();
    }, 1800);
  }
  
  getPlainText() {
    return this.editor.textContent.trim();
  }
  
  scheduleAutoAnalysis() {
    if (!this.proofreadingEnabled) {
      return;
    }
    if (this._suppressScheduledAnalysisUntil && Date.now() < this._suppressScheduledAnalysisUntil) {
      return;
    }
    // Avoid unnecessary network calls for very short text.
    // (We also guard inside autoAnalyze, but this prevents the /api/submit call from even starting.)
    try {
      const text = this.getPlainText();
      const wc = this.countWords(text);
      if (wc < 5 || text.length < 20) {
        return;
      }
    } catch (_e) {}
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
    const normalizeComparable = (s) => {
      try {
        return String(s || '')
          .normalize('NFC')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/^[\"'“”‘’«»‹›「」『』『』《》〈〉「」『』ʻʼ’‘‚‛„‟\u2018\u2019\u201C\u201D\u201E\u2039\u203A\u00AB\u00BB\u201A\u201B]+/, '')
          .replace(/[\"'“”‘’«»‹›「」『』『』《》〈〉「」『』ʻʼ’‘‚‛„‟\u2018\u2019\u201C\u201D\u201E\u2039\u203A\u00AB\u00BB\u201A\u201B]+$/, '')
          .trim();
      } catch (_e) {
        return String(s || '').replace(/\s+/g, ' ').trim();
      }
    };

    const hashString = (str) => {
      let h = 2166136261;
      const s = String(str || '');
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(16);
    };

    if (Array.isArray(payload?.corrections)) {
      const mapped = payload.corrections.map((c, index) => {
        const original = c.originalText || c.original || '';
        const corrected = c.correction || c.corrected || '';
        const reason = c.reason || '';
        const type = c.type || 'grammar';
        const start = c.start_index ?? c.startIndex ?? c.start ?? '';
        // Use unique key WITHOUT start position to detect true duplicates
        const key = `${normalizeComparable(type).toLowerCase()}|${normalizeComparable(original)}|${normalizeComparable(corrected)}|${normalizeComparable(reason)}`;
        return {
          id: `home-${hashString(key) || index}`,
          original,
          corrected,
          reason,
          type,
          start_index: start,
          alternatives: [],
        };
      });
      // Deduplicate based on ID (which doesn't include position)
      const seen = new Set();
      return mapped.filter((s) => {
        if (!s?.id) return false;
        if (seen.has(s.id)) {
          console.log('[DEDUPE] Removing duplicate suggestion:', s.original, '→', s.corrected);
          return false;
        }
        seen.add(s.id);
        return true;
      });
    }

    // 2) Raw suggestions stored on submission (stringified JSON)
    const raw = payload?.submission?.suggestions ?? payload?.submission?.corrections ?? payload?.suggestions ?? payload?.corrections;
    const list = this.normalizeRawSuggestions(raw);

    const mapped = list
      .map((item, index) => ({
      id: index,
      original: item.original || item.originalText || '',
      corrected: item.corrected || item.correction || item.suggestion || '',
      reason: item.reason || item.description || '',
      type: item.type || 'grammar',
      alternatives: item.alternatives || [],
      }))
      .filter((s) => {
        const o = normalizeComparable(s.original);
        const c = normalizeComparable(s.corrected);
        return o && c && o !== c;
      });

    // Dedupe repeated suggestions (same original/corrected/type/reason)
    const seen = new Set();
    return mapped
      .map((s, idx) => {
        const key = `${normalizeComparable(s.type).toLowerCase()}|${normalizeComparable(s.original)}|${normalizeComparable(s.corrected)}|${normalizeComparable(s.reason)}`;
        return { ...s, id: `home-${hashString(key) || idx}` };
      })
      .filter((s) => {
        if (!s?.id) return false;
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
  }
  
  async autoAnalyze() {
    const text = this.getPlainText();
    const wc = this.countWords(text);
    if (wc < 5 || text.length < 20) {
      this.showInfo('Grammar suggestions require a full sentence.');
      this.lastAnalyzedText = '';
      this.emptyState = 'idle';
      this.displaySuggestions([]);
      return;
    }
    
    // If empty, clear suggestions and reset
    if (!text) {
      this.lastAnalyzedText = '';
      this.emptyState = 'idle';
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
        // Home has a demo mode (no login) via /api/submit server-side. If we still get 401,
        // it means the backend is seeing a token but rejecting it (expired/mismatch).
        if (response.status === 401) {
          this.showError('Session expired. Please login again.');
          return;
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
          const backendMsg = String(resultPayload?.message || resultPayload?.submission?.error || '').trim();
          if (!suggestions.length && backendMsg && /temporarily unavailable|not configured|missing|timeout|provider|gemini|ai/i.test(backendMsg)) {
            this.emptyState = 'idle';
            this.showError(backendMsg);
            this.lastAnalyzedText = text;
            return;
          }
          this.emptyState = suggestions.length ? 'idle' : 'no-issues';
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
      const backendMsg = String(data?.message || data?.submission?.error || '').trim();
      if (!suggestions.length && backendMsg && /temporarily unavailable|not configured|missing|timeout|provider|gemini|ai/i.test(backendMsg)) {
        this.emptyState = 'idle';
        this.showError(backendMsg);
      } else {
        this.emptyState = suggestions.length ? 'idle' : 'no-issues';
        this.displaySuggestions(suggestions);
      }
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

  showInfo(message) {
    if (!this.suggestionsContainer) return;
    const msg = String(message || '').trim();
    this.suggestionsContainer.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <p class="text-sm">${msg || 'Type or paste Tamil text to get AI suggestions'}</p>
      </div>
    `;
  }
  
  showError(message) {
    if (!this.suggestionsContainer) return;
    
    const msg = String(message || '').trim();
    this.suggestionsContainer.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <p class="text-sm text-red-600">${msg || 'Analysis failed. Please try again.'}</p>
      </div>
    `;
  }
  
  displaySuggestions(suggestions) {
    if (!this.suggestionsContainer) return;
    
    // Validate suggestions is an array
    if (!Array.isArray(suggestions)) {
      console.error('[DISPLAY] Suggestions is not an array:', typeof suggestions);
      this.suggestionsContainer.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <p class="text-sm text-red-600">Error displaying suggestions</p>
        </div>
      `;
      return;
    }
    
    // Get current text to check if editor is empty
    const currentText = this.getPlainText().trim();
    
    if (suggestions.length === 0) {
      if (currentText && this.emptyState === 'no-issues') {
        this.suggestionsContainer.innerHTML = `
          <div class="text-center py-8">
            <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg class="w-7 h-7 text-green-700" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <p class="text-sm font-semibold text-gray-900">Looks solid! Keep writing—ProofTamil will help fine-tune as you go</p>
          </div>
        `;
      } else {
        // Default idle guidance
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
        <div class="bg-accent-50 rounded-lg p-4 border-l-4 border-primary-500 mb-3" data-suggestion-id="${suggestion.id || index}">
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
              ${hasCorrection ? `
                <div class="flex gap-2 mt-3 pt-3 border-t border-primary-200">
                  <button 
                    type="button"
                    class="suggestion-apply-btn flex-1 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                    data-index="${index}"
                    data-original="${this.escapeHtml(suggestion.original)}"
                    data-corrected="${this.escapeHtml(suggestion.corrected)}">
                    <svg class="w-4 h-4 inline-block mr-1 mb-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    Apply
                  </button>
                  <button 
                    type="button"
                    class="suggestion-ignore-btn flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                    data-index="${index}">
                    <svg class="w-4 h-4 inline-block mr-1 mb-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                    Ignore
                  </button>
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

    // Attach event listeners for Apply and Ignore buttons
    this.attachSuggestionHandlers(suggestions);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  attachSuggestionHandlers(suggestions) {
    if (!this.suggestionsContainer) return;

    // Apply buttons
    const applyButtons = this.suggestionsContainer.querySelectorAll('.suggestion-apply-btn');
    applyButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(btn.getAttribute('data-index'));
        const original = btn.getAttribute('data-original');
        const corrected = btn.getAttribute('data-corrected');
        this.applySuggestion(index, original, corrected, suggestions);
      });
    });

    // Ignore buttons
    const ignoreButtons = this.suggestionsContainer.querySelectorAll('.suggestion-ignore-btn');
    ignoreButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(btn.getAttribute('data-index'));
        this.ignoreSuggestion(index, suggestions);
      });
    });
  }

  applySuggestion(index, original, corrected, suggestions) {
    if (!this.editor || !original || !corrected) return;
    
    // Validate suggestions array and index
    if (!suggestions || !Array.isArray(suggestions) || index < 0 || index >= suggestions.length) {
      console.error('[APPLY] Invalid suggestion index:', index, 'suggestions length:', suggestions?.length);
      this.showBriefNotification('Invalid suggestion', 'error');
      return;
    }

    // Get current editor content
    const currentText = this.editor.textContent || '';
    
    // Get the suggestion object to access start_index if available
    const suggestion = suggestions[index];
    const startIndex = suggestion?.start_index ?? suggestion?.startIndex ?? suggestion?.start ?? -1;
    const endIndex = suggestion?.end_index ?? suggestion?.endIndex ?? suggestion?.end ?? -1;
    
    let updatedText;
    
    // If we have valid indices, use them for precise replacement
    if (startIndex >= 0 && endIndex > startIndex && startIndex < currentText.length && endIndex <= currentText.length) {
      const textAtPosition = currentText.substring(startIndex, endIndex);
      
      // Verify the text at this position matches the original
      if (textAtPosition === original) {
        updatedText = currentText.substring(0, startIndex) + corrected + currentText.substring(endIndex);
        console.log('[APPLY] Used position-based replacement:', { startIndex, endIndex, original, corrected });
      } else {
        // Position doesn't match, fall back to search
        console.warn('[APPLY] Position mismatch, falling back to search. Expected:', original, 'Found:', textAtPosition);
        updatedText = this.replaceFirstOccurrence(currentText, original, corrected);
      }
    } else {
      // No valid indices, search for the text
      console.log('[APPLY] No valid indices, searching for text:', original);
      updatedText = this.replaceFirstOccurrence(currentText, original, corrected);
    }
    
    if (updatedText === currentText) {
      // Text not found or already replaced, show a gentle notification
      console.warn('[APPLY] Original text not found in editor:', original);
      this.showBriefNotification('Text not found in editor. It may have been edited.', 'warning');
      return;
    }

    // Update editor content
    this.editor.textContent = updatedText;
    this.moveCursorToEnd();
    this.updateWordCount();

    // Remove the applied suggestion from the list
    const updatedSuggestions = suggestions.filter((_, i) => i !== index);
    
    // Show success notification
    this.showBriefNotification('✓ Correction applied', 'success');
    
    // Re-render suggestions without the applied one
    this.displaySuggestions(updatedSuggestions);
    
    // DON'T call scheduleAutoAnalysis() here - it causes unnecessary API calls!
    // User can manually trigger analysis if they want fresh suggestions.
  }

  replaceFirstOccurrence(text, search, replace) {
    if (!search || search.length === 0) return text;
    const index = text.indexOf(search);
    if (index === -1) return text;
    return text.substring(0, index) + replace + text.substring(index + search.length);
  }

  ignoreSuggestion(index, suggestions) {
    // Validate suggestions array and index
    if (!suggestions || !Array.isArray(suggestions) || index < 0 || index >= suggestions.length) {
      console.error('[IGNORE] Invalid suggestion index:', index);
      this.showBriefNotification('Invalid suggestion', 'error');
      return;
    }
    
    // Remove the ignored suggestion from the list
    const updatedSuggestions = suggestions.filter((_, i) => i !== index);
    
    // Show brief notification
    this.showBriefNotification('Suggestion ignored', 'info');
    
    // Re-render suggestions without the ignored one
    this.displaySuggestions(updatedSuggestions);
  }

  showBriefNotification(message, type = 'info') {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300 ${
      type === 'success' ? 'bg-green-600 text-white' :
      type === 'warning' ? 'bg-yellow-600 text-white' :
      type === 'error' ? 'bg-red-600 text-white' :
      'bg-gray-800 text-white'
    }`;
    toast.textContent = message;
    toast.style.opacity = '0';
    
    document.body.appendChild(toast);
    
    // Fade in
    setTimeout(() => { toast.style.opacity = '1'; }, 10);
    
    // Fade out and remove after 2 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { toast.remove(); }, 300);
    }, 2000);
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
  // Back-compat for any legacy inline handlers
  window.homeEditor = editor;
});
