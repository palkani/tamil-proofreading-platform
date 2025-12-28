// Main Workspace Controller

// ============================================
// TAMIL LINGUISTIC FILTERING UTILITIES
// ============================================

/**
 * Tamil dependent vowels (vowel signs that attach to consonants)
 * These cannot be stacked sequentially
 */
const TAMIL_DEP_VOWELS = new Set([
  'ா','ி','ீ','ு','ூ','ெ','ே','ை','ொ','ோ','ௌ'
]);

/**
 * Check if a Tamil word has invalid vowel sequences
 * Two dependent vowels in a row is linguistically invalid
 */
function hasInvalidVowelSequence(word) {
  if (!word) return true;

  for (let i = 1; i < word.length; i++) {
    const prev = word[i - 1];
    const curr = word[i];

    // Two dependent vowels in a row is invalid
    if (TAMIL_DEP_VOWELS.has(prev) && TAMIL_DEP_VOWELS.has(curr)) {
      return true;
    }
  }
  return false;
}

/**
 * Clean Tamil suggestions by filtering out invalid forms
 * - Rejects Latin/digits
 * - Rejects invalid vowel stacking
 * - Rejects overly long expansions for short inputs
 */
function cleanTamilSuggestions(rawSuggestions, tokenLatin) {
  if (!rawSuggestions || rawSuggestions.length === 0) return [];
  
  // For short tokens (1-2 chars), limit to 3 chars max
  // For longer tokens, allow up to 6 chars
  const maxLen = tokenLatin.length <= 2 ? 3 : 6;

  return rawSuggestions.filter(s => {
    const w = (s.word || s.text || '').trim();
    if (!w) return false;

    // Reject Latin / digits (must be pure Tamil)
    if (/[A-Za-z0-9]/.test(w)) return false;

    // Reject invalid vowel stacking
    if (hasInvalidVowelSequence(w)) return false;

    // Reject too-long expansions for short input
    if (w.length > maxLen) return false;

    return true;
  });
}

function getLastToken(text) {
  const match = (text || '').match(/(\S+)$/);
  return match ? match[1] : '';
}

function replaceLastToken(text, replacement) {
  return (text || '').replace(/(\S+)$/, replacement);
}

function getCaretClientRect() {
}

function getTokenAtCaret(text, caretPos) {
  let start = caretPos;
  while (start > 0 && /\S/.test(text[start - 1])) start--;
  let end = caretPos;
  while (end < text.length && /\S/.test(text[end])) end++;
  return { token: text.slice(start, end), start, end };
}

// Tamil phonetic scoring: comprehensive ranking for IME suggestions
function tamilScore(tokenLatin, candidateTamil, meta) {
  // tokenLatin is what user typed (e.g. "tamil")
  // candidateTamil is Tamil output (e.g. "தமிழ்")
  const candLen = candidateTamil.length;
  let score = 0;

  // 1) Boost recommended/confidence if present
  if (meta?.recommended) score += 50;
  if (typeof meta?.confidence === 'number') score += Math.round(meta.confidence * 50);
  // Use API score if available (0-1 range, scale to 0-50)
  if (typeof meta?.score === 'number') score += Math.round(meta.score * 50);

  // 2) Prefer shorter sensible outputs
  score += Math.max(0, 20 - candLen);

  // 3) Tamil common endings (heuristic)
  if (candidateTamil.endsWith('்')) score += 5;   // pure consonant
  if (candidateTamil.endsWith('ம்')) score += 8;
  if (candidateTamil.endsWith('ன்') || candidateTamil.endsWith('ய்')) score += 6;

  // 4) Penalize symbols / latin leakage
  if (/[A-Za-z0-9]/.test(candidateTamil)) score -= 30;

  // 5) Token-specific heuristics (very light)
  const t = tokenLatin.toLowerCase();
  if (t.endsWith('l') && candidateTamil.endsWith('ல்')) score += 8;
  if (t.endsWith('m') && candidateTamil.endsWith('ம்')) score += 10;
  if (t.endsWith('n') && (candidateTamil.endsWith('ன்') || candidateTamil.endsWith('ந்'))) score += 8;

  return score;
}

function rankTamilCandidates(tokenLatin, candidates) {
  if (!candidates || candidates.length === 0) return [];
  
  return [...candidates]
    .map(c => {
      const txt = (c.text || c.word || '').trim();
      if (!txt) return null;
      const originalScore = typeof c.score === 'number' ? c.score : 0;
      
      // Calculate base ranking score
      let rankingScore = tamilScore(tokenLatin, txt, { 
        recommended: c.recommended,
        confidence: c.confidence,
        score: originalScore 
      });
      
      // Strong preference for base syllables (e.g., "மு", "கா", "பி") - 2 chars
      // This ensures "மு" ranks higher than "முஉ", "முஉஉ"
      if (txt.length === 2) {
        rankingScore += 50;
      }
      
      // Penalize long expansions (prefer shorter, cleaner forms)
      rankingScore -= txt.length * 5;
      
      // Use API confidence if present (scaled to 0-30)
      if (typeof originalScore === 'number' && originalScore > 0) {
        rankingScore += Math.round(originalScore * 30);
      }
      
      return {
        ...c,
        text: txt,
        score: originalScore, // Preserve original API score (0-1) for display
        _rankingScore: rankingScore // Internal score for sorting
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0))
    .map(({ _rankingScore, ...rest }) => rest); // Remove internal score, keep original score
}

function getCaretClientRect() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  marker.style.position = 'fixed';
  marker.style.pointerEvents = 'none';
  range.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  const parent = marker.parentNode;
  if (parent) parent.removeChild(marker);
  return rect;
}

const EditorMode = {
  IDLE: 'IDLE',
  IME_TYPING: 'IME_TYPING',
  SUBMIT_PENDING: 'SUBMIT_PENDING',
  SUBMITTING: 'SUBMITTING',
};

async function ensureRunnerLoaded() {
  if (typeof window.transliterateViaRunner === 'function') {
    return;
  }

  if (window.__loadingTranslitRunner) {
    return window.__loadingTranslitRunner;
  }

  window.__loadingTranslitRunner = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/js/transliterator-runner.js";
    script.async = true;

    script.onload = () => {
      console.log("[Translit] runner helper loaded");
      resolve();
    };

    script.onerror = () => {
      console.error("[Translit] Runner JS missing at /js/transliterator-runner.js");
      reject(new Error("runner helper failed to load"));
    };

    document.head.appendChild(script);
  });

  return window.__loadingTranslitRunner;
}

const EditorMode = {
  IDLE: 'IDLE',
  IME_TYPING: 'IME_TYPING',
  SUBMIT_PENDING: 'SUBMIT_PENDING',
  SUBMITTING: 'SUBMITTING',
};

class WorkspaceController {
  constructor() {
    this.getMode = () => {
      const sel = document.getElementById('mode-select');
      return (sel && sel.value) || 'spoken';
    };
    this.editor = null;
    this.suggestionsPanel = null;
    this.currentDraft = null;
    this.saveTimeout = null;
    this.autosaveAuthBlocked = false;
    this.loading = false;
    this.currentMode = 'editor'; // 'list' or 'editor'
    this.drafts = [];
    
    // Auto-analysis state
    this.analysisTimeout = null;
    this.abortController = null;
    this.lastAnalyzedText = '';
    this.isAnalyzing = false;
    this.autoAnalysisEnabled = true; // Enable auto-analysis by default
    this.proofreadHighlights = null;
    this.proofreadSuggestions = [];
    this.proofreadSnapshots = [];
    // Transliteration typeahead state
    this.translitCache = new Map();
    this.translitAbort = null;
    this.translitTimer = null;
    this.lastRunnerSuggestions = [];
    this.editorMode = EditorMode.IDLE;
    this.imeActive = false;
    this.currentSuggestions = [];
    this.translitDropdownOpen = false;
    this.submitAbort = null;
    this.submitTimer = null;
    this.lastSubmittedHash = '';
    this.lastSubmittedCount = 0;
    this.DEBUG_IME = true;
    this.lastRunnerSuggestions = [];
    this.ghostTextMarker = null; // Inline ghost text span element
    this.currentTokenInfo = null; // { token, start, end } at caret
    this.previousToken = null; // Track previous token to avoid duplicate calls
    this.imeDebounceTimer = null; // Debounce timer for IME fetching
    this.activeSuggestionIndex = 0; // For keyboard navigation
    
    // PART D: Prefix cache for suggestions
    this.suggestionCache = new Map(); // key: "mode:token", value: { suggestions, timestamp }
    this.CACHE_TTL_MS = 2000; // 2 seconds

    this.init();
  }

  // Unified API helper: cookie-based auth only
  async apiFetch(url, options = {}, requireAuth = true) {
    const headers = new Headers(options.headers || {});

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (requireAuth && response.status === 401) {
      console.warn('[AUTH] Session expired, redirecting to /login');
      window.location.href = '/login';
      throw new Error('unauthorized');
    }

    return response;
  }

  async fetchRunnerSuggestions(params) {
    // Phase 5: Disable legacy IME when TipTap is active
    if (window.USE_TIPTAP_EDITOR) {
      return []; // TipTap handles IME via extension
    }
    
    const { q = '', limit = 8, mode = 'spoken' } = params || {};
    
    // PART D: Check prefix cache first
    const cacheKey = `${mode}:${q}`;
    const cached = this.suggestionCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      if (this.DEBUG_IME) console.debug('[IME] cache hit', { q, cacheKey });
      this.currentSuggestions = cached.suggestions;
      this.lastRunnerSuggestions = cached.suggestions;
      this.imeActive = true;
      this.editorMode = EditorMode.IME_TYPING;
      if (cached.suggestions.length > 0) {
        this.showGhostText(cached.suggestions[0].text);
      }
      if (this.renderTranslitSuggestions) {
        this.renderTranslitSuggestions(q, cached.suggestions);
      }
      return cached.suggestions;
    }
    
    console.log('IME fetchRunnerSuggestions CALLED', { q });
    const qs = new URLSearchParams({ q, limit, mode, _ts: Date.now(), _r: Math.random().toString(36).slice(2) }).toString();
    const url = `/api/transliterate/suggest?${qs}`;
    if (this.DEBUG_IME) console.debug('IME GET:', url);

    try {
      // PART D: AbortController - abort should already be done in debounce, but double-check
      // Create new abort controller for this request
      this.translitAbort = new AbortController();

      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: this.translitAbort.signal,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });

      if (res.status === 304) {
        if (this.DEBUG_IME) console.debug('[IME] suggest 304 - reusing lastSuggestions', { q });
        this.currentSuggestions = this.lastRunnerSuggestions;
        this.imeActive = true;
        this.editorMode = EditorMode.IME_TYPING;
      if (this.renderTranslitSuggestions) {
        this.renderTranslitSuggestions(q, this.lastRunnerSuggestions);
      }
      return this.lastRunnerSuggestions;
      }

      if (!res.ok) {
        console.error('[Translit] proxy returned non-200', res.status);
        return [];
      }

      const text = await res.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (err) {
          console.error('[Translit] failed to parse JSON', err);
        }
      }
      const raw = (data && data.suggestions) || data || [];
      const rawSuggestions = (raw || [])
        .map((s) => ({
          text: s.ta || s.word || s.text || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
        .filter((s) => s.text);
      
      // PART 1: Clean suggestions - filter out invalid Tamil forms
      const cleaned = cleanTamilSuggestions(rawSuggestions, q);
      
      // Fallback: if everything filtered out, keep only first raw item as safe fallback
      const usable = cleaned.length > 0 ? cleaned : rawSuggestions.slice(0, 1);
      
      // PART 1: Rank suggestions with Tamil phonetic ranking (prefers base syllables)
      const rankedSuggestions = rankTamilCandidates(q, usable);
      this.lastRunnerSuggestions = rankedSuggestions;
      this.currentSuggestions = rankedSuggestions;
      this.activeSuggestionIndex = 0;
      this.imeActive = true;
      this.editorMode = EditorMode.IME_TYPING;

      // PART D: Store in cache
      this.suggestionCache.set(cacheKey, {
        suggestions: rankedSuggestions,
        timestamp: Date.now(),
      });

      // Show ghost text for best suggestion
      if (rankedSuggestions.length > 0) {
        this.showGhostText(rankedSuggestions[0].text);
      }

      if (this.renderTranslitSuggestions) {
        this.renderTranslitSuggestions(q, rankedSuggestions);
      }
      return rankedSuggestions;
    } catch (err) {
      // Ignore abort errors (expected behavior)
      if (err.name === 'AbortError') {
        if (this.DEBUG_IME) console.debug('[IME] request aborted', { q });
        return [];
      }
      console.error('[Translit] fetchRunnerSuggestions failed', err);
      return [];
    }
  }

  /**
   * Phase 7: Helper methods to abstract editor access (works with both legacy and TipTap)
   */
  getEditorText() {
    if (window.USE_TIPTAP_EDITOR && tiptapWorkspaceEditor) {
      return tiptapWorkspaceEditor.getText();
    }
    // TamilEditor stores the editor element in this.editor.editor
    if (this.editor && this.editor.editor) {
      return this.editor.editor.textContent || '';
    }
    // Fallback: try getPlainText if it exists
    if (this.editor && typeof this.editor.getPlainText === 'function') {
      return this.editor.getPlainText();
    }
    return '';
  }

  getEditorHTML() {
    if (window.USE_TIPTAP_EDITOR && tiptapWorkspaceEditor) {
      return tiptapWorkspaceEditor.getHTML();
    }
    return this.editor ? (this.editor.getHTML ? this.editor.getHTML() : '') : '';
  }

  setEditorContent(html) {
    if (window.USE_TIPTAP_EDITOR && tiptapWorkspaceEditor) {
      tiptapWorkspaceEditor.commands.setContent(html);
      return;
    }
    if (this.editor && this.editor.setContent) {
      this.editor.setContent(html);
    } else if (this.editor && this.editor.innerHTML !== undefined) {
      this.editor.innerHTML = html;
    }
  }

  init() {
    // Initialize editor (only if TipTap is not active)
    if (window.USE_TIPTAP_EDITOR) {
      // Skip legacy editor initialization when TipTap is active
      console.log('[TipTap Migration] Skipping legacy editor init (TipTap active)');
      return;
    }

    const editorElement = document.getElementById('editor');
    if (editorElement) {
      this.editor = new TamilEditor(editorElement);
      this.editor.onChange = () => {
        console.log("[IME] TamilEditor onChange callback triggered");
        this.handleEditorChange();
      };
      console.log("[IME] Editor initialized, onChange callback set");
      this.editorElement = editorElement;
      editorElement.addEventListener('scroll', () => this.repositionTranslitDropdown());
      editorElement.addEventListener('blur', () => this.clearTranslitSuggestions());
      window.addEventListener('resize', () => this.repositionTranslitDropdown());
      this.editorElement.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    // Transliteration V2 (feature-flagged)
    if (window.TRANS_SUGGEST_V2 && window.TransliterationTypeahead && window.WorkspaceEditorAdapter && editorElement) {
      this.translitTypeahead = new window.TransliterationTypeahead(
        new window.WorkspaceEditorAdapter(editorElement),
        {
          getMode: () => this.getMode(),
        }
      );
    }

    // Proofread V2 highlights (feature-flagged)
    if (window.PROOFREAD_V2 && window.ProofreadHighlights && editorElement) {
      this.proofreadHighlights = new window.ProofreadHighlights(editorElement);
    }

    // IME transliteration (runner-backed); enable whenever the helper exists
    if (window.IMETypeahead && editorElement) {
      const adapter = {
        getSelectionToken: () => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return '';
          const range = sel.getRangeAt(0);
          const node = range.startContainer;
          const text = node.textContent || '';
          const offset = range.startOffset;
          const before = text.slice(0, offset);
          const match = before.match(/([A-Za-z]+)$/);
          return match ? match[1] : '';
        },
        replaceToken: (replacement) => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          const node = range.startContainer;
          const text = node.textContent || '';
          const offset = range.startOffset;
          const before = text.slice(0, offset);
          const match = before.match(/([A-Za-z]+)$/);
          if (!match) return;
          const start = offset - match[1].length;
          const newText = text.slice(0, start) + replacement + text.slice(offset);
          node.textContent = newText;
          const newOffset = start + replacement.length;
          const newRange = document.createRange();
          newRange.setStart(node, Math.min(newOffset, node.textContent.length));
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        },
        getCaretRect: () => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return null;
          const range = sel.getRangeAt(0).cloneRange();
          range.collapse(true);
          const rects = range.getClientRects();
          return rects.length ? rects[0] : null;
        },
      };
      this.imeTypeahead = new window.IMETypeahead(adapter, { mode: 'spoken' });
      editorElement.addEventListener('input', () => this.imeTypeahead.onInput());
      editorElement.addEventListener('keydown', (e) => {
        if (this.imeTypeahead && this.imeTypeahead.handleKey(e, null)) {
          e.preventDefault();
        }
      });
    }

    // Initialize suggestions panel
    const container = document.getElementById('suggestions-container');
    const summary = document.getElementById('suggestions-summary');
    const acceptAllBtn = document.getElementById('accept-all-btn');
    
    if (container && summary && acceptAllBtn) {
      this.suggestionsPanel = new SuggestionsPanel(container, summary, acceptAllBtn);
      this.suggestionsPanel.onAcceptSuggestion = () => this.handleSuggestionAccepted();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Update status displays
    this.updateWordCount();
    this.updateAcceptedCount();
    
    // Check for URL hash to open specific draft
    this.checkUrlHash();
    
    // Start in editor mode
    this.showEditor();
  }
  
  checkUrlHash() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#draft-')) {
      const draftId = parseInt(hash.replace('#draft-', ''));
      if (draftId && !isNaN(draftId)) {
        console.log('Opening draft from URL hash:', draftId);
        // Open the draft after a brief delay to ensure everything is initialized
        setTimeout(() => {
          this.openDraft(draftId);
        }, 100);
      }
    }
  }

  setupEventListeners() {
    // Accept all button
    const acceptAllBtn = document.getElementById('accept-all-btn');
    if (acceptAllBtn) {
      acceptAllBtn.addEventListener('click', () => this.acceptAllSuggestions());
    }

    // Draft title
    const titleInput = document.getElementById('draft-title');
    if (titleInput) {
      titleInput.addEventListener('input', () => this.scheduleSave());
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // New Draft button
    const newDraftBtn = document.getElementById('new-draft-btn');
    if (newDraftBtn) {
      newDraftBtn.addEventListener('click', () => this.createNewDraft());
    }

    // Create First Draft button
    const createFirstDraftBtn = document.getElementById('create-first-draft-btn');
    if (createFirstDraftBtn) {
      createFirstDraftBtn.addEventListener('click', () => this.createNewDraft());
    }

    // Show Drafts button
    const showDraftsBtn = document.getElementById('show-drafts-btn');
    if (showDraftsBtn) {
      showDraftsBtn.addEventListener('click', () => this.showDraftsList());
    }

    // Translate English to Tamil button
    const translateBtn = document.getElementById('translate-english-btn');
    if (translateBtn) {
      translateBtn.addEventListener('click', () => this.translateEnglishToTamil());
    }
  }

  /**
   * PART B: Safe token extraction - get last Latin token from caret position
   * DEPRECATED: Direct token extraction is now done in handleEditorChange
   */
  getLastLatinToken() {
    const text = this.getEditorText() || '';
    const caretPos = (this.editor && this.editor.getCursorPosition && this.editor.getCursorPosition()) || text.length;
    const tokenInfo = getTokenAtCaret(text, caretPos);
    const { token } = tokenInfo;
    
    if (!token) return '';
    
    // Normalize: trim and lowercase
    const normalized = token.trim().toLowerCase();
    
    // Return only if it's Latin-only
    if (/^[a-z]+$/.test(normalized)) {
      return normalized;
    }
    
    return '';
  }

  handleEditorChange() {
    console.log("[IME] handleEditorChange CALLED");
    this.updateWordCount();
    this.scheduleSave();
    
    // Phase 5: Disable legacy IME when TipTap is active
    if (window.USE_TIPTAP_EDITOR) {
      console.log("[IME] blocked: TipTap editor active");
      return; // TipTap handles IME via extension
    }
    
    // Check if editor is available
    if (!this.editor) {
      console.warn("[IME] editor not available");
      return;
    }
    
    console.log("[IME] editor available, proceeding with token extraction");
    
    // PART B: Extract and normalize token
    const text = this.getEditorText() || '';
    console.log("[IME] getEditorText returned:", text);
    
    // Get cursor position - TamilEditor stores editor element in this.editor.editor
    let caretPos = text.length;
    if (this.editor && typeof this.editor.getCursorPosition === 'function') {
      caretPos = this.editor.getCursorPosition() || text.length;
    } else if (this.editorElement) {
      // Fallback: try to get cursor position from selection
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        caretPos = range.startOffset;
      }
    }
    
    const tokenInfo = getTokenAtCaret(text, caretPos);
    const { start, end, token } = tokenInfo;
    
    // Normalize token
    const lastToken = token ? token.trim().toLowerCase() : '';
    const isLatinOnly = lastToken && /^[a-z]+$/.test(lastToken);
    
    console.log("[IME] handleEditorChange called", { text: text.substring(0, 50), caretPos, token, lastToken, isLatinOnly });
    
    // PART A: Block only if token is empty or non-Latin
    if (!lastToken || lastToken.length === 0 || !isLatinOnly) {
      console.debug("[IME] blocked:", { reason: !lastToken ? 'empty token' : !isLatinOnly ? 'non-latin' : 'unknown', lastToken });
      // Clear IME state
      this.clearGhostText();
      this.imeActive = false;
      this.editorMode = EditorMode.IDLE;
      this.currentTokenInfo = null;
      this.clearTranslitSuggestions();
      this.scheduleSubmitThrottled(text);
      return;
    }
    
    // Token is valid (Latin-only, any length >= 1)
    // PART A: Determine IME mode: char (length === 1) or word (length >= 2)
    const imeMode = lastToken.length === 1 ? 'char' : 'word';
    
    // Update current token info
    const tokenInfoChanged = !this.currentTokenInfo || 
      this.currentTokenInfo.token !== lastToken ||
      this.currentTokenInfo.start !== start ||
      this.currentTokenInfo.end !== end;
    
    if (tokenInfoChanged) {
      this.clearGhostText();
    }
    
    this.currentTokenInfo = { token: lastToken, start, end };
    this.imeActive = true;
    this.editorMode = EditorMode.IME_TYPING;
    
    // PART C: Debounce that cannot starve - clear previous timer
    if (this.imeDebounceTimer) {
      clearTimeout(this.imeDebounceTimer);
      this.imeDebounceTimer = null;
    }
    
    // PART C: ONLY place where fetch() is called - inside debounce
    this.imeDebounceTimer = setTimeout(() => {
      this.imeDebounceTimer = null;
      
      // PART D: Abort previous request ONLY INSIDE debounce, right before starting new fetch
      if (this.translitAbort) {
        this.translitAbort.abort();
        if (this.DEBUG_IME) console.debug('[IME] aborted previous request before new fetch');
      }
      
      // Update previousToken only when fetch actually fires
      // Re-extract token to ensure we have the latest
      const text = this.getEditorText() || '';
      const caretPos = (this.editor && this.editor.getCursorPosition && this.editor.getCursorPosition()) || text.length;
      const tokenInfo = getTokenAtCaret(text, caretPos);
      const currentToken = tokenInfo.token ? tokenInfo.token.trim().toLowerCase() : '';
      const isValidLatin = currentToken && /^[a-z]+$/.test(currentToken);
      
      if (currentToken && currentToken.length >= 1 && isValidLatin) {
        const currentMode = currentToken.length === 1 ? 'char' : 'word';
        this.previousToken = currentToken;
        console.log("[IME] suggest fired - calling API", { token: currentToken, mode: currentMode, text: text.substring(0, 50) });
        this.fetchRunnerSuggestions({ q: currentToken, limit: 8, mode: currentMode });
      } else {
        console.log("[IME] blocked: token became invalid during debounce", { token: currentToken, isValidLatin, text: text.substring(0, 50) });
      }
    }, 300);
  }

  // DEPRECATED: Use getTokenAtCaret instead
  // Keeping for backward compatibility but should be removed
  getCurrentWord() {
    const text = this.getEditorText() || '';
    const caretPos = (this.editor.getCursorPosition && this.editor.getCursorPosition()) || text.length;
    const { token } = getTokenAtCaret(text, caretPos);
    return token || '';
  }

  renderTranslitSuggestions(word, suggestions) {
    // Phase 5: Disable legacy IME popup when TipTap is active
    if (window.USE_TIPTAP_EDITOR) {
      return; // TipTap handles IME inline via decorations
    }
    
    const box = document.getElementById('translit-suggest-box');
    const status = document.getElementById('translit-suggest-status');
    const list = document.getElementById('translit-suggest-list');
    if (!box || !status || !list) return;

    list.innerHTML = '';

    if (!this.imeActive || !word || !suggestions || suggestions.length === 0) {
      status.textContent = word ? `No suggestions for "${word}"` : 'Type English to see Tamil suggestions…';
      box.classList.toggle('hidden', true);
      this.translitDropdownOpen = false;
      return;
    }

    status.textContent = `Suggestions for "${word}"`;
    box.classList.remove('hidden');
    // Position and styling will be set by repositionTranslitDropdown
    // This ensures proper spacing to never hide typed text

    if (!suggestions.length) {
      const li = document.createElement('li');
      li.className = 'flex px-2 py-1 text-sm text-gray-500';
      li.textContent = 'No suggestions found';
      list.appendChild(li);
      this.translitDropdownOpen = false;
      return;
    }

    this.translitDropdownOpen = true;
    suggestions.slice(0, 5).forEach((sugg, idx) => {
      const li = document.createElement('li');
      li.dataset.index = idx;
      li.className = 'flex items-center justify-between px-3 py-2 rounded cursor-pointer';
      if (idx === this.activeSuggestionIndex) {
        li.className += ' bg-purple-100';
      } else {
        li.className += ' hover:bg-purple-50';
      }
      li.innerHTML = `
        <span class="font-semibold text-purple-700">${sugg.text || sugg.word}</span>
        <span class="text-xs text-gray-500">${Math.round((sugg.score || 0) * 100)}%</span>
      `;
      li.addEventListener('click', () => {
        this.acceptSuggestion(idx);
      });
      list.appendChild(li);
    });
    this.highlightActiveSuggestion();
    this.repositionTranslitDropdown();
  }

  highlightActiveSuggestion() {
    const list = document.getElementById('translit-suggest-list');
    if (!list) return;
    const items = list.querySelectorAll('li');
    items.forEach((li, idx) => {
      if (idx === this.activeSuggestionIndex) {
        li.className = 'flex items-center justify-between px-3 py-2 rounded cursor-pointer bg-purple-100';
      } else {
        li.className = 'flex items-center justify-between px-3 py-2 rounded cursor-pointer hover:bg-purple-50';
      }
    });
  }

  acceptSuggestion(index) {
    if (!this.currentSuggestions || !this.currentSuggestions[index]) return;
    const suggestion = this.currentSuggestions[index];
    this.replaceTokenAtCaret(suggestion.text, false);
  }

  acceptSuggestion(index) {
    if (!this.currentSuggestions || !this.currentSuggestions[index]) return;
    const suggestion = this.currentSuggestions[index];
    this.replaceTokenAtCaret(suggestion.text, false);
  }

  // Keyboard navigation handler
  handleKeyDown(e) {
    if (!this.imeActive || !this.currentSuggestions || this.currentSuggestions.length === 0) {
      // If not in IME mode, handle space/enter/punctuation normally
      if (e.key === ' ' || e.key === 'Enter' || e.key === '.' || e.key === ',' || e.key === ';') {
        this.clearGhostText();
        this.clearTranslitSuggestions();
        this.imeActive = false;
        this.editorMode = EditorMode.IDLE;
      }
      return false;
    }

    // IME keyboard shortcuts
    switch (e.key) {
      case 'Tab':
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (this.currentSuggestions[this.activeSuggestionIndex]) {
          const appendSpace = e.key === 'Enter';
          const suggestion = this.currentSuggestions[this.activeSuggestionIndex];
          this.replaceTokenAtCaret(suggestion.text, appendSpace);
        }
        return true;

      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.activeSuggestionIndex = Math.min(
          this.activeSuggestionIndex + 1,
          this.currentSuggestions.length - 1
        );
        this.highlightActiveSuggestion();
        // Update ghost text
        if (this.currentSuggestions[this.activeSuggestionIndex]) {
          this.showGhostText(this.currentSuggestions[this.activeSuggestionIndex].text);
        }
        return true;

      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.activeSuggestionIndex = Math.max(this.activeSuggestionIndex - 1, 0);
        this.highlightActiveSuggestion();
        // Update ghost text
        if (this.currentSuggestions[this.activeSuggestionIndex]) {
          this.showGhostText(this.currentSuggestions[this.activeSuggestionIndex].text);
        }
        return true;

      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.clearGhostText();
        this.clearTranslitSuggestions();
        this.imeActive = false;
        this.editorMode = EditorMode.IDLE;
        this.currentTokenInfo = null;
        return true;

      case ' ':
        // Space commits current suggestion
        e.preventDefault();
        e.stopPropagation();
        if (this.currentSuggestions[this.activeSuggestionIndex]) {
          const suggestion = this.currentSuggestions[this.activeSuggestionIndex];
          this.replaceTokenAtCaret(suggestion.text, true); // Append space
        } else {
          // If no selection, just close IME
          this.clearGhostText();
          this.clearTranslitSuggestions();
          this.imeActive = false;
          this.editorMode = EditorMode.IDLE;
        }
        return true;

      default:
        // Let other keys through (typing continues)
        return false;
    }
  }

  // Show ghost text (inline suggestion) after the current token
  showGhostText(suggestionText) {
    this.clearGhostText();
    if (!this.currentTokenInfo || !suggestionText || !this.editorElement) return;
    
    try {
      // Find the text node at the end of the token
      const { end } = this.currentTokenInfo;
      const walker = document.createTreeWalker(
        this.editorElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let textNode = null;
      let charCount = 0;
      
      while ((textNode = walker.nextNode())) {
        const nodeLength = textNode.textContent.length;
        if (charCount + nodeLength >= end) {
          // Found the text node containing the end position
          const offset = end - charCount;
          
          const range = document.createRange();
          range.setStart(textNode, Math.min(offset, nodeLength));
          range.collapse(true);
          
          const marker = document.createElement('span');
          marker.id = 'ime-ghost-text';
          marker.className = 'ime-ghost-text';
          marker.textContent = suggestionText;
          marker.style.color = '#9ca3af'; // gray-400
          marker.style.opacity = '0.6';
          marker.style.pointerEvents = 'none';
          marker.style.userSelect = 'none';
          marker.contentEditable = 'false';
          
          range.insertNode(marker);
          this.ghostTextMarker = marker;
          
          // Move cursor back before ghost text
          const sel = window.getSelection();
          const newRange = document.createRange();
          newRange.setStartBefore(marker);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          
          return;
        }
        charCount += nodeLength;
      }
      
      // Fallback: insert at current selection end
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(false);
        
        const marker = document.createElement('span');
        marker.id = 'ime-ghost-text';
        marker.className = 'ime-ghost-text';
        marker.textContent = suggestionText;
        marker.style.color = '#9ca3af';
        marker.style.opacity = '0.6';
        marker.style.pointerEvents = 'none';
        marker.style.userSelect = 'none';
        marker.contentEditable = 'false';
        
        range.insertNode(marker);
        this.ghostTextMarker = marker;
        
        const newRange = document.createRange();
        newRange.setStartBefore(marker);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    } catch (err) {
      console.warn('[IME] Failed to show ghost text', err);
    }
  }

  clearGhostText() {
    if (this.ghostTextMarker && this.ghostTextMarker.parentNode) {
      this.ghostTextMarker.parentNode.removeChild(this.ghostTextMarker);
    }
    this.ghostTextMarker = null;
  }

  clearTranslitSuggestions() {
    // Phase 5: Disable legacy IME popup when TipTap is active
    if (window.USE_TIPTAP_EDITOR) {
      return; // TipTap handles IME inline via decorations
    }
    
    this.clearGhostText();
    const box = document.getElementById('translit-suggest-box');
    const status = document.getElementById('translit-suggest-status');
    const list = document.getElementById('translit-suggest-list');
    if (!box || !status || !list) return;
    status.textContent = 'Type English to see Tamil suggestions…';
    list.innerHTML = '';
    box.classList.add('hidden');
    this.translitDropdownOpen = false;
    this.currentSuggestions = [];
    this.activeSuggestionIndex = 0;
  }

  repositionTranslitDropdown() {
    // Phase 5: Disable legacy IME popup when TipTap is active
    if (window.USE_TIPTAP_EDITOR) {
      return; // TipTap handles IME inline via decorations
    }
    
    if (!this.translitDropdownOpen || !this.imeActive) return;
    const box = document.getElementById('translit-suggest-box');
    if (!box) return;
    const rect = getCaretClientRect();
    if (!rect) {
      box.classList.add('hidden');
      return;
    }
    if (this.DEBUG_IME) console.debug('[IME POSITION]', rect);
    
    // Calculate line height (use a reasonable default if not available)
    const lineHeight = rect.height || 24; // Default to 24px if height is 0
    const minOffset = lineHeight + 8; // Always position below the line with extra spacing
    
    // Default: position below the line with minimum offset to never hide text
    let top = rect.bottom + minOffset;
    let left = rect.left;

    box.style.position = 'fixed';
    box.style.zIndex = 99999;
    box.style.minWidth = '180px';
    box.style.maxHeight = '240px';
    box.style.overflowY = 'auto';
    box.style.background = 'white';
    box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.08)';
    box.style.visibility = 'hidden';
    box.classList.remove('hidden');

    // Measure actual box height after it's rendered
    const height = box.offsetHeight || 200; // Default estimate
    
    // Only flip above if there's not enough space below AND it would overlap the text
    // But always ensure we never overlap the text line itself
    if (top + height > window.innerHeight - 8) {
      // Position above, but make sure it's well above the text line
      const topAbove = rect.top - height - minOffset;
      if (topAbove >= 8) {
        top = topAbove;
      } else {
        // If even above doesn't fit, stick to below but limit height
        box.style.maxHeight = `${window.innerHeight - top - 16}px`;
      }
    }

    box.style.left = `${left}px`;
    box.style.top = `${Math.max(8, top)}px`;
    box.style.visibility = 'visible';
  }

  // Replace token at caret position with replacement
  replaceTokenAtCaret(replacement, appendSpace = false) {
    if (!this.currentTokenInfo || !replacement) return;
    const { token, start, end } = this.currentTokenInfo;
    const text = this.getEditorText() || '';
    const replacementText = replacement + (appendSpace ? ' ' : '');
    const newText = text.slice(0, start) + replacementText + text.slice(end);
    this.editor.setText(newText);
    // Set cursor after replacement
    const newPos = start + replacementText.length;
    this.editor.setCursorPosition(newPos);
    this.clearGhostText();
    this.clearTranslitSuggestions();
    this.imeActive = false;
    this.editorMode = EditorMode.IDLE;
    this.currentTokenInfo = null;
  }

  replaceLastWord(word, replacement) {
    if (!word || !replacement) return;
    const text = this.getEditorText();
    const newText = replaceLastToken(text, replacement);
    this.editor.setText(newText);
    const range = document.createRange();
    range.selectNodeContents(this.editor.editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    this.clearGhostText();
    this.clearTranslitSuggestions();
  }

  replaceTokenInText(fullText, token, replacement, startIndex) {
    if (!token || !replacement) return fullText;
    // Use start index when available to be precise
    if (typeof startIndex === 'number' && startIndex >= 0) {
      return fullText.slice(0, startIndex) + replacement + fullText.slice(startIndex + token.length);
    }
    // Fallback: replace first occurrence
    return fullText.replace(token, replacement);
  }

  // DEPRECATED: Old space-based transliteration logic
  // New IME flow uses handleEditorChange() -> fetchRunnerSuggestions() -> renderTranslitSuggestions()
  // This method is kept for backward compatibility but is no longer called in the main flow
  updateTranslitSuggestions() {
    // This method used to trigger on space, but now we use per-keystroke detection
    // If needed, call handleEditorChange() instead
    console.warn('[IME] updateTranslitSuggestions() is deprecated, use handleEditorChange() flow');
  }
  
  scheduleAutoAnalysis() {
    // deprecated in favor of scheduleSubmitThrottled
  }

  scheduleSubmitThrottled(text) {
    if (this.imeActive || this.editorMode === EditorMode.IME_TYPING) {
      if (this.DEBUG_IME) console.debug('[SUBMIT] skipped (IME active)');
      return;
    }
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount < 10) {
      return;
    }
    if (this.translitDropdownOpen) {
      if (this.DEBUG_IME) console.debug('[SUBMIT] skipped (dropdown open)');
      return;
    }
    const hash = (text || '').trim();
    if (hash && hash === this.lastSubmittedHash) {
      if (this.DEBUG_IME) console.debug('[SUBMIT] skipped (same hash)');
      return;
    }

    if (this.submitTimer) clearTimeout(this.submitTimer);
    const shouldBump = this.lastSubmittedCount === 0 || wordCount >= this.lastSubmittedCount + 10;
    const delay = 1200;
    this.submitTimer = setTimeout(() => {
      this.runAutoSubmit(hash, wordCount);
    }, delay);
    if (this.DEBUG_IME) console.debug('[SUBMIT] scheduled', { wordCount, shouldBump });
  }

  async runAutoSubmit(hash, wordCount) {
    // Phase 7: Use helper method that works with both legacy and TipTap
    const text = (this.getEditorText() || '').trim();
    if (text !== hash) {
      return;
    }
    if (wordCount < 10) return;
    if (this.translitDropdownOpen) return;

    if (this.submitAbort) this.submitAbort.abort();
    this.submitAbort = new AbortController();
    if (this.DEBUG_IME) console.debug('[SUBMIT] sending', { wordCount });
    try {
      const response = await this.apiFetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, save_draft: false }),
        signal: this.submitAbort.signal,
      });
      const bodyText = await response.text();
      if (!response.ok) {
        console.error('[SUBMIT] failed', response.status);
        return;
      }
      this.lastSubmittedHash = hash;
      this.lastSubmittedCount = wordCount;
      if (this.DEBUG_IME) console.debug('[SUBMIT] success', { wordCount, body: bodyText });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[SUBMIT] error', err);
    }
  }
  
  async autoAnalyze() {
    const text = this.getEditorText().trim();
    
    // Skip if text is too short (minimum 5 words or 20 characters)
    const wordCount = countWords(text);
    if (wordCount < 5 || text.length < 20) {
      this.updateAnalysisStatus('');
      this.showNotification('Grammar suggestions require a full sentence.', 'info');
      return;
    }
    
    // Skip if text hasn't changed since last analysis
    if (text === this.lastAnalyzedText) {
      return;
    }
    
    // Cancel any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.isAnalyzing = true;
    this.abortController = new AbortController();
    this.updateAnalysisStatus('analyzing');
    
    try {
      const response = await this.apiFetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, save_draft: false }),
        signal: this.abortController.signal
      });
      
      let data = await response.json();
      if (response.status === 202 || (data.submission && data.submission.status && data.submission.status.toLowerCase() === 'pending')) {
        const submissionId = data.submission?.id;
        console.log('[GEMINI] submit pending, starting poll', submissionId);
        data = await this.pollSubmission(submissionId);
      } else if (!response.ok) {
        throw new Error('Failed to analyze text');
      }
      
      this.lastAnalyzedText = text;
      
      // Debug: Log the API response
      console.log('[AI Debug] API Response:', JSON.stringify(data, null, 2));
      
      // Proofread V2 normalize + highlight
      if (window.PROOFREAD_V2 && window.normalizeProofreadResponse) {
        const norm = window.normalizeProofreadResponse(data, text);
        this.proofreadSuggestions = norm;
        if (this.proofreadHighlights) {
          this.proofreadHighlights.clear();
          this.proofreadHighlights.underline(norm);
        }
      }

      // Map backend response format to suggestions
      // API can return suggestions at different levels: submission.suggestions (preferred), result.suggestions, corrections, or suggestions
      const corrections =
        data.submission?.suggestions ||
        data.result?.suggestions ||
        data.corrections ||
        data.suggestions ||
        [];
      console.log('[AI Debug] Extracted corrections:', corrections.length, 'items');
      const geminiSuggestions = corrections
        // FILTER: Only include suggestions where original ≠ corrected (safety filter)
        .filter(result => {
          const original = result.original || result.originalText || '';
          const corrected = result.corrected || result.correction || '';
          return original && corrected && original !== corrected;
        })
        .map((result, index) => {
          // Map backend fields to frontend expected format
          const original = result.original || result.originalText || '';
          const corrected = result.corrected || result.correction || '';
          const reason = result.reason || result.description || result.title || '';
          
          console.log('[AI Debug] Mapping suggestion:', { original, corrected, reason, type: result.type });
          
          return {
            id: `gemini-${result.id || index}-${Date.now()}`,
            title: reason || 'Grammar Suggestion',
            description: reason,
            type: result.type || 'grammar',
            preview: original && corrected ? `${original} → ${corrected}` : corrected || original || '',
            sourceText: original,
            onApply: original && corrected ? () => {
              const currentText = this.getEditorText();
              const { text: newText, changed } = applyReplacement(currentText, original, corrected, result.start_index);
              
              if (changed) {
                this.editor.setText(newText);
              }
            } : null,
            onIgnore: () => {
              // Just removes the suggestion
            }
          };
        });
      
      console.log('[AI Debug] Mapped suggestions:', geminiSuggestions);
      
      this.suggestionsPanel.clearSuggestions();
      this.suggestionsPanel.addSuggestions(geminiSuggestions);
      
      // Highlight spelling mistakes in editor
      this.editor.highlightSpellingMistakes(geminiSuggestions);
      
      console.log('[AI Debug] Panel suggestions count:', this.suggestionsPanel.suggestions.length);
      
      if (geminiSuggestions.length === 0) {
        this.updateAnalysisStatus('no-issues');
      } else {
        this.updateAnalysisStatus('complete', geminiSuggestions.length);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request was cancelled, this is normal
        return;
      }
      if (error.message === 'login_required' || error.message === 'unauthorized') {
        this.updateAnalysisStatus('');
        this.showNotification('Please log in to continue.', 'warning');
        return;
      }
      console.error('Auto-analysis error:', error);
      this.updateAnalysisStatus('error');
    } finally {
      this.isAnalyzing = false;
      this.abortController = null;
    }
  }
  
  updateAnalysisStatus(status, count = 0) {
    const summaryEl = document.getElementById('suggestions-summary');
    if (!summaryEl) return;
    
    switch (status) {
      case 'analyzing':
        summaryEl.innerHTML = `
          <div class="flex items-center gap-2 text-primary-600">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm font-medium">Analyzing with Gemini AI...</span>
          </div>
        `;
        break;
      case 'complete':
        summaryEl.innerHTML = `
          <div class="text-sm text-gray-600">
            Found <strong>${count}</strong> suggestion${count > 1 ? 's' : ''}
          </div>
        `;
        break;
      case 'no-issues':
        summaryEl.innerHTML = `
          <div class="flex items-center gap-2 text-green-600">
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span class="text-sm font-medium">No issues found</span>
          </div>
        `;
        break;
      case 'error':
        summaryEl.innerHTML = `
          <div class="text-sm text-red-600">
            Analysis failed. Click "Check with Gemini AI" to retry.
          </div>
        `;
        break;
      default:
        summaryEl.innerHTML = `
          <div class="text-sm text-gray-500">
            Type or paste Tamil text to get AI suggestions
          </div>
        `;
    }
  }

  handleSuggestionAccepted() {
    this.updateAcceptedCount();
  }

  async translateEnglishToTamil() {
    const text = this.getEditorText().trim();
    
    if (!text) {
      alert('Please enter some English text to translate.');
      return;
    }

    const wc = countWords(text);
    if (wc < 5 || text.length < 20) {
      this.showNotification('Type at least 5 words to get AI grammar suggestions', 'info');
      return;
    }

    // Client must not call Google APIs directly; route through backend submit endpoint instead.
    const translateBtn = document.getElementById('translate-english-btn');
    const originalBtnContent = translateBtn ? translateBtn.innerHTML : '';
    if (translateBtn) {
      translateBtn.innerHTML = 'Submitting...';
    translateBtn.disabled = true;
    }
    
    try {
      const response = await this.apiFetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, save_draft: false })
      });
      
      if (!response.ok) {
        throw new Error('Submit failed');
      }
      
      const data = await response.json();
      if (data.translated_text) {
        this.editor.setText(data.translated_text);
      }
      this.updateAnalysisStatus('complete');
    } catch (error) {
      console.error('[Translate] Error:', error);
      alert('Translation failed. Please try again.');
      this.updateAnalysisStatus('error');
    } finally {
      if (translateBtn) {
        translateBtn.innerHTML = originalBtnContent || 'Translate';
      translateBtn.disabled = false;
      }
    }
  }

  updateWordCount() {
    const text = this.getEditorText();
    const count = countWords(text);
    const wordCountEl = document.getElementById('word-count');
    if (wordCountEl) {
      wordCountEl.textContent = `Words: ${count}`;
    }
  }

  updateAcceptedCount() {
    const count = this.suggestionsPanel.getAcceptedCount();
    const acceptedCountEl = document.getElementById('accepted-count');
    if (acceptedCountEl) {
      acceptedCountEl.textContent = `Accepted: ${count}`;
    }
  }

  scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    if (this.autosaveAuthBlocked) {
      return;
    }

    this.saveTimeout = setTimeout(() => {
      this.autosave();
    }, 2000);
  }

  async autosave() {
    if (this.autosaveAuthBlocked) {
      return;
    }

    const text = this.getEditorText().trim();
    
    // Don't save empty drafts
    if (!text || text.length < 5) {
      return;
    }
    
    const saveStatusEl = document.getElementById('save-status');
    const autosaveTimeEl = document.getElementById('autosave-time');
    
    if (saveStatusEl) {
      saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-gray-400 rounded-full mr-2"></span>Saving...';
    }

    try {
      const html = this.getEditorHTML();
      
      // If we have a current draft, we're updating it
      // Otherwise, create a new one
      const response = await this.apiFetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          html: html,
          model: 'gemini-flash' // Default model
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save draft');
      }

      const data = await response.json();
      
      // Update current draft with the saved submission
      if (data.submission) {
        this.currentDraft = data.submission;
        
        // Update title if it's still "Untitled Draft"
        const titleInput = document.getElementById('draft-title');
        if (titleInput && titleInput.value === 'Untitled Draft') {
          titleInput.value = `Draft #${data.submission.id}`;
        }
      }
      
      if (saveStatusEl) {
        saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>Saved';
      }
      if (autosaveTimeEl) {
        const now = new Date();
        autosaveTimeEl.textContent = `Last saved: ${now.toLocaleTimeString()}`;
      }
    } catch (error) {
      if (error.message === 'unauthorized') {
        this.autosaveAuthBlocked = true;
        if (saveStatusEl) {
          saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>Session expired';
        }
        this.showNotification('Autosave paused: please log in again.', 'warning');
        return;
      }
      if (error.message === 'login_required' || error.message === 'unauthorized') {
        if (saveStatusEl) {
          saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>Login required';
        }
        this.showNotification('Please log in to save drafts.', 'warning');
        return;
      }
      console.error('Autosave error:', error);
      if (saveStatusEl) {
        saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>Save failed';
      }
    }
  }

  async checkWithGemini() {
    if (this.loading) return;

    const text = this.getEditorText();
    if (!text || text.trim().length === 0) {
      this.showNotification('Please enter some text first', 'warning');
      return;
    }

    this.loading = true;
    const geminiBtn = document.getElementById('check-gemini-btn');
    const originalText = geminiBtn ? geminiBtn.textContent : '';
    
    if (geminiBtn) {
      geminiBtn.disabled = true;
      geminiBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Analyzing...
      `;
    }

    try {
      // Client must not call Google APIs directly; use backend validate endpoint instead.
      const response = await this.apiFetch('/api/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, mode: this.getMode() || 'english_to_tamil' })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze text');
      }

      const data = await response.json();
      const tokens = data.tokens || [];
      const suggestions = tokens.flatMap((t, idx) => {
        return (t.suggestions || []).map((sugg, sIdx) => ({
          id: `validate-${idx}-${sIdx}-${Date.now()}`,
          title: sugg.reason || 'Suggestion',
          description: sugg.reason || '',
          type: 'transliteration',
          preview: `${t.original} → ${sugg.ta}`,
          sourceText: t.original,
          onApply: () => {
          const currentText = this.getEditorText();
            const replaced = this.replaceTokenInText(currentText, t.original, sugg.ta, t.start);
            this.editor.setText(replaced);
          },
          onIgnore: () => {},
      }));
      });

      this.suggestionsPanel.clearSuggestions();
      this.suggestionsPanel.addSuggestions(suggestions);

      // Proofread V2 normalize + highlight for validate
      if (window.PROOFREAD_V2 && window.normalizeProofreadResponse) {
        const plain = this.getEditorText();
        const norm = window.normalizeProofreadResponse(data, plain);
        this.proofreadSuggestions = norm;
        if (this.proofreadHighlights) {
          this.proofreadHighlights.clear();
          this.proofreadHighlights.underline(norm);
        }
      }

      if (suggestions.length === 0) {
        this.showNotification('No transliteration issues found.', 'success');
      } else {
        this.showNotification(`Found ${suggestions.length} transliteration suggestion${suggestions.length > 1 ? 's' : ''}`, 'success');
      }
    } catch (error) {
      console.error('Gemini AI error:', error);
      this.showNotification('Failed to analyze text with Gemini AI. Please try again.', 'error');
    } finally {
      this.loading = false;
      if (geminiBtn) {
        geminiBtn.disabled = false;
        geminiBtn.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          Check with Gemini AI
        `;
      }
    }
  }

  async submitForProofreading() {
    const text = this.getEditorText();
    if (!text || text.trim().length === 0) {
      this.showNotification('Please enter some text first', 'warning');
      return;
    }

    this.showNotification('Submitting to backend for advanced proofreading...', 'info');
    
    // This would call the Go backend API
    // For now, just show a message
    setTimeout(() => {
      this.showNotification('Backend proofreading coming soon!', 'info');
    }, 1000);
  }

  acceptAllSuggestions() {
    // Apply all suggestions with onApply handlers
    const suggestions = [...this.suggestionsPanel.suggestions];
    suggestions.forEach(suggestion => {
      if (suggestion.onApply) {
        suggestion.onApply();
      }
      this.suggestionsPanel.removeSuggestion(suggestion.id);
    });

    this.updateAcceptedCount();
    this.showNotification('All suggestions applied!', 'success');
  }

  async pollSubmission(submissionId) {
    if (!submissionId) return {};
    const maxTries = 15;
    const delay = 700;
    for (let i = 0; i < maxTries; i++) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        const res = await this.apiFetch(`/api/submissions/${submissionId}`, { method: 'GET' });
        if (!res.ok) continue;
        const data = await res.json();
        const status = data.submission?.status || '';
        console.log('[GEMINI] poll attempt', i + 1, 'status', status);
        if (status && status.toLowerCase() !== 'pending') {
          return data;
        }
      } catch (err) {
        console.warn('[GEMINI] poll error', err);
      }
    }
    return {};
  }

  logout() {
    if (confirm('Are you sure you want to log out?')) {
      window.location.href = '/';
    }
  }

  showNotification(message, type = 'info') {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 transition-opacity duration-300`;
    
    const bgColors = {
      success: 'bg-emerald-600',
      error: 'bg-rose-600',
      warning: 'bg-pink-500',
      info: 'bg-primary-600'
    };
    
    toast.classList.add(bgColors[type] || bgColors.info);
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async showDraftsList() {
    this.currentMode = 'list';
    
    // Show list view, hide editor
    const listView = document.getElementById('drafts-list-view');
    const editorPanel = document.querySelector('.flex-1.flex.flex-col.bg-slate-50.border-r');
    const aiPanel = document.getElementById('ai-assistant-panel');
    
    if (listView) listView.classList.remove('hidden');
    if (editorPanel) editorPanel.classList.add('hidden');
    if (aiPanel) aiPanel.style.display = 'none';
    
    // Load drafts
    await this.loadDrafts();
  }

  showEditor() {
    this.currentMode = 'editor';
    
    // Hide list view, show editor
    const listView = document.getElementById('drafts-list-view');
    const editorPanel = document.querySelector('.flex-1.flex.flex-col.bg-slate-50.border-r');
    const aiPanel = document.getElementById('ai-assistant-panel');
    
    console.log('Showing editor - AI Panel found:', !!aiPanel);
    
    if (listView) listView.classList.add('hidden');
    if (editorPanel) {
      editorPanel.classList.remove('hidden');
      editorPanel.style.display = 'flex';
    }
    if (aiPanel) {
      aiPanel.classList.remove('hidden');
      aiPanel.style.display = 'flex';
      aiPanel.style.visibility = 'visible';
      aiPanel.style.opacity = '1';
      console.log('AI Assistant panel is now visible', aiPanel.offsetWidth, 'px wide');
    } else {
      console.error('AI Assistant panel not found!');
    }
  }

  async loadDrafts() {
    const loadingEl = document.getElementById('drafts-loading');
    const containerEl = document.getElementById('drafts-container');
    const noDataEl = document.getElementById('no-drafts-message');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (containerEl) containerEl.innerHTML = '';
    if (noDataEl) noDataEl.classList.add('hidden');
    
    try {
      const response = await this.apiFetch('/api/submissions?limit=50');
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      this.drafts = data.submissions || data.data || [];
      
      if (loadingEl) loadingEl.classList.add('hidden');
      
      if (this.drafts.length === 0) {
        if (noDataEl) noDataEl.classList.remove('hidden');
      } else {
        this.renderDrafts();
      }
    } catch (error) {
      console.error('Error loading drafts:', error);
      if (loadingEl) loadingEl.classList.add('hidden');
      
      // Show error message in container
      if (containerEl) {
        containerEl.innerHTML = `
          <div class="text-center py-12 text-red-600">
            <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="font-semibold mb-2">Failed to load drafts</p>
            <p class="text-sm text-gray-500 mb-4">${error.message}</p>
            <button onclick="location.reload()" class="text-blue-600 hover:text-blue-700 text-sm font-medium">Reload page</button>
          </div>
        `;
      }
    }
  }

  renderDrafts() {
    const container = document.getElementById('drafts-container');
    if (!container) {
      console.error('Drafts container not found');
      return;
    }
    
    console.log(`Rendering ${this.drafts.length} drafts`);
    
    container.innerHTML = this.drafts.map(draft => {
      const date = new Date(draft.created_at);
      const preview = this.getTextPreview(draft.original_text || '');
      const status = this.getStatusBadge(draft.status);
      
      return `
        <div class="bg-white rounded-lg border border-gray-200 hover:border-primary-500 hover:shadow-md transition-all cursor-pointer p-4" data-draft-id="${draft.id}">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 mb-1">Draft #${draft.id}</h3>
              <p class="text-sm text-gray-600 line-clamp-2">${preview}</p>
            </div>
            <div class="flex items-center gap-2">
              ${status}
              <button 
                class="delete-draft-btn p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
                data-draft-id="${draft.id}"
                title="Delete draft">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="flex items-center gap-4 text-xs text-gray-500 mt-3">
            <span class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
              ${draft.word_count || 0} words
            </span>
            <span class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              ${this.formatDate(date)}
            </span>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers for draft cards
    const cards = container.querySelectorAll('[data-draft-id]');
    console.log(`Adding click handlers to ${cards.length} draft cards`);
    
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-draft-btn')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const draftId = parseInt(card.dataset.draftId);
        console.log('Draft card clicked:', draftId);
        this.openDraft(draftId);
      });
    });
    
    // Add click handlers for delete buttons
    const deleteButtons = container.querySelectorAll('.delete-draft-btn');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draftId = parseInt(btn.dataset.draftId);
        await this.deleteDraft(draftId);
      });
    });
  }

  getTextPreview(text) {
    if (!text) return 'Empty draft';
    return text.length > 150 ? text.substring(0, 150) + '...' : text;
  }

  getStatusBadge(status) {
    const badges = {
      'pending': '<span class="text-xs px-2 py-1 rounded-full bg-accent-50 text-primary-700">Pending</span>',
      'completed': '<span class="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Completed</span>',
      'processing': '<span class="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700">Processing</span>',
      'failed': '<span class="text-xs px-2 py-1 rounded-full bg-rose-50 text-rose-700">Failed</span>'
    };
    return badges[status] || '';
  }

  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  }

  async openDraft(draftId) {
    console.log('Opening draft:', draftId);
    try {
      const apiUrl = `/api/submissions/${draftId}`;
      console.log('Fetching from:', apiUrl);
      
      const response = await this.apiFetch(apiUrl);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`Failed to load draft: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Draft data loaded:', data);
      const draft = data.submission;
      
      // Load draft into editor
      this.currentDraft = draft;
      this.editor.setText(draft.original_text || '');
      
      // Update title
      const titleInput = document.getElementById('draft-title');
      if (titleInput) {
        titleInput.value = `Draft #${draft.id}`;
      }
      
      // Switch to editor view
      this.showEditor();
      
      // Clear URL hash to prevent reloading
      if (window.location.hash) {
        history.replaceState(null, null, ' ');
      }
      
      this.showNotification('Draft loaded successfully', 'success');
      
      // Automatically trigger AI analysis for the loaded draft
      setTimeout(() => {
        console.log('Triggering auto-analysis for draft');
        this.autoAnalyze();
      }, 500);
    } catch (error) {
      console.error('Error loading draft:', error);
      this.showNotification('Failed to load draft', 'error');
    }
  }

  createNewDraft() {
    // Clear editor
    this.currentDraft = null;
    this.editor.clear();
    this.suggestionsPanel.clearSuggestions();
    
    // Reset title
    const titleInput = document.getElementById('draft-title');
    if (titleInput) {
      titleInput.value = 'Untitled Draft';
    }
    
    // Switch to editor view
    this.showEditor();
    
    // Update URL
    window.history.pushState({}, '', '/workspace');
  }

  async deleteDraft(draftId) {
    if (!confirm('Are you sure you want to delete this draft? It will be moved to Archive for 45 days.')) {
      return;
    }

    try {
      const response = await this.apiFetch(`/api/submissions/${draftId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete draft');
      }

      const data = await response.json();
      console.log('Draft deleted:', data);

      this.showNotification('Draft moved to Archive (45 day retention)', 'success');
      
      // Reload the drafts list
      await this.loadDrafts();
    } catch (error) {
      console.error('Error deleting draft:', error);
      this.showNotification('Failed to delete draft', 'error');
    }
  }
}

// ============================================
// TIPTAP MIGRATION - Phase 3 & 4
// ============================================
// Migration flag: set to true to enable TipTap editor
window.USE_TIPTAP_EDITOR = false; // Change to true to activate TipTap

// Global TipTap editor instance
let tiptapWorkspaceEditor = null;

/**
 * Phase 3: Mount TipTap editor in workspace
 * Creates and mounts TipTap editor instance
 */
function mountTipTapWorkspaceEditor() {
  const el = document.getElementById('tiptap-workspace-editor');
  if (!el) {
    console.warn('[TipTap Migration] Container not found');
    return;
  }

  // Wait for TipTap to load
  const checkTipTap = setInterval(() => {
    if (window.TIPTAP_LOADED && window.createTipTapEditor) {
      clearInterval(checkTipTap);
      el.classList.remove('hidden');
      
      // Get initial content from legacy editor if it exists
      const legacyEditor = document.getElementById('editor');
      const initialContent = legacyEditor ? legacyEditor.textContent : '';
      
      tiptapWorkspaceEditor = window.createTipTapEditor(el, initialContent || '<p></p>');
      
      if (tiptapWorkspaceEditor) {
        console.log('[TipTap Migration] Workspace editor mounted successfully');
      } else {
        console.error('[TipTap Migration] Failed to create TipTap editor');
        el.classList.add('hidden');
      }
    }
  }, 100);

  // Timeout after 5 seconds
  setTimeout(() => {
    clearInterval(checkTipTap);
    if (!window.TIPTAP_LOADED) {
      console.error('[TipTap Migration] TipTap failed to load within 5 seconds');
    }
  }, 5000);
}

/**
 * Phase 4: Switch UI from legacy to TipTap
 * Hides legacy editor and shows TipTap editor
 */
function switchWorkspaceEditor() {
  if (!window.USE_TIPTAP_EDITOR) {
    return; // Legacy editor remains active
  }

  const legacyPanel = document.querySelector('.workspace-editor-panel');
  const legacyEditor = document.getElementById('editor');
  
  // Hide legacy editor
  if (legacyEditor) {
    legacyEditor.style.display = 'none';
  }
  
  // Mount TipTap editor
  mountTipTapWorkspaceEditor();
  
  // Phase 6: Wire toolbar to TipTap (with delay to ensure editor is mounted)
  setTimeout(() => {
    setupTipTapToolbar();
  }, 600);
  
  console.log('[TipTap Migration] Switched to TipTap editor');
}

/**
 * Phase 6: Wire toolbar buttons to TipTap commands
 * This function sets up TipTap-aware toolbar handlers that override legacy handlers
 */
function setupTipTapToolbar() {
  if (!window.USE_TIPTAP_EDITOR || !tiptapWorkspaceEditor) {
    return; // Legacy toolbar remains active
  }

  // Command mapping: data-command → TipTap command
  const commandMap = {
    'bold': () => tiptapWorkspaceEditor.chain().focus().toggleBold().run(),
    'italic': () => tiptapWorkspaceEditor.chain().focus().toggleItalic().run(),
    'underline': () => tiptapWorkspaceEditor.chain().focus().toggleUnderline?.().run?.() || null, // Underline may need extension
    'strikeThrough': () => tiptapWorkspaceEditor.chain().focus().toggleStrike().run(),
    'undo': () => tiptapWorkspaceEditor.chain().focus().undo().run(),
    'redo': () => tiptapWorkspaceEditor.chain().focus().redo().run(),
    'insertUnorderedList': () => tiptapWorkspaceEditor.chain().focus().toggleBulletList().run(),
    'insertOrderedList': () => tiptapWorkspaceEditor.chain().focus().toggleOrderedList().run(),
    'justifyLeft': () => tiptapWorkspaceEditor.chain().focus().setTextAlign('left').run(),
    'justifyCenter': () => tiptapWorkspaceEditor.chain().focus().setTextAlign('center').run(),
    'justifyRight': () => tiptapWorkspaceEditor.chain().focus().setTextAlign('right').run(),
    'justifyFull': () => tiptapWorkspaceEditor.chain().focus().setTextAlign('justify').run(),
  };

  // Override toolbar button handlers
  const toolbarButtons = document.querySelectorAll('.toolbar-btn[data-command]');
  toolbarButtons.forEach(btn => {
    // Remove existing listeners by cloning the button (hacky but effective)
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const command = newBtn.getAttribute('data-command');
      const tipTapCommand = commandMap[command];
      
      if (tipTapCommand) {
        tipTapCommand();
        
        // Update active state for formatting buttons
        if (['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
          const isActive = tiptapWorkspaceEditor.isActive(command === 'strikeThrough' ? 'strike' : command);
          if (isActive) {
            newBtn.classList.add('active');
          } else {
            newBtn.classList.remove('active');
          }
        }
      }
    });
  });

  // Handle alignment dropdown items
  const dropdownItems = document.querySelectorAll('.dropdown-item[data-command]');
  dropdownItems.forEach(item => {
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
    
    newItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const command = newItem.getAttribute('data-command');
      const tipTapCommand = commandMap[command];
      if (tipTapCommand) {
        tipTapCommand();
      }
      // Close dropdown
      const dropdown = document.getElementById('align-dropdown');
      if (dropdown) dropdown.classList.add('hidden');
    });
  });

  console.log('[TipTap Migration] Toolbar wired to TipTap commands');
}

// Expose globally for toolbar integration
window.tiptapWorkspaceEditor = () => tiptapWorkspaceEditor;
window.mountTipTapWorkspaceEditor = mountTipTapWorkspaceEditor;
window.switchWorkspaceEditor = switchWorkspaceEditor;
window.setupTipTapToolbar = setupTipTapToolbar;

// Initialize workspace when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WorkspaceController();
    // Phase 4: Switch to TipTap if flag is enabled
    setTimeout(() => switchWorkspaceEditor(), 500); // Wait a bit for TipTap to load
  });
} else {
  new WorkspaceController();
  // Phase 4: Switch to TipTap if flag is enabled
  setTimeout(() => switchWorkspaceEditor(), 500); // Wait a bit for TipTap to load
}
