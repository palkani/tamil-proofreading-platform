// v20260224b - STREAMING: Single SSE corrections request; server aborts Gemini on client disconnect
// Main Workspace Controller

// PERFORMANCE: Debug logging disabled in production for faster response
// Set window.IME_DEBUG = true in console to enable verbose logging
const IME_DEBUG = typeof window !== 'undefined' && window.IME_DEBUG === true;
const imeLog = IME_DEBUG ? console.log.bind(console) : () => {};

console.log('[WorkspaceJS] ✅ Loaded version v20260224b - inline correction popover on click');

// CRITICAL: Ensure USE_TIPTAP_EDITOR is set to false at the very top
// This prevents any initialization issues
if (typeof window.USE_TIPTAP_EDITOR === 'undefined') {
  window.USE_TIPTAP_EDITOR = false;
  console.log('[WorkspaceJS] ✅ USE_TIPTAP_EDITOR initialized to false');
} else {
  console.log('[WorkspaceJS] USE_TIPTAP_EDITOR already set to:', window.USE_TIPTAP_EDITOR);
}

// Read-only view mode (used by "View" action from Drafts)
// URL: /workspace?draftId=123&mode=view
try {
  const params = new URLSearchParams(window.location.search || '');
  window.WORKSPACE_READONLY = params.get('mode') === 'view';
  if (window.WORKSPACE_READONLY) {
    console.log('[WorkspaceJS] 🔒 Read-only mode enabled (mode=view)');
    document.documentElement.classList.add('workspace-readonly');
    document.body?.classList?.add('workspace-readonly');
  }
} catch (_e) {
  // non-fatal
}

// Minimum words before we call /api/submit automatically (typing/paste auto analysis). Set to 5 for easier testing.
const MIN_SUBMIT_WORDS = 5;

// ============================================
// FREE TIER LIMITS
// ============================================
const FREE_TIER_MAX_WORDS  = 200;  // max words per analysis for free/anonymous users
const ANON_DAILY_LIMIT     = 10;   // AI checks/day before signing in
const FREE_USER_DAILY_LIMIT = 30;  // AI checks/day for signed-in free-plan users

// Resolved from window globals set by workspace.ejs (USER_LOGGED_IN, USER_EMAIL, USER_PLAN)
// USER_PLAN is updated client-side after fetching /api/v1/me
let _freeTierUserPlan = 'free';

function _isProUser() {
  const plan = (window.USER_PLAN || _freeTierUserPlan || '').toLowerCase();
  return plan === 'pro' || plan === 'enterprise' || plan === 'basic';
}

function _isLoggedIn() {
  return window.USER_LOGGED_IN === true;
}

// Fetch the signed-in user's subscription plan from the backend (once on page load)
(function _fetchUserPlan() {
  if (!window.USER_LOGGED_IN) return;
  fetch('/api/v1/me', { credentials: 'include' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.user && data.user.subscription) {
        _freeTierUserPlan = data.user.subscription;
        window.USER_PLAN  = data.user.subscription;
        // Show/hide word limit indicator based on resolved plan
        _updateWordLimitUI();
      }
    })
    .catch(function() {});
})();

// ── Suggestion counter (localStorage-backed, resets at midnight) ──

function _getSuggestionKey() {
  if (_isLoggedIn() && window.USER_EMAIL) return 'pt_sug_free_' + window.USER_EMAIL;
  return 'pt_sug_anon';
}

function _getDailyCount() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(_getSuggestionKey());
    if (raw) {
      const d = JSON.parse(raw);
      if (d.date === today) return d.count || 0;
    }
  } catch (_e) {}
  return 0;
}

function _incrementDailyCount() {
  const today = new Date().toISOString().slice(0, 10);
  const newCount = _getDailyCount() + 1;
  try {
    localStorage.setItem(_getSuggestionKey(), JSON.stringify({ date: today, count: newCount }));
  } catch (_e) {}
  return newCount;
}

function _getDailyLimit() {
  return _isLoggedIn() ? FREE_USER_DAILY_LIMIT : ANON_DAILY_LIMIT;
}

function _getSuggestionsRemaining() {
  return Math.max(0, _getDailyLimit() - _getDailyCount());
}

// ── Word count badge limit indicator ──
function _updateWordLimitUI() {
  const limitEl = document.getElementById('word-count-limit');
  if (!limitEl) return;
  if (_isProUser()) {
    limitEl.classList.add('hidden');
  } else {
    limitEl.classList.remove('hidden');
  }
}

// ── Quota bar in AI panel ──
function _updateQuotaBar() {
  const bar = document.getElementById('suggestion-quota-bar');
  const text = document.getElementById('suggestion-quota-text');
  const upgradeLink = document.getElementById('suggestion-upgrade-link');
  if (!bar || !text) return;
  if (_isProUser()) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const remaining = _getSuggestionsRemaining();
  const limit = _getDailyLimit();
  const canOpenModal = window.PAYMENTS_ENABLED && typeof window.openUpgradeModal === 'function';
  if (remaining <= 0) {
    text.textContent = 'Daily limit reached (0/' + limit + ' left)';
    text.className = 'text-xs text-red-500';
    if (upgradeLink) {
      upgradeLink.classList.remove('hidden');
      if (canOpenModal) {
        upgradeLink.href = '#';
        upgradeLink.onclick = function(e) { e.preventDefault(); window.openUpgradeModal('PRO_MONTHLY'); };
      } else {
        upgradeLink.href = '/pricing';
        upgradeLink.onclick = null;
      }
    }
  } else if (remaining <= 3) {
    text.textContent = remaining + ' AI checks left today';
    text.className = 'text-xs text-amber-500';
    if (upgradeLink) {
      upgradeLink.classList.remove('hidden');
      if (canOpenModal) {
        upgradeLink.href = '#';
        upgradeLink.onclick = function(e) { e.preventDefault(); window.openUpgradeModal('PRO_MONTHLY'); };
      } else {
        upgradeLink.href = '/pricing';
        upgradeLink.onclick = null;
      }
    }
  } else {
    text.textContent = remaining + ' AI checks left today';
    text.className = 'text-xs text-gray-400';
    if (upgradeLink) upgradeLink.classList.add('hidden');
  }
}

// Show a word-limit exceeded card in the suggestions panel
function _showWordLimitCard(wordCount) {
  const container = document.getElementById('suggestions-container');
  if (!container) return;
  const canOpenModal = window.PAYMENTS_ENABLED && typeof window.openUpgradeModal === 'function';
  const upgradeHtml = _isLoggedIn()
    ? (canOpenModal
        ? '<button onclick="window.openUpgradeModal(\'PRO_MONTHLY\')" class="inline-block mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-semibold hover:bg-indigo-700 transition cursor-pointer">Upgrade to Pro</button>'
        : (window.PAYMENTS_ENABLED ? '<a href="/pricing" class="inline-block mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-semibold hover:bg-indigo-700 transition">View Plans</a>' : ''))
    : '<a href="/register" class="inline-block mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-semibold hover:bg-indigo-700 transition">Create free account</a>'
    + '<p class="mt-2 text-xs text-gray-400">Sign in to get 30 checks/day</p>';
  container.innerHTML =
    '<div class="text-center py-8 px-4">' +
    '<div class="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">' +
    '<svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>' +
    '</svg></div>' +
    '<h3 class="font-semibold text-gray-900 mb-1">200-word limit reached</h3>' +
    '<p class="text-sm text-gray-500">Free plan supports up to 200 words per analysis. Your text has <strong>' + wordCount + ' words</strong>.</p>' +
    upgradeHtml +
    '</div>';
}

// Show a daily-limit exceeded card
function _showDailyLimitCard() {
  const container = document.getElementById('suggestions-container');
  if (!container) return;
  const limit = _getDailyLimit();
  const canOpenModal = window.PAYMENTS_ENABLED && typeof window.openUpgradeModal === 'function';
  const upgradeHtml = _isLoggedIn()
    ? (canOpenModal
        ? '<button onclick="window.openUpgradeModal(\'PRO_MONTHLY\')" class="inline-block mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-semibold hover:bg-indigo-700 transition cursor-pointer">Upgrade to Pro — unlimited checks</button>'
        : (window.PAYMENTS_ENABLED ? '<a href="/pricing" class="inline-block mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-semibold hover:bg-indigo-700 transition">View Plans</a>' : ''))
    : '<a href="/register" class="inline-block mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-semibold hover:bg-indigo-700 transition">Sign up free — get 30 checks/day</a>'
    + '<p class="mt-2 text-xs text-gray-400">Already have an account? <a href="/login" class="text-indigo-600 underline">Log in</a></p>';
  container.innerHTML =
    '<div class="text-center py-8 px-4">' +
    '<div class="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">' +
    '<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>' +
    '</svg></div>' +
    '<h3 class="font-semibold text-gray-900 mb-1">Daily limit reached</h3>' +
    '<p class="text-sm text-gray-500 mb-1">You\'ve used all <strong>' + limit + ' AI checks</strong> for today.</p>' +
    '<p class="text-xs text-gray-400 mb-3">Resets at midnight. Pro plan gives you unlimited checks.</p>' +
    upgradeHtml +
    '</div>';
}

// Filter corrections to grammar/spelling/punctuation types only (for free users)
const FREE_TIER_CORRECTION_TYPES = new Set(['grammar', 'spelling', 'punctuation', 'typo']);
function _applyFreeTierFilter(corrections) {
  if (_isProUser()) return corrections;
  return corrections.filter(function(c) {
    const t = (c.type || c.Type || '').toLowerCase();
    return !t || FREE_TIER_CORRECTION_TYPES.has(t);
  });
}

// Run word-limit UI update once DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  _updateWordLimitUI();
  _updateQuotaBar();
});
// END FREE TIER LIMITS

// ============================================
// APPLY REPLACEMENT UTILITY
// ============================================

function applyReplacement(text, original, replacement, approxIndex = null) {
  if (!text || !original) return { text, changed: false };
  if (!replacement) replacement = ''; // Allow empty replacements (deletion)

  // Try start_index if provided and within bounds
  if (typeof approxIndex === 'number' && approxIndex >= 0 && approxIndex < text.length) {
    const endIndex = approxIndex + original.length;
    if (endIndex <= text.length) {
      const candidate = text.slice(approxIndex, endIndex);
      if (candidate === original) {
        const newText = text.slice(0, approxIndex) + replacement + text.slice(endIndex);
        return { text: newText, changed: newText !== text };
      }
    }
  }

  // Try exact match first (only first occurrence to avoid breaking other suggestions)
  const exactIdx = text.indexOf(original);
  if (exactIdx !== -1) {
    const newText = text.slice(0, exactIdx) + replacement + text.slice(exactIdx + original.length);
    return { text: newText, changed: newText !== text };
  }
  
  // No match found
  return { text, changed: false };
}

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
  
  // RELAXED: Allow longer suggestions for better coverage
  // For 1-2 char input: allow up to 5 chars (was 3)
  // For 3+ char input: allow up to 10 chars (was 6)
  const maxLen = tokenLatin.length <= 2 ? 5 : 10;

  return rawSuggestions.filter(s => {
    const w = (s.word || s.text || '').trim();
    if (!w) return false;

    // Reject Latin / digits (must be pure Tamil)
    if (/[A-Za-z0-9]/.test(w)) return false;

    // RELAXED: Allow some vowel sequences (API might return valid compound words)
    // Only reject if it's OBVIOUSLY invalid (more than 2 consecutive vowels)
    const vowelSequenceCount = (w.match(/[ாிீுூெேைொோௌ]{3,}/g) || []).length;
    if (vowelSequenceCount > 0) {
      console.log('[IME] Rejected suggestion with 3+ consecutive vowels:', w);
      return false;
    }

    // RELAXED: Accept longer suggestions (up to maxLen)
    if (w.length > maxLen) {
      console.log('[IME] Rejected suggestion (too long):', w, 'length:', w.length, 'max:', maxLen);
      return false;
    }

    return true;
  });

  // Text style dropdown (Paragraph / Heading) for TipTap
  const formatBtn = document.getElementById('format-dropdown-btn');
  const formatDropdown = document.getElementById('format-dropdown');
  if (formatBtn && formatDropdown) {
    formatBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      formatDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('a[href]')) return;
      if (formatDropdown && !formatDropdown.contains(e.target) && e.target !== formatBtn) {
        formatDropdown.classList.add('hidden');
      }
    });

    const items = formatDropdown.querySelectorAll('[data-format]');
    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tag = (item.getAttribute('data-format') || 'p').toLowerCase();
        if (tag === 'p') {
          tiptapWorkspaceEditor.chain().focus().setParagraph().run();
        } else if (tag === 'h1') {
          tiptapWorkspaceEditor.chain().focus().toggleHeading({ level: 1 }).run();
        } else if (tag === 'h2') {
          tiptapWorkspaceEditor.chain().focus().toggleHeading({ level: 2 }).run();
        } else if (tag === 'h3') {
          tiptapWorkspaceEditor.chain().focus().toggleHeading({ level: 3 }).run();
        }
        formatDropdown.classList.add('hidden');
      });
    });
  }
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
  // CRITICAL: Only detect Latin (English) tokens for transliteration
  // Don't include Tamil characters or other non-Latin characters
  let start = caretPos;
  // Move backwards to find start of Latin word
  while (start > 0 && /[a-zA-Z]/.test(text[start - 1])) start--;
  let end = caretPos;
  // Move forwards to find end of Latin word
  while (end < text.length && /[a-zA-Z]/.test(text[end])) end++;
  const token = text.slice(start, end);
  // Only return if it's a valid Latin word (not empty and only Latin characters)
  if (token && /^[a-zA-Z]+$/.test(token)) {
    return { token, start, end };
  }
  // Return empty token if not a valid Latin word
  return { token: '', start: caretPos, end: caretPos };
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

// Prevent duplicate declaration if script is loaded twice
if (typeof window.EditorMode === 'undefined') {
  window.EditorMode = {
    IDLE: 'IDLE',
    IME_TYPING: 'IME_TYPING',
    SUBMIT_PENDING: 'SUBMIT_PENDING',
    SUBMITTING: 'SUBMITTING',
  };
}
const EditorMode = window.EditorMode;

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

// ============================================
// WorkspaceTamilEditor - Wrapper for contenteditable (used only when editor.js not loaded)
// On workspace page, editor.js loads first and provides TamilEditor; avoid duplicate declaration.
// ============================================
class WorkspaceTamilEditor {
  constructor(element) {
    if (!element) {
      console.error('[WorkspaceTamilEditor] Constructor called without element');
      return;
    }
    this.element = element;
    this.editor = element; // Compatibility: controller may use this.editor.editor
    this._onChangeCallback = null;
    try {
      element.addEventListener('input', () => {
        if (this._onChangeCallback) this._onChangeCallback();
      }, { passive: true });
      element.addEventListener('paste', () => {
        if (this._onChangeCallback) this._onChangeCallback();
      }, { passive: true });
    } catch (e) {
      console.warn('[WorkspaceTamilEditor] Failed to add input listeners:', e);
    }
    console.log('[WorkspaceTamilEditor] Initialized for element:', element.id || element.tagName);
  }

  get onChange() {
    return this._onChangeCallback;
  }
  set onChange(fn) {
    this._onChangeCallback = typeof fn === 'function' ? fn : null;
  }

  getText() {
    return this.element ? (this.element.textContent || '') : '';
  }

  getHTML() {
    return this.element ? (this.element.innerHTML || '') : '';
  }

  setContent(html) {
    if (!this.element) return;
    this.element.innerHTML = html || '';
    if (this._onChangeCallback) this._onChangeCallback();
  }

  getCursorPosition() {
    if (!this.element) return 0;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    if (!this.element.contains(range.commonAncestorContainer)) return 0;
    const preCaretRange = document.createRange();
    preCaretRange.selectNodeContents(this.element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }

  setCursorPosition(position) {
    if (!this.element) return;
    const text = this.getText();
    const pos = Math.max(0, Math.min(position, text.length));
    const sel = window.getSelection();
    if (!sel) return;
    let node = this.element;
    let offset = 0;
    const walk = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const len = (n.textContent || '').length;
        if (offset + len >= pos) {
          node = n;
          offset = pos - offset;
          return true;
        }
        offset += len;
        return false;
      }
      for (let i = 0; i < n.childNodes.length; i++) {
        if (walk(n.childNodes[i])) return true;
      }
      return false;
    };
    walk(this.element);
    try {
      const range = document.createRange();
      const maxOffset = node.nodeType === Node.TEXT_NODE ? (node.textContent || '').length : node.childNodes.length;
      range.setStart(node, Math.min(offset, maxOffset));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_e) {
      // non-fatal
    }
  }

  replaceText(start, end, replacement) {
    const text = this.getText();
    if (start < 0 || end > text.length || start > end) return;
    const newText = text.slice(0, start) + (replacement || '') + text.slice(end);
    this.element.textContent = newText;
    this.setCursorPosition(start + (replacement || '').length);
    if (this._onChangeCallback) this._onChangeCallback();
  }

  focus() {
    if (this.element) this.element.focus();
  }
}
if (typeof window.TamilEditor === 'undefined') {
  window.TamilEditor = WorkspaceTamilEditor;
}

/** Fallback editor wrapper when TamilEditor is not available (same interface). */
function createFallbackEditorWrapper(elm) {
  let _onChange = null;
  return {
    editor: elm,
    getText() { return elm ? (elm.textContent || '') : ''; },
    getHTML() { return elm ? (elm.innerHTML || '') : ''; },
    setContent(html) { if (elm) { elm.innerHTML = html || ''; if (_onChange) _onChange(); } },
    getCursorPosition() { return 0; },
    setCursorPosition() { },
    get onChange() { return _onChange; },
    set onChange(fn) { _onChange = typeof fn === 'function' ? fn : null; },
    replaceText(start, end, replacement) {
      const text = elm ? (elm.textContent || '') : '';
      if (elm) { elm.textContent = text.slice(0, start) + (replacement || '') + text.slice(end); if (_onChange) _onChange(); }
    },
    focus() { if (elm) elm.focus(); }
  };
}

class WorkspaceController {
  constructor() {
    this.getMode = () => {
      const sel = document.getElementById('mode-select');
      return (sel && sel.value) || 'spoken';
    };
    this.editor = null;
    this.suggestionsPanel = null;
    this.currentDraft = null;
    this.readOnly = !!window.WORKSPACE_READONLY;
    // Track suggestion request ordering so stale responses can't overwrite newer ones
    this._imeRequestSeq = 0;
    this._imeLastAppliedSeq = 0;
    this._imeAbortController = null;
    this.saveTimeout = null;
    this.periodicSaveInterval = null; // 30-second background save
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
    this.suggestionCache = new Map(); // Initialize suggestion cache
    this.CACHE_TTL_MS = 300000; // 5 minutes cache TTL
    this.translitAbort = null;
    this.translitTimer = null;
    this.lastFetchToken = null;
    this.fetchingSuggestions = false;
    this.currentFetchQuery = null;
    this.currentSuggestions = [];
    this.activeSuggestionIndex = 0;
    this.imeActive = false;
    this.currentFetchQuery = null;
    this.suggestDebounce = null;
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
    this._isRenderingDropdown = false; // Lock to prevent multiple simultaneous renders
    
    // CRITICAL: Global cleanup function to remove all dropdowns
    // Removes both workspace.js dropdowns AND V2 TransliterationTypeahead dropdowns
    this.cleanupAllDropdowns = () => {
      // Remove workspace.js dropdowns
      const allDropdowns = document.querySelectorAll('#tamil-suggestions-dropdown');
      console.log('[IME] 🧹 Global cleanup: Removing', allDropdowns.length, 'workspace dropdown(s)');
      allDropdowns.forEach(dd => {
        dd.style.display = 'none';
        dd.style.visibility = 'hidden';
        dd.style.opacity = '0';
        dd.innerHTML = '';
        if (dd.parentNode) {
          dd.parentNode.removeChild(dd);
        }
      });
      
      // Remove V2 TransliterationTypeahead dropdowns
      const v2Dropdowns = document.querySelectorAll('.translit-dropdown');
      if (v2Dropdowns.length > 0) {
        console.log('[IME] 🧹 Global cleanup: Removing', v2Dropdowns.length, 'V2 dropdown(s)');
        v2Dropdowns.forEach(dd => {
          dd.style.display = 'none';
          dd.style.visibility = 'hidden';
          dd.style.opacity = '0';
          dd.innerHTML = '';
          if (dd.parentNode) {
            dd.parentNode.removeChild(dd);
          }
        });
        // Close the typeahead instance if it exists
        if (this.translitTypeahead && this.translitTypeahead.closeDropdown) {
          this.translitTypeahead.closeDropdown();
        }
      }
      
      // Remove orphaned items
      document.querySelectorAll('.tamil-suggestion-item').forEach(item => {
        if (!item.closest('#tamil-suggestions-dropdown')) {
          item.remove();
        }
      });
      this._isRenderingDropdown = false;
      this.translitDropdownOpen = false;
    };
    
    // CRITICAL: Cleanup on document clicks outside dropdown
    if (typeof document !== 'undefined') {
      document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('tamil-suggestions-dropdown');
        if (dropdown && !dropdown.contains(e.target) && !e.target.closest('.tamil-suggestion-item')) {
          // Only hide if clicking outside the editor area (to avoid hiding while typing)
          // Resolve DOM element: this.editor may be TamilEditor wrapper (has .editor), not the node
          const editorEl = this.editorElement || (this.editor && this.editor.editor) || document.querySelector('.ProseMirror') || document.querySelector('#tiptap-workspace-editor') || document.getElementById('editor');
          if (editorEl && typeof editorEl.contains === 'function' && !editorEl.contains(e.target)) {
            this.cleanupAllDropdowns();
          }
        }
      }, true); // Use capture phase to catch early
    }
    this.activeSuggestionIndex = 0; // For keyboard navigation
    this.isSelectingSuggestion = false; // Flag to prevent duplicate selection calls
    this.justReplacedToken = false; // Flag to prevent fetching suggestions immediately after replacement

    // Transliteration V2 (shared module). If enabled, we must NOT run legacy IME dropdown/commit logic.
    this.translitV2Enabled = !!(
      window.TRANS_SUGGEST_V2 &&
      window.TransliterationTypeahead &&
      window.WorkspaceEditorAdapter
    );
    this.translitTypeahead = null;

    // Paste gating: ensure only ONE /api/submit happens per paste action
    this.pasteAnalyzeTimeout = null;
    this.pasteSuppressUntil = 0; // suppress secondary autoAnalyze triggers from handleEditorChange
    this.suppressSubmitUntil = 0; // suppress scheduleSubmitThrottled/runAutoSubmit right after paste

    // AI submission result tracking (prevents multiple concurrent poll loops / SSE streams)
    this.analysisSeq = 0;
    // Prevents the AI panel from immediately resetting to the idle state after the user applies suggestions.
    this.suppressAutoAnalyzeUntil = 0;
    this.activeEventSource = null;
    
    // PART D: Prefix cache for suggestions
    this.suggestionCache = new Map(); // key: "mode:token", value: { suggestions, timestamp }
    this.CACHE_TTL_MS = 2000; // 2 seconds

    this.init();
  }

  /**
   * Prefer SSE stream (1 request) over polling (many requests).
   * Falls back to polling with backoff if EventSource is unavailable or fails.
   */
  async awaitSubmissionResult(submissionId, seq = this.analysisSeq) {
    if (!submissionId) return {};

    // 1) Try SSE (best UX + minimal requests)
    const canSse = typeof window !== 'undefined' && typeof window.EventSource === 'function';
    if (canSse) {
      try {
        const url = `/api/v1/submissions/${submissionId}/stream`;
        console.log('[AI] Attempting SSE stream for submission', submissionId, url);

        const payload = await new Promise((resolve, reject) => {
          // Close any prior stream so we never have multiple streams/pollers running.
          if (this.activeEventSource) {
            try { this.activeEventSource.close(); } catch (_e) {}
            this.activeEventSource = null;
          }

          const es = new EventSource(url, { withCredentials: true });
          this.activeEventSource = es;
          const timeout = setTimeout(() => {
            try { es.close(); } catch (_e) {}
            // If we waited a long time and still no result, fall back to polling.
            reject(new Error('sse_timeout'));
          }, 90000);

          const cleanup = () => {
            clearTimeout(timeout);
            try { es.close(); } catch (_e) {}
            if (this.activeEventSource === es) {
              this.activeEventSource = null;
            }
          };

          es.addEventListener('result', (evt) => {
            try {
              // Ignore stale results (e.g., user pasted new text while old request was in-flight)
              if (seq !== this.analysisSeq) {
                cleanup();
                resolve({});
                return;
              }
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
            // If backend ends without a result payload, fall back.
            cleanup();
            reject(new Error('sse_end_without_result'));
          });

          es.onerror = () => {
            cleanup();
            // If user already started a newer analysis, don't fall back (avoid extra numbered calls)
            if (seq !== this.analysisSeq) {
              resolve({});
              return;
            }
            reject(new Error('sse_error'));
          };
        });

        return payload || {};
      } catch (e) {
        console.warn('[AI] SSE stream unavailable; falling back to polling', e?.message);
      }
    }

    // 2) Fallback: polling with backoff (reduces request spam vs tight loops)
    return await this.pollSubmission(submissionId, seq);
  }

  /**
   * Queue exactly one AI analysis after paste.
   * Multiple paste listeners may fire (capture/bubble/input); this consolidates them.
   */
  queuePasteAnalyze(source = 'paste') {
    try {
      const now = Date.now();
      // Suppress duplicate triggers for a short window
      this.pasteSuppressUntil = now + 1500;
      this.suppressSubmitUntil = now + 1500;

      // Cancel any pending timers that could trigger extra submits
      if (this.analysisTimeout) {
        clearTimeout(this.analysisTimeout);
        this.analysisTimeout = null;
      }
      if (this.submitTimer) {
        clearTimeout(this.submitTimer);
        this.submitTimer = null;
      }
      if (this.pasteAnalyzeTimeout) {
        clearTimeout(this.pasteAnalyzeTimeout);
      }

      // Give the editor a moment to finish inserting pasted content
      this.pasteAnalyzeTimeout = setTimeout(() => {
        this.pasteAnalyzeTimeout = null;
        console.log('[AI] 📋 Paste detected; running single autoAnalyze()', { source });
        this.autoAnalyze({ silent: true });
      }, 300);
    } catch (e) {
      // non-fatal
    }
  }

  applyReadOnlyMode() {
    if (!this.readOnly) return;
    try {
      document.documentElement.classList.add('workspace-readonly');
      document.body?.classList?.add('workspace-readonly');
    } catch (_e) {}

    // Disable title editing
    const titleInput = document.getElementById('draft-title');
    if (titleInput) {
      titleInput.setAttribute('readonly', 'true');
      titleInput.setAttribute('aria-readonly', 'true');
      titleInput.classList.add('cursor-not-allowed');
    }

    // Disable legacy editor editing
    const editorEl = document.getElementById('editor');
    if (editorEl) {
      editorEl.setAttribute('contenteditable', 'false');
      editorEl.setAttribute('aria-readonly', 'true');
    }

    // Best-effort: disable toolbar interactions (UI is hidden via CSS, but keep safe)
    document.querySelectorAll('.workspace-toolbar button, .workspace-toolbar select, .workspace-toolbar a').forEach((el) => {
      el.setAttribute('aria-disabled', 'true');
      if (el.tagName === 'BUTTON') el.setAttribute('disabled', 'true');
      el.classList.add('cursor-not-allowed');
    });
  }

  // Unified API helper: uses centralized auth utilities for token refresh
  async apiFetch(url, options = {}, requireAuth = true) {
    // ALWAYS use centralized auth utilities if available (preferred)
    if (window.authUtils && window.authUtils.apiFetch) {
      try {
        return await window.authUtils.apiFetch(url, options, requireAuth);
      } catch (error) {
        // If authUtils.apiFetch redirects, let it handle it
        throw error;
      }
    }
    
    // Fallback: manual implementation with token refresh
    // Create a fresh headers object
    const headers = new Headers(options.headers || {});
    
    // Get access token and add to headers
    let accessToken = localStorage.getItem('access_token');
    if (accessToken && requireAuth) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    
    let response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    // Handle 401 with token refresh
    if (requireAuth && response.status === 401) {
      console.warn('[WORKSPACE] Got 401, attempting token refresh...');
      
      // Try to refresh token using centralized utility
      if (window.authUtils && window.authUtils.refreshAccessToken) {
        const newToken = await window.authUtils.refreshAccessToken();
        if (newToken) {
          // CRITICAL: Create a NEW headers object with the new token
          const newHeaders = new Headers(options.headers || {});
          newHeaders.set('Authorization', `Bearer ${newToken}`);
          
          // Retry with new token using NEW headers
          response = await fetch(url, {
            ...options,
            headers: newHeaders, // Use NEW headers object
            credentials: 'include',
          });
          
          if (response.status === 401) {
            console.error('[WORKSPACE] Still 401 after refresh, clearing tokens');
            if (window.authUtils && window.authUtils.clearAuthTokens) {
              window.authUtils.clearAuthTokens();
            }
            // Only redirect if not on homepage (workspace should redirect, but check to be safe)
            const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';
            if (!isHomepage) {
              console.log('[WORKSPACE] Redirecting to login (not on homepage)');
              const redirectParam = encodeURIComponent(window.location.pathname + window.location.search);
              window.location.href = `/login?redirect=${redirectParam}`;
            } else {
              console.log('[WORKSPACE] On homepage, not redirecting to prevent loops');
            }
            throw new Error('Unauthorized');
          }
          return response;
        } else {
          // Refresh failed, clear tokens
          console.warn('[WORKSPACE] Token refresh failed');
          if (window.authUtils && window.authUtils.clearAuthTokens) {
            window.authUtils.clearAuthTokens();
          }
          // Only redirect if not on homepage
          const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';
          if (!isHomepage) {
            console.log('[WORKSPACE] Redirecting to login (not on homepage)');
            const redirectParam = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login?redirect=${redirectParam}`;
          } else {
            console.log('[WORKSPACE] On homepage, not redirecting to prevent loops');
          }
          throw new Error('Unauthorized');
        }
      } else {
        // No auth utils available
        console.warn('[WORKSPACE] No auth utils');
        // Only redirect if not on homepage
        const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';
        if (!isHomepage) {
          console.log('[WORKSPACE] Redirecting to login (not on homepage)');
          const redirectParam = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?redirect=${redirectParam}`;
        } else {
          console.log('[WORKSPACE] On homepage, not redirecting to prevent loops');
        }
        throw new Error('Unauthorized');
      }
    }

    return response;
  }

  /**
   * Fetch Tamil transliteration suggestions for a given query
   * @param {Object} params - { q: string, mode: string, limit: number }
   * @returns {Promise<Array>} Array of suggestion objects
   */
  async fetchRunnerSuggestions(params) {
    // CRITICAL: Declare cacheKey at the very beginning to prevent ReferenceError
    // Extract parameters first
    const query = (params && params.q) ? String(params.q).trim() : '';
    const mode = (params && params.mode) || 'smart';
    const limit = (params && params.limit) || 8;
    
    // Create cache key IMMEDIATELY - this prevents "cacheKey is not defined" errors
    const cacheKey = `${mode}:${query}`;
    
    // Ensure suggestionCache is initialized
    if (!this.suggestionCache) {
      this.suggestionCache = new Map();
    }
    
    // In read-only mode (View Draft), never fetch or show IME suggestions
    if (this.readOnly || window.WORKSPACE_READONLY) {
      this.displaySuggestions([]);
      return [];
    }

    // Validate query - MUST be non-empty Latin string
    if (!query || query.length === 0) {
      console.warn('[IME] fetchRunnerSuggestions: Empty query provided, skipping API call');
      this.displaySuggestions([]);
      return [];
    }
    
    // CRITICAL: Only allow Latin characters for transliteration
    // If query contains non-Latin characters, don't call the API
    if (!/^[a-zA-Z]+$/.test(query)) {
      console.warn('[IME] fetchRunnerSuggestions: Non-Latin characters in query:', query, '- skipping API call');
      this.displaySuggestions([]);
      return [];
    }

    // Check cache first
    if (this.suggestionCache) {
      const cached = this.suggestionCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < (this.CACHE_TTL_MS || 300000)) {
        console.log('[IME] Using cached suggestions for:', query);
        this.currentSuggestions = cached.suggestions;
        this.activeSuggestionIndex = 0;
        this.displaySuggestions(cached.suggestions);
        return cached.suggestions;
      }
    }

    // Prevent duplicate requests (same query already in-flight)
    if (this.fetchingSuggestions && this.currentFetchQuery === query) {
      console.log('[IME] Already fetching for query:', query);
      return [];
    }

    // Abort in-flight request to avoid stale responses.
    if (this._imeAbortController) {
      try { this._imeAbortController.abort(); } catch (_e) {}
    }
    const controller = new AbortController();
    this._imeAbortController = controller;

    // Set fetching state + request sequencing (prevents stale responses overwriting the UI)
    const requestSeq = ++this._imeRequestSeq;
    this.fetchingSuggestions = true;
    this.currentFetchQuery = query;

    try {
      // Build API URL - use in-process suggest engine (fast path)
      const url = `/api/v1/suggest?q=${encodeURIComponent(query)}&limit=${limit}&_ts=${Date.now()}&_r=${Math.random().toString(36).slice(2)}`;
      
      console.log('[IME] Fetching suggestions for:', query, 'from:', url);

      // Fetch from API
      // IMPORTANT: Don't use apiFetch here - this endpoint doesn't require auth
      // Using regular fetch prevents auth redirects that might interfere with suggestions
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
        },
        credentials: 'same-origin', // Include cookies but don't require auth headers
        signal: controller.signal,
      });

      // If the token has changed since this request started, ignore the result
      if (this.lastFetchToken && this.lastFetchToken !== query) {
        console.log('[IME] Stale response ignored (token changed):', { query, lastFetchToken: this.lastFetchToken });
        return [];
      }

      // Handle response
      if (!response.ok) {
        console.error('[IME] API error:', response.status, response.statusText);
        // Try to get error details
        let errorDetails = null;
        try {
          const errorText = await response.text();
          console.error('[IME] API error raw response:', errorText);
          try {
            errorDetails = JSON.parse(errorText);
            console.error('[IME] API error details (parsed):', errorDetails);
          } catch (parseError) {
            console.error('[IME] Error response is not JSON:', errorText);
            errorDetails = { error: errorText, raw: true };
          }
        } catch (e) {
          console.error('[IME] Could not read error response:', e);
        }
        
        // Log the full URL that was requested
        console.error('[IME] Failed request URL:', url);
        console.error('[IME] Query parameter "q":', query);
        console.error('[IME] Query parameter "mode":', mode);
        console.error('[IME] Query parameter "limit":', limit);
        
        // Only clear UI if this request is still the latest for the current token
        if (requestSeq >= this._imeLastAppliedSeq && this.lastFetchToken === query) {
          this._imeLastAppliedSeq = requestSeq;
          this.displaySuggestions([]);
        }
        return [];
      }

      // Parse response
      const data = await response.json();
      const rawSuggestions = (data.suggestions || []).map(s => {
        let text = s.word || s.text || s.ta || '';
        // Clean text: remove superscript numbers (¹²³), formatting characters, and normalize
        text = text.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, ''); // Remove superscript numbers
        text = text.replace(/[²³]/g, ''); // Remove other formatting
        text = text.trim();
        return {
          text: text,
          score: typeof s.score === 'number' ? s.score : 0,
        };
      }).filter(s => s.text && s.text.length > 0);

      console.log('[IME] ✅ API call successful!');
      console.log('[IME] Received', rawSuggestions.length, 'raw suggestions:', rawSuggestions);

      // Clean and rank suggestions
      // Check if helper functions exist, if not use raw suggestions
      let cleaned = rawSuggestions;
      let ranked = rawSuggestions;
      
      if (typeof cleanTamilSuggestions === 'function') {
        cleaned = cleanTamilSuggestions(rawSuggestions, query);
        console.log('[IME] After cleaning:', cleaned.length, 'suggestions');
      } else {
        console.log('[IME] cleanTamilSuggestions not available, using raw suggestions');
      }
      
      if (typeof rankTamilCandidates === 'function') {
        ranked = rankTamilCandidates(query, cleaned);
        console.log('[IME] After ranking:', ranked.length, 'suggestions');
      } else {
        console.log('[IME] rankTamilCandidates not available, using cleaned suggestions');
        ranked = cleaned;
      }
      
      // If cleaning/ranking removed everything, use raw suggestions
      if (ranked.length === 0 && rawSuggestions.length > 0) {
        console.warn('[IME] ⚠️ Cleaning/ranking removed all suggestions, using raw suggestions');
        ranked = rawSuggestions;
      }
      
      // Filter low-quality suggestions for longer inputs
      // BUT: Be more lenient to ensure we always have suggestions
      let finalSuggestions = ranked;
      if (query.length > 3) {
        // More lenient filtering: lower score threshold and allow longer words
        finalSuggestions = ranked.filter(s => s.score > 0.1 || s.text.length <= query.length + 3);
        // If still empty, just take top suggestions regardless of score
        if (finalSuggestions.length === 0 && ranked.length > 0) {
          finalSuggestions = ranked.slice(0, 4);
          console.log('[IME] Using all ranked suggestions (filter was too strict)');
        }
      }

      // Deduplicate by normalized text so the same word never appears twice (prevents duplicates like "ணா", "ணா")
      const seen = new Set();
      finalSuggestions = finalSuggestions.filter(s => {
        const t = (s.text || s.word || '').toString().trim();
        if (!t) return false;
        const key = t.normalize ? t.normalize('NFC') : t;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Limit to 4 suggestions for better performance and smaller dropdown
      finalSuggestions = finalSuggestions.slice(0, 4);
      
      // CRITICAL: If we still have no suggestions but rawSuggestions had items, use them (deduped)
      if (finalSuggestions.length === 0 && rawSuggestions.length > 0) {
        console.warn('[IME] ⚠️ All suggestions filtered out, using raw suggestions');
        const rawSeen = new Set();
        finalSuggestions = rawSuggestions.filter(s => {
          const t = (s.text || s.word || '').toString().trim();
          if (!t) return false;
          const key = t.normalize ? t.normalize('NFC') : t;
          if (rawSeen.has(key)) return false;
          rawSeen.add(key);
          return true;
        }).slice(0, 4);
      }
      
      console.log('[IME] Final suggestions after filtering:', finalSuggestions.length, finalSuggestions);

      // Cache results (cap size so recent queries stay hot and we avoid unbounded growth)
      if (this.suggestionCache && cacheKey) {
        this.suggestionCache.set(cacheKey, {
          suggestions: finalSuggestions,
          timestamp: Date.now(),
        });
        const maxCacheSize = 80;
        if (this.suggestionCache.size > maxCacheSize) {
          const firstKey = this.suggestionCache.keys().next().value;
          if (firstKey !== undefined) this.suggestionCache.delete(firstKey);
        }
      }

      // Update state
      this.currentSuggestions = finalSuggestions;
      this.activeSuggestionIndex = 0;
      this.imeActive = finalSuggestions.length > 0;

      // Display suggestions
      console.log('[IME] About to display suggestions:', finalSuggestions.length, 'items');
      console.log('[IME] Suggestions data:', finalSuggestions);
      // Apply results only if still relevant + newest
      if (requestSeq >= this._imeLastAppliedSeq && this.lastFetchToken === query) {
        this._imeLastAppliedSeq = requestSeq;
        this.displaySuggestions(finalSuggestions);
      } else {
        console.log('[IME] Not applying suggestions (stale)', { requestSeq, lastApplied: this._imeLastAppliedSeq, query, lastFetchToken: this.lastFetchToken });
      }
      console.log('[IME] displaySuggestions called, checking if dropdown exists...');

      return finalSuggestions;

    } catch (error) {
      // Handle errors gracefully
      if (error.name === 'AbortError') {
        console.log('[IME] Request aborted');
        return [];
      }
      
      console.error('[IME] Error fetching suggestions:', error);
      if (requestSeq >= this._imeLastAppliedSeq && this.lastFetchToken === query) {
        this._imeLastAppliedSeq = requestSeq;
        this.displaySuggestions([]);
      }
      return [];
      
    } finally {
      // Reset fetching state
      this.fetchingSuggestions = false;
      this.currentFetchQuery = null;

      // If user kept typing while we were fetching, run once more for the latest queued token.
      const pending = this._imePending;
      this._imePending = null;
      if (pending && pending.q && pending.q !== query) {
        setTimeout(() => {
          try {
            this.fetchRunnerSuggestions(pending);
          } catch (_e) {
            // ignore
          }
        }, 0);
      }
    }
  }

  /**
   * Phase 7: Helper methods to abstract editor access (works with both legacy and TipTap)
   */
  getEditorText() {
    if (window.USE_TIPTAP_EDITOR && tiptapWorkspaceEditor) {
      return tiptapWorkspaceEditor.getText();
    }
    // Use editorElement directly (it's the DOM element)
    if (this.editorElement) {
      const text = this.editorElement.textContent || '';
      return text;
    }
    // Fallback: TamilEditor stores the editor element in this.editor.editor
    if (this.editor && this.editor.editor) {
      const text = this.editor.editor.textContent || '';
      return text;
    }
    console.warn("[IME] getEditorText: no valid source found", { 
      hasEditorElement: !!this.editorElement,
      hasEditor: !!this.editor 
    });
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
    // Guard: prevent double-init (constructor calls init() AND the bootstrap code calls it again)
    // Without this, periodicSaveInterval runs twice → two /api/submit calls every 30 seconds
    if (this._initCalled) {
      console.warn('[WorkspaceJS] init() already called — ignoring duplicate');
      return;
    }
    this._initCalled = true;

    // CRITICAL: Check USE_TIPTAP_EDITOR flag - ensure it's actually false
    console.log('[WorkspaceJS] Initializing - USE_TIPTAP_EDITOR:', window.USE_TIPTAP_EDITOR);
    
    // If TipTap is active, we still need to wire paste->analyze and IME suggestions.
    if (window.USE_TIPTAP_EDITOR) {
      console.log('[TipTap Migration] TipTap active - wiring events for paste + IME suggestions');
      // Apply read-only UI immediately (before mounting editor) if needed
      this.applyReadOnlyMode();
      // Listen for TipTap updates and use them to fetch IME suggestions and/or run AI analysis.
      window.addEventListener('tiptap:update', () => {
        // Debounce heavily: this fires on every keypress
        if (this._tiptapInputDebounce) clearTimeout(this._tiptapInputDebounce);
        this._tiptapInputDebounce = setTimeout(() => {
          this.handleEditorChange();
        }, 150);
      });

      // Paste should trigger analysis quickly (same intent as legacy paste handler).
      window.addEventListener('tiptap:paste', () => {
        this.queuePasteAnalyze('tiptap:paste');
      });

      // Document-level paste handler for TipTap: insert English immediately, translate in background
      const controller = this;
      document.addEventListener('paste', async function pasteTranslateHandler(e) {
        const target = e.target;
        if (!target || !(target.closest?.('#tiptap-workspace-editor') || target.closest?.('.ProseMirror'))) return;
        const pastedText = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
        if (!pastedText || !pastedText.trim()) return;
        const tamilToggle = document.getElementById('voice-lang-toggle');
        const isTamilMode = tamilToggle ? tamilToggle.getAttribute('aria-checked') === 'true' : true;
        const englishRatio = (pastedText.match(/[a-zA-Z]/g) || []).length / pastedText.length;
        if (!isTamilMode && englishRatio > 0.5) {
          e.preventDefault();
          e.stopPropagation(); // Prevent TipTap from also inserting
          if (typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
            tiptapWorkspaceEditor.chain().focus().insertContent(pastedText).run();
          }
          controller.queuePasteAnalyze('tiptap:paste');
          try {
            const response = await controller.apiFetch('/api/gemini/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: pastedText.trim() }),
            });
            const data = await response.json();
            const translated = data?.translated_text || data?.translated || '';
            if (translated && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
              const currentText = tiptapWorkspaceEditor.getText() || '';
              const newText = currentText.replace(pastedText, translated);
              if (newText !== currentText) {
                const escaped = newText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                tiptapWorkspaceEditor.commands.setContent('<p>' + escaped.replace(/\n/g, '</p><p>') + '</p>');
                controller.queuePasteAnalyze('tiptap:paste');
              }
            }
          } catch (err) {
            console.warn('[WorkspaceJS] TipTap paste translate failed:', err);
          }
        }
      }, true);

      // Ensure TipTap editor is mounted and toolbar wired.
      try {
        switchWorkspaceEditor();
      } catch (e) {
        console.warn('[TipTap Migration] switchWorkspaceEditor failed (non-fatal):', e?.message);
      }

      // CRITICAL: DO NOT enable TransliterationTypeahead (V2) for TipTap editor
      // Workspace uses its own pipeline (handleEditorChange -> fetchRunnerSuggestions -> displaySuggestions)
      // Enabling V2 causes duplicate dropdowns (tamil-suggestions-dropdown + translit-dropdown)
      // 
      // Clean up any V2 instances that might have been created
      try {
        if (this.translitTypeahead) {
          // Clean up any V2 dropdowns
          const v2Dropdowns = document.querySelectorAll('.translit-dropdown');
          v2Dropdowns.forEach(dd => {
            if (dd.parentNode) dd.parentNode.removeChild(dd);
          });
          // Destroy the typeahead instance
          if (this.translitTypeahead.closeDropdown) {
            this.translitTypeahead.closeDropdown();
          }
          this.translitTypeahead = null;
        }
      } catch (_e) {
        // non-fatal
      }
      return;
    }

    const editorElement = document.getElementById('editor');
    console.log('[WorkspaceJS] Editor element found:', !!editorElement);
    if (editorElement) {
      try {
        if (typeof TamilEditor !== 'undefined') {
          this.editor = new TamilEditor(editorElement);
          console.log('[WorkspaceJS] TamilEditor class used for editor');
        } else {
          console.warn('[WorkspaceJS] TamilEditor class not defined - using fallback editor wrapper');
          this.editor = createFallbackEditorWrapper(editorElement);
        }
        this.editor.onChange = () => {
          console.log("[IME] TamilEditor onChange callback triggered");
          this.handleEditorChange();
        };
        console.log("[IME] Editor initialized, onChange callback set", {
          editor: !!this.editor,
          editorElement: !!editorElement,
          hasOnChange: typeof this.editor.onChange === 'function'
        });
      } catch (e) {
        console.error('[WorkspaceJS] Editor initialization failed:', e);
        this.editor = createFallbackEditorWrapper(editorElement);
        this.editor.onChange = () => this.handleEditorChange();
        console.log('[WorkspaceJS] Fallback editor wrapper attached after error');
      }
      
      // Also add direct input listener as fallback (but debounced to prevent duplicates)
      // This ensures handleEditorChange is called even if editor.onChange doesn't fire
      let inputDebounce = null;
      editorElement.addEventListener('input', (e) => {
        console.log("[IME] 🔔 Input event detected on editor element, inputType:", e.inputType, 'data:', e.data);
        
        // Check if this is a paste event
        const isPaste = e.inputType === 'insertFromPaste' || e.inputType === 'insertFromPasteAsQuotation';
        if (isPaste) {
          console.log("[IME] 📋 Input event triggered by paste, inputType:", e.inputType);
          this.queuePasteAnalyze('legacy:input');
        }
        
        if (inputDebounce) {
          clearTimeout(inputDebounce);
        }
        inputDebounce = setTimeout(() => {
          console.log("[IME] 🔔 Direct input event listener fired - calling handleEditorChange");
          // Call handleEditorChange directly (it will check USE_TIPTAP_EDITOR itself)
          this.handleEditorChange();
          inputDebounce = null;
        }, 150); // Small debounce to prevent duplicate calls
      }, { passive: true });
      
      console.log('[WorkspaceJS] ✅ Input event listener attached to editor element');
      
      // Also listen to keyup events as additional fallback
      editorElement.addEventListener('keyup', (e) => {
        // Only trigger for letter keys (not modifiers, arrows, etc.)
        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
          console.log("[IME] 🔔 Keyup event for letter:", e.key);
          if (inputDebounce) {
            clearTimeout(inputDebounce);
          }
          inputDebounce = setTimeout(() => {
            console.log("[IME] 🔔 Keyup triggered handleEditorChange");
            this.handleEditorChange();
            inputDebounce = null;
          }, 150);
        }
      }, { passive: true });
      
      this.editorElement = editorElement;
      editorElement.addEventListener('scroll', () => this.repositionTranslitDropdown());
      editorElement.addEventListener('blur', () => this.clearTranslitSuggestions());
      window.addEventListener('resize', () => this.repositionTranslitDropdown());
      this.editorElement.addEventListener('keydown', (e) => this.handleKeyDown(e));
      
      // Add paste handler to trigger AI suggestions for pasted Tamil text
      // Store reference to controller for use in paste handler
      const controller = this;
      
      const pasteHandler = async function(e) {
        const pastedText = (e.clipboardData || window.clipboardData || e.originalEvent?.clipboardData)?.getData('text/plain') ||
                          (e.clipboardData || window.clipboardData)?.getData('text') || '';
        if (!pastedText || pastedText.trim().length === 0) return;

        // Tamil icon ON (aria-checked="true") = Tamil mode; OFF = English mode
        const tamilToggle = document.getElementById('voice-lang-toggle');
        const isTamilMode = tamilToggle ? tamilToggle.getAttribute('aria-checked') === 'true' : true;
        const englishRatio = (pastedText.match(/[a-zA-Z]/g) || []).length / pastedText.length;
        const isMostlyEnglish = englishRatio > 0.5;

        // When Tamil icon OFF + English paste: insert English immediately, then translate in background
        if (!isTamilMode && isMostlyEnglish) {
          e.preventDefault();
          e.stopPropagation();
          // Insert English text immediately
          if (window.USE_TIPTAP_EDITOR && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
            tiptapWorkspaceEditor.chain().focus().insertContent(pastedText).run();
          } else {
            document.execCommand('insertText', false, pastedText);
          }
          controller.queuePasteAnalyze('legacy:paste');
          // Translate in background, then replace
          try {
            const response = await controller.apiFetch('/api/gemini/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: pastedText.trim() }),
            });
            const data = await response.json();
            const translated = data?.translated_text || data?.translated || '';
            if (translated) {
              const currentText = controller.getEditorText() || '';
              const newText = currentText.replace(pastedText, translated);
              if (newText !== currentText) {
                if (window.USE_TIPTAP_EDITOR && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
                  const escaped = newText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  tiptapWorkspaceEditor.commands.setContent('<p>' + escaped.replace(/\n/g, '</p><p>') + '</p>');
                } else if (controller.editor && typeof controller.editor.setText === 'function') {
                  controller.editor.setText(newText);
                } else if (controller.editorElement) {
                  controller.editorElement.textContent = newText;
                  controller.editorElement.dispatchEvent(new Event('input', { bubbles: true }));
                }
                controller.queuePasteAnalyze('legacy:paste');
              }
            }
          } catch (err) {
            console.warn('[WorkspaceJS] Paste translate failed:', err);
          }
          return;
        }

        controller.queuePasteAnalyze('legacy:paste');
      };
      
      // Capture-phase handler: intercept paste when Tamil OFF + English (translate before insert)
      const isInWorkspaceEditor = (el) => el && (el === editorElement || el.closest?.('#editor') || el.closest?.('#tiptap-workspace-editor') || el.closest?.('.ProseMirror'));
      document.addEventListener('paste', function(e) {
        const target = e.target;
        if (!isInWorkspaceEditor(target)) return;
        pasteHandler(e);
      }, true);

      editorElement.addEventListener('paste', pasteHandler, false);

      // Backup paste handler: runs even if primary handlers fail (e.g. editor init failed). Detects Tamil and triggers analysis after 500ms.
      document.addEventListener('paste', function(e) {
        try {
          const pastedText = (e.clipboardData || window.clipboardData) ? (e.clipboardData || window.clipboardData).getData('text/plain') || '' : '';
          if (!pastedText || !/[\u0B80-\u0BFF]/.test(pastedText)) return;
          console.log('[WorkspaceJS] 📋 Backup paste: Tamil detected, scheduling autoAnalyze in 500ms');
          setTimeout(function() {
            if (controller && typeof controller.autoAnalyze === 'function') {
              controller.autoAnalyze();
            }
          }, 500);
        } catch (err) {
          console.warn('[WorkspaceJS] Backup paste handler error:', err);
        }
      }, true);

      console.log('[WorkspaceJS] ✅ Paste event listeners attached (bubble, capture, document, and backup)');
    }

    // Apply read-only mode after editor is mounted (disables contenteditable/title/toolbar)
    this.applyReadOnlyMode();

    // CRITICAL: DO NOT enable TransliterationTypeahead (V2) in workspace
    // Workspace uses its own pipeline (handleEditorChange -> fetchRunnerSuggestions -> displaySuggestions)
    // Enabling V2 causes duplicate dropdowns (tamil-suggestions-dropdown + translit-dropdown)
    // The homepage editor works because it only uses ONE system (home-editor.js)
    // 
    // If V2 was previously enabled, ensure it's disabled and cleaned up
    if (this.translitTypeahead) {
      try {
        if (this.translitTypeahead.closeDropdown) {
          this.translitTypeahead.closeDropdown();
        }
        this.translitTypeahead = null;
      } catch (_e) {
        // non-fatal
      }
    }
    // Clean up any V2 dropdowns that might exist
    const v2Dropdowns = document.querySelectorAll('.translit-dropdown');
    v2Dropdowns.forEach(dd => {
      if (dd.parentNode) dd.parentNode.removeChild(dd);
    });

    // Proofread V2 highlights (feature-flagged)
    if (window.PROOFREAD_V2 && window.ProofreadHighlights && editorElement) {
      this.proofreadHighlights = new window.ProofreadHighlights(editorElement);
    }

    // IME transliteration (runner-backed); enable whenever the helper exists
    // NOTE: We intentionally do NOT enable the separate runner-backed IMETypeahead here.
    // Workspace uses its own pipeline (handleEditorChange -> /api/transliterate/suggest -> displaySuggestions).
    // Having both systems enabled causes race conditions and UI showing "[object Object]".
    // CRITICAL: Disable TransliterationTypeahead (V2) to prevent duplicate dropdowns
    // The workspace.js pipeline handles all suggestion UI via displaySuggestions()

    // Initialize suggestions panel
    const container = document.getElementById('suggestions-container');
    const summary = document.getElementById('suggestions-summary');
    const acceptAllBtn = document.getElementById('accept-all-btn');
    
    if (container && summary && acceptAllBtn) {
      this.suggestionsPanel = new SuggestionsPanel(container, summary, acceptAllBtn);
      this.suggestionsPanel.onAcceptSuggestion = () => this.handleSuggestionAccepted();
      this.suggestionsPanel.onClearHighlights = () => this._clearCorrectionHighlights();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Set up inline correction highlight handlers (click, hover tooltip)
    this._setupCorrectionHighlighting();

    // Update status displays
    this.updateWordCount();
    this.updateAcceptedCount();
    
    // Check for URL hash to open specific draft
    this.checkUrlHash();

    // Start in editor mode
    this.showEditor();

    // Periodic save: fire autosave() every 30 seconds so edits are never lost
    // even when the user types continuously without a pause long enough to trigger
    // the 2-second debounce in scheduleSave().
    if (!this.readOnly) {
      this.periodicSaveInterval = setInterval(() => {
        this.autosave();
      }, 30_000);
    }

    // Header plan-status pill: paints Pro / Free / Expiring / Past-due
    // based on usage/today. Refreshes on tab focus + every 60s so an
    // upgrade or a payment failure surfaces in the header without a
    // page reload.
    this.startPlanPillLifecycle();
  }
  
  checkUrlHash() {
    // Check for draftId in query parameter first (from drafts page)
    const urlParams = new URLSearchParams(window.location.search);
    const draftIdFromQuery = urlParams.get('draftId');
    if (draftIdFromQuery) {
      const draftId = parseInt(draftIdFromQuery);
      if (draftId && !isNaN(draftId)) {
        console.log('[WorkspaceJS] Opening draft from URL query parameter:', draftId);
        
        // Ensure editor panel is visible before loading (so content lands in visible editor)
        this.showEditor();
        
        // Wait for editor DOM to be available before loading draft (retry up to ~3s)
        let attempts = 0;
        const maxAttempts = 15;
        const checkEditorReady = () => {
          const editorEl = this.editorElement || document.getElementById('editor');
          const editorReady = editorEl ||
                            (this.editor && this.editor.editor) ||
                            (window.USE_TIPTAP_EDITOR && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor);
          
          if (editorReady) {
            if (!this.editorElement && editorEl) this.editorElement = editorEl;
            console.log('[WorkspaceJS] Editor is ready, loading draft');
            this.openDraft(draftId);
          } else if (attempts < maxAttempts) {
            attempts++;
            console.log('[WorkspaceJS] Editor not ready yet, retry', attempts, '/', maxAttempts);
            setTimeout(checkEditorReady, 200);
          } else {
            console.warn('[WorkspaceJS] Editor not ready after retries, loading draft anyway');
            this.openDraft(draftId);
          }
        };
        
        setTimeout(checkEditorReady, 300);
        return;
      }
    }
    
    // Also check for draft in hash (legacy support)
    const hash = window.location.hash;
    if (hash && hash.startsWith('#draft-')) {
      const draftId = parseInt(hash.replace('#draft-', ''));
      if (draftId && !isNaN(draftId)) {
        console.log('[WorkspaceJS] Opening draft from URL hash:', draftId);
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

    // Logout button - use centralized logout function if available, otherwise use this.logout()
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      // Workspace page uses its own header (no nav.ejs), so we MUST attach a handler here.
      // Keep this idempotent so hot reload / multiple inits don't double-bind.
      if (!logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = 'true';
        logoutBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[WORKSPACE] Logout clicked');

          try {
            // Best-effort: call logout API (revokes refresh token server-side)
            await fetch('/auth/logout', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              keepalive: true,
            }).catch(() => {});
          } finally {
            // Always clear client-side tokens
            if (window.authUtils && window.authUtils.clearAuthTokens) {
              window.authUtils.clearAuthTokens();
            } else {
              try { localStorage.removeItem('access_token'); } catch (_e) {}
              const cookieOptions = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
              document.cookie = `access_token=; ${cookieOptions}`;
              document.cookie = `refresh_token=; ${cookieOptions}`;
              document.cookie = `proof_refresh_token=; ${cookieOptions}`;
            }
            // Redirect to login (clear UX)
            window.location.replace('/login');
          }
        });
      }
    }

    // New Draft button — check daily quota BEFORE opening editor so a
    // free user who's already used their 20 credits sees the upgrade
    // modal instead of a fresh editor they can't submit from.
    const newDraftBtn = document.getElementById('new-draft-btn');
    if (newDraftBtn) {
      newDraftBtn.addEventListener('click', () => this.gatedCreateNewDraft());
    }

    // Create First Draft button (empty state) — same gate applies.
    const createFirstDraftBtn = document.getElementById('create-first-draft-btn');
    if (createFirstDraftBtn) {
      createFirstDraftBtn.addEventListener('click', () => this.gatedCreateNewDraft());
    }

    // My Drafts link - use JS navigation so we can prevent default and ensure /drafts (element is now <a href="/drafts">)
    const showDraftsBtn = document.getElementById('show-drafts-btn');
    if (showDraftsBtn) {
      showDraftsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/drafts';
      });

    // CRITICAL: DO NOT enable TransliterationTypeahead (V2) in workspace
    // Workspace uses its own pipeline (handleEditorChange -> fetchRunnerSuggestions -> displaySuggestions)
    // Enabling both causes duplicate dropdowns (tamil-suggestions-dropdown + translit-dropdown)
    // The homepage editor works because it only uses ONE system (home-editor.js)
    // 
    // If Transliteration V2 was previously enabled, clean it up and ensure it's disabled
    try {
      if (this.translitTypeahead) {
        // Clean up any V2 dropdowns
        const v2Dropdowns = document.querySelectorAll('.translit-dropdown');
        v2Dropdowns.forEach(dd => {
          if (dd.parentNode) dd.parentNode.removeChild(dd);
        });
        // Destroy the typeahead instance
        if (this.translitTypeahead.closeDropdown) {
          this.translitTypeahead.closeDropdown();
        }
        this.translitTypeahead = null;
      }
      // Also remove any legacy dropdowns that might exist
      const legacy = document.getElementById('tamil-suggestions-dropdown');
      if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
      this.clearGhostText && this.clearGhostText();
      this.clearTranslitSuggestions && this.clearTranslitSuggestions();
      this.imeActive = false;
    } catch (_e) {
      // non-fatal
    }
    }

    // Translate English to Tamil button
    const translateBtn = document.getElementById('translate-english-btn');
    if (translateBtn) {
      translateBtn.addEventListener('click', () => this.translateEnglishToTamil());
    }

    // Mode select should affect IME suggestions immediately
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) {
      modeSelect.addEventListener('change', () => {
        try {
          console.log('[IME] Mode changed to:', modeSelect.value);
          // Clear caches so new mode isn't served stale suggestions
          if (this.suggestionCache && typeof this.suggestionCache.clear === 'function') {
            this.suggestionCache.clear();
          }
          this.lastFetchToken = null;
          this.currentTokenInfo = null;
          this.clearSuggestions?.();
          // Re-evaluate current token and refetch suggestions in new mode
          setTimeout(() => this.handleEditorChange(), 50);
        } catch (_e) {
          // non-fatal
        }
      });
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
    console.log('[IME] 📝 handleEditorChange called');
    // Support both legacy + TipTap editors.
    // TipTap does NOT have our IME extension here, so we still need to fetch suggestions.
    
    this.updateWordCount();
    this.scheduleSave();

    // If Transliteration V2 is active, skip ONLY the legacy IME suggest/commit logic.
    // Keep AI proofreading working as before.
    const v2 = !!this.translitTypeahead;
    if (v2) {
      const textNow = this.getEditorText() || '';
      const hasTamil = /[\u0B80-\u0BFF]/.test(textNow);
      if (hasTamil) {
        if (this.pasteSuppressUntil && Date.now() < this.pasteSuppressUntil) {
          console.log('[AI] 📋 Skipping handleEditorChange-triggered analysis (paste gate active)');
          return;
        }
        if (this.analysisTimeout) clearTimeout(this.analysisTimeout);
        this.analysisTimeout = setTimeout(() => {
          this.autoAnalyze();
        }, 2000);
      }
      return;
    }
    
    // Extract token FIRST before using it
    const text = this.getEditorText() || '';
    let tokenInfo = null;
    let token = '';
    // Used only for debug logs; must be defined in both TipTap + legacy flows
    let caretPos = null;

    if (window.USE_TIPTAP_EDITOR && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
      const tipTapToken = getTipTapTokenBeforeCaret();
      if (tipTapToken && tipTapToken.token) {
        tokenInfo = { token: tipTapToken.token, start: tipTapToken.fromPos, end: tipTapToken.toPos };
        token = tipTapToken.token.trim().toLowerCase();
        caretPos = tipTapToken.toPos;
      } else {
        // Best-effort caret position for debug output
        try {
          caretPos = tiptapWorkspaceEditor?.state?.selection?.from ?? null;
        } catch (_e) {
          caretPos = null;
        }
      }
    } else {
      const caretPosLocal =
        (this.editor && typeof this.editor.getCursorPosition === 'function' && this.editor.getCursorPosition()) ||
        text.length;
      tokenInfo = getTokenAtCaret(text, caretPosLocal);
      token = tokenInfo.token ? tokenInfo.token.trim().toLowerCase() : '';
      // keep for debug logs (outer var)
      caretPos = caretPosLocal;
    }
    
    // CRITICAL: Skip fetching suggestions ONLY if we just replaced a token AND it's the same token
    // This prevents the dropdown from showing again immediately after selection for the SAME word
    // But allows fetching for the NEXT word
    if (this.justReplacedToken && this.lastFetchToken && token === this.lastFetchToken) {
      console.log('[IME] ⏭️ Skipping suggestion fetch - just replaced this same token:', token);
      return;
    }
    
    // If flag is set but token changed, clear it and proceed (user moved to next word)
    if (this.justReplacedToken && (!this.lastFetchToken || token !== this.lastFetchToken)) {
      console.log('[IME] ✅ Token changed after replacement, clearing flag and allowing fetch');
      this.justReplacedToken = false;
    }
    
    console.log('[IME] Extracted token:', token, 'from text:', text.substring(0, 50));
    console.log('[IME] Token info:', {
      token,
      length: token.length,
      isLatin: /^[a-z]+$/i.test(token),
      caretPos,
      textLength: text.length
    });
    
    // MINIMAL GUARDS: Only check if token exists and is Latin
    // Suggestions work from 1 character (backend and Express fallback support it)
    if (!token || token.length < 1) {
      console.log('[IME] ⚠️ Token is empty - no Latin characters found at cursor');
      if (this.lastFetchToken) {
        this.lastFetchToken = null;
        this.currentTokenInfo = null;
        this.clearSuggestions();
      }
      // When editor has Tamil but cursor is not in a Latin word, show hint so user knows to type in English
      const hasTamil = /[\u0B80-\u0BFF]/.test(text);
      if (hasTamil && text.trim().length > 0) {
        this.showSuggestionsHint('Type in English (e.g. tamil) to get Tamil suggestions.');
      }
      return;
    }
    
    // Check if token is Latin (allow single characters)
    if (!/^[a-z]+$/i.test(token)) {
      console.log('[IME] ⚠️ Token is not valid Latin:', token, {
        isNotLatin: !/^[a-z]+$/i.test(token),
        tokenValue: token
      });
      
      // If token is Tamil or other non-Latin, trigger AI analysis instead of transliteration
      const hasTamil = /[\u0B80-\u0BFF]/.test(text);
      if (hasTamil) {
        // If a paste just happened, let the paste handler drive exactly ONE analyze call.
        if (this.pasteSuppressUntil && Date.now() < this.pasteSuppressUntil) {
          console.log('[AI] 📋 Skipping handleEditorChange-triggered analysis (paste gate active)');
          return;
        }
        console.log('[IME] 🔍 Tamil text detected in editor, triggering AI analysis...');
        // Debounce AI analysis to avoid too many calls
        if (this.analysisTimeout) {
          clearTimeout(this.analysisTimeout);
        }
        this.analysisTimeout = setTimeout(() => {
          console.log('[IME] 🚀 Triggering autoAnalyze for Tamil text...');
          this.autoAnalyze();
        }, 2000); // 2 second debounce for AI analysis
      }
      
      // Clear transliteration suggestions if token is invalid
      if (this.lastFetchToken) {
        this.lastFetchToken = null;
        this.currentTokenInfo = null;
        this.clearSuggestions();
      }
      // When cursor is in Tamil text, show hint so user knows to type in English
      if (hasTamil) {
        this.showSuggestionsHint('Type in English (e.g. tamil) to get Tamil suggestions.');
      }
      return;
    }
    
    // Token validated - proceed with fetch
    
    // Store token info ONLY for Latin tokens (for potential replacement)
    this.currentTokenInfo = {
      token: token,
      start: tokenInfo.start,
      end: tokenInfo.end
    };
    
    // Prevent duplicate requests for the same token
    if (this.lastFetchToken === token) {
      if (this.fetchingSuggestions && this.currentFetchQuery === token) {
        return; // Already fetching
      }
      if (this.suggestDebounce) {
        return; // Debounce pending
      }
    }
    
    // Cancel previous request if token changed
    if (this.translitAbort && this.lastFetchToken && this.lastFetchToken !== token) {
      this.translitAbort.abort();
      this.translitAbort = null;
      this.fetchingSuggestions = false;
    }
    
    // Clear previous debounce
    if (this.suggestDebounce) {
      clearTimeout(this.suggestDebounce);
      this.suggestDebounce = null;
    }
    
    // Store token BEFORE debounce
    this.lastFetchToken = token;
    
    // Debounce the fetch to keep UI responsive while still updating per-keystroke.
    // Goal: suggestions should update for each letter typed (n -> na -> nam -> ...).
    // OPTIMIZED: Slightly longer debounce reduces cancelled/slow API calls when user types quickly
    // - Short tokens (1-2 chars): 180ms debounce
    // - Longer tokens (3+ chars): 220ms debounce
    const debounceMs = token.length <= 2 ? 180 : 220;
    this.suggestDebounce = setTimeout(() => {
      // Final check: token must still match
      if (this.lastFetchToken !== token) {
        return; // Token changed during debounce, skip
      }
      
      // Clear debounce reference
      this.suggestDebounce = null;
      
      // Final duplicate check before making the call
      if (this.fetchingSuggestions && this.currentFetchQuery === token) {
        return; // Already fetching this token
      }
      
      // Use selected mode from UI dropdown (spoken | formal | academic)
      const mode = (this.getMode && this.getMode()) || 'spoken';
      this.lastFetchTime = Date.now();
      
      // Make the API call
      this.fetchRunnerSuggestions({ q: token, limit: 8, mode: mode }).then(suggestions => {
        // Logging handled in transliterator-runner.js
      }).catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[IME] Fetch error:', err.message);
        }
        // Reset state on error so next call can proceed
        this.fetchingSuggestions = false;
        this.currentFetchQuery = null;
      });
    }, debounceMs);
  }
  
  clearSuggestions() {
    this.currentSuggestions = [];
    this.lastRunnerSuggestions = [];
    this.imeActive = false;
    this.editorMode = window.EditorMode ? window.EditorMode.IDLE : 'IDLE';
    if (this.renderTranslitSuggestions) {
      this.renderTranslitSuggestions('', []);
    }
  }

  /**
   * Show a hint in the suggestions dropdown when there is no Latin token at caret (e.g. cursor in Tamil text).
   * Explains that suggestions appear when typing in English (Roman).
   */
  showSuggestionsHint(message) {
    if (!message || typeof message !== 'string') return;
    // Remove any existing suggestion dropdowns first
    document.querySelectorAll('#tamil-suggestions-dropdown').forEach(dd => {
      dd.style.display = 'none';
      if (dd.parentNode) dd.parentNode.removeChild(dd);
    });
    const dropdown = document.createElement('div');
    dropdown.id = 'tamil-suggestions-dropdown';
    dropdown.className = 'tamil-suggestions-dropdown';
    dropdown.style.pointerEvents = 'auto';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tamil-suggestions-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.onclick = () => {
      if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
    };
    const hint = document.createElement('div');
    hint.className = 'tamil-suggestions-hint';
    hint.style.padding = '10px 14px';
    hint.style.color = '#6b7280';
    hint.style.fontSize = '13px';
    hint.style.lineHeight = '1.4';
    hint.textContent = message;
    dropdown.appendChild(closeBtn);
    dropdown.appendChild(hint);
    document.body.appendChild(dropdown);
    // Position near editor/cursor if we have a reference
    const editorEl = this.editorElement || document.querySelector('[contenteditable="true"]');
    if (editorEl) {
      const rect = editorEl.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.left = rect.left + 'px';
      dropdown.style.top = (rect.top + rect.height + 4) + 'px';
      dropdown.style.minWidth = '280px';
      dropdown.style.maxWidth = '360px';
    }
    dropdown.style.display = 'block';
  }

  // DEPRECATED: Use getTokenAtCaret instead
  // Keeping for backward compatibility but should be removed
  getCurrentWord() {
    const text = this.getEditorText() || '';
    const caretPos = (this.editor.getCursorPosition && this.editor.getCursorPosition()) || text.length;
    const { token } = getTokenAtCaret(text, caretPos);
    return token || '';
  }

  /**
   * Display suggestions in a dropdown near the cursor
   * @param {Array} suggestions - Array of suggestion objects with {text, score}
   */
  displaySuggestions(suggestions) {
    // V3 module handles all suggestion UI — skip legacy pipeline to avoid conflicts
    if (window.__TRANSLIT_V3_LOADED) {
      this._isRenderingDropdown = false;
      return;
    }
    console.log('[IME] 🔍 displaySuggestions called with:', suggestions ? suggestions.length : 0, 'suggestions');
    console.log('[IME] Suggestions data:', suggestions);

    // CRITICAL: Prevent multiple simultaneous renders with a lock
    if (this._isRenderingDropdown) {
      console.warn('[IME] ⚠️ Already rendering dropdown, ignoring duplicate call');
      return;
    }
    
    // CRITICAL: Remove ALL existing dropdowns FIRST to prevent duplicates
    // Remove both workspace.js dropdowns (tamil-suggestions-dropdown) AND V2 dropdowns (translit-dropdown)
    const allExistingDropdowns = document.querySelectorAll('#tamil-suggestions-dropdown');
    if (allExistingDropdowns.length > 0) {
      console.warn('[IME] ⚠️ Found', allExistingDropdowns.length, 'existing workspace dropdown(s) - removing ALL before creating new one');
      allExistingDropdowns.forEach(dd => {
        dd.style.display = 'none';
        dd.style.visibility = 'hidden';
        dd.style.opacity = '0';
        dd.innerHTML = '';
        if (dd.parentNode) {
          dd.parentNode.removeChild(dd);
        }
      });
    }
    
    // CRITICAL: Also remove V2 TransliterationTypeahead dropdowns (translit-dropdown)
    const v2Dropdowns = document.querySelectorAll('.translit-dropdown');
    if (v2Dropdowns.length > 0) {
      console.warn('[IME] ⚠️ Found', v2Dropdowns.length, 'V2 TransliterationTypeahead dropdown(s) - removing to prevent conflicts');
      v2Dropdowns.forEach(dd => {
        dd.style.display = 'none';
        dd.style.visibility = 'hidden';
        dd.style.opacity = '0';
        dd.innerHTML = '';
        if (dd.parentNode) {
          dd.parentNode.removeChild(dd);
        }
      });
      // Also close the typeahead instance if it exists
      if (this.translitTypeahead && this.translitTypeahead.closeDropdown) {
        this.translitTypeahead.closeDropdown();
      }
    }
    
    // CRITICAL: Also remove editor.js autocomplete boxes to prevent duplicate dropdowns
    const editorAutocomplete = document.querySelectorAll('.autocomplete-box');
    if (editorAutocomplete.length > 0) {
      console.warn('[IME] ⚠️ Found', editorAutocomplete.length, 'editor.js autocomplete box(es) - removing to prevent conflicts');
      editorAutocomplete.forEach(dd => {
        if (dd.parentNode) {
          dd.parentNode.removeChild(dd);
        }
      });
    }
    
    // CRITICAL: Also remove any orphaned suggestion items
    const orphanedItems = document.querySelectorAll('.tamil-suggestion-item');
    orphanedItems.forEach(item => {
      const parentDropdown = item.closest('#tamil-suggestions-dropdown');
      if (!parentDropdown) {
        console.warn('[IME] Removing orphaned suggestion item:', item);
        item.remove();
      }
    });
    
    // Set lock
    this._isRenderingDropdown = true;
    
    // Support both legacy + TipTap editors (dropdown is rendered via DOM selection/caret).

    // CRITICAL: Store suggestions in instance variable FIRST so selectSuggestion can access them
    // Normalize suggestions to ensure consistent format
    // NOTE: Suggestions are already cleaned and validated in fetchRunnerSuggestions, so we can trust them
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      this.currentSuggestions = suggestions.map(s => {
        if (typeof s === 'string') {
          // Clean the string: remove any invalid characters
          const cleaned = s.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰²³]/g, '').trim();
          return cleaned ? { text: cleaned, word: cleaned, score: 1.0 } : null;
        } else if (s && typeof s === 'object') {
          // Use the text/word that was already cleaned in fetchRunnerSuggestions
          const text = (s.text || s.word || s.ta || '').toString();
          // Additional cleaning: remove superscript numbers and invalid characters
          const cleaned = text.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰²³]/g, '').trim();
          if (!cleaned || cleaned.length === 0) {
            console.warn('[IME] Empty suggestion after cleaning:', s);
            return null;
          }
          // REMOVED: Tamil character validation - too strict, might filter valid suggestions
          // The API should return valid Tamil suggestions, so we trust them
          // if (!/[\u0B80-\u0BFF]/.test(cleaned)) {
          //   console.warn('[IME] Skipping non-Tamil suggestion:', cleaned);
          //   return null;
          // }
          return {
            text: cleaned,
            word: cleaned,
            score: typeof s.score === 'number' ? s.score : 1.0
          };
        }
        return null;
      }).filter(s => s !== null && s.text && s.text.trim().length > 0);
      
      if (this.currentSuggestions.length > 0) {
        console.log('[IME] ✅ Stored', this.currentSuggestions.length, 'valid suggestions in currentSuggestions');
        console.log('[IME] Stored suggestions:', this.currentSuggestions.map(s => s.text));
      } else {
        this.currentSuggestions = [];
        console.warn('[IME] ⚠️ No valid suggestions to store after filtering');
        console.warn('[IME] Original suggestions:', suggestions);
      }
    } else {
      this.currentSuggestions = [];
    }

    // CRITICAL: If no valid suggestions, hide dropdown and return early
    if (!this.currentSuggestions || this.currentSuggestions.length === 0) {
      this.hideSuggestions();
      this._isRenderingDropdown = false;
      return;
    }

    // CRITICAL: Remove any suggestion that would render as empty (same cleaning as loop) so indices never skip
    const cleanedList = this.currentSuggestions.filter(s => {
      const raw = (s.text || s.word || '').toString();
      const t = raw.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰²³]/g, '').trim();
      return t.length > 0;
    });
    if (cleanedList.length === 0) {
      this.hideSuggestions();
      this._isRenderingDropdown = false;
      return;
    }
    this.currentSuggestions = cleanedList;
    this.activeSuggestionIndex = 0;

    // CRITICAL: Double-check - if a dropdown still exists after cleanup, remove it
    const stillExisting = document.getElementById('tamil-suggestions-dropdown');
    if (stillExisting) {
      console.warn('[IME] ⚠️ Dropdown still exists after cleanup! Force removing...');
      stillExisting.style.display = 'none';
      stillExisting.style.visibility = 'hidden';
      stillExisting.style.opacity = '0';
      stillExisting.innerHTML = '';
      if (stillExisting.parentNode) {
        stillExisting.parentNode.removeChild(stillExisting);
      }
    }
    
    // Get or create dropdown elements
    // CRITICAL: Append directly to body, not a container, to avoid pointer-events issues
    // At this point, all existing dropdowns should have been removed above
    let dropdown = document.getElementById('tamil-suggestions-dropdown');
    if (!dropdown) {
      console.log('[IME] 📦 Creating new dropdown element');
      dropdown = document.createElement('div');
      dropdown.id = 'tamil-suggestions-dropdown';
      dropdown.className = 'tamil-suggestions-dropdown';
      // Append directly to body to avoid any parent styling/pointer-events issues
      document.body.appendChild(dropdown);
      console.log('[IME] ✅ Dropdown created and added directly to body');
    } else {
      console.error('[IME] ❌ ERROR: Dropdown still exists after cleanup! This should not happen.');
      // Force remove and recreate
      dropdown.style.display = 'none';
      dropdown.style.visibility = 'hidden';
      dropdown.style.opacity = '0';
      dropdown.innerHTML = '';
      if (dropdown.parentNode) {
        dropdown.parentNode.removeChild(dropdown);
      }
      dropdown = document.createElement('div');
      dropdown.id = 'tamil-suggestions-dropdown';
      dropdown.className = 'tamil-suggestions-dropdown';
      document.body.appendChild(dropdown);
      console.log('[IME] ✅ Dropdown recreated after force removal');
    }
    
    // CRITICAL: Set pointer-events on dropdown itself (not parent)
    dropdown.style.pointerEvents = 'auto';

    // Clear existing content completely
    dropdown.innerHTML = '';
    
    // CRITICAL: Ensure dropdown has proper overflow containment
    dropdown.style.overflow = 'hidden';
    dropdown.style.overflowY = 'hidden';
    dropdown.style.overflowX = 'hidden';

    // Hide if no suggestions
    if (!suggestions || suggestions.length === 0) {
      console.log('[IME] ⚠️ No suggestions to display, hiding dropdown');
      dropdown.style.display = 'none';
      this.translitDropdownOpen = false;
      this._isRenderingDropdown = false; // Release lock
      return;
    }

    console.log('[IME] 🎨 Building dropdown UI for', suggestions.length, 'suggestions');
    console.log('[IME] 📋 Suggestions array:', JSON.stringify(suggestions, null, 2));

    // Validate suggestions format
    if (!Array.isArray(suggestions)) {
      console.error('[IME] ❌ Suggestions is not an array:', typeof suggestions, suggestions);
      dropdown.style.display = 'none';
      this._isRenderingDropdown = false; // Release lock
      return;
    }

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tamil-suggestions-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close suggestions');
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[IME] Close button clicked - removing ALL dropdowns');
      // CRITICAL: Remove ALL dropdowns, not just hide
      const allDropdowns = document.querySelectorAll('#tamil-suggestions-dropdown');
      allDropdowns.forEach(dd => {
        dd.style.display = 'none';
        dd.style.visibility = 'hidden';
        dd.style.opacity = '0';
        dd.innerHTML = '';
        dd.remove();
      });
      // Also remove orphaned items
      document.querySelectorAll('.tamil-suggestion-item').forEach(item => {
        if (!item.closest('#tamil-suggestions-dropdown')) {
          item.remove();
        }
      });
      this.hideSuggestions();
    };
    dropdown.appendChild(closeBtn);

    // Create suggestions list
    const list = document.createElement('div');
    list.className = 'tamil-suggestions-list';
    // CRITICAL: Ensure list container has proper overflow containment
    list.style.overflow = 'hidden';
    list.style.overflowY = 'auto'; // Allow scrolling if needed, but contain items
    list.style.overflowX = 'hidden';
    list.style.maxHeight = '200px'; // Limit height to prevent overflow

    // Render each suggestion (max 4) - optimized for performance
    // CRITICAL: Strictly limit to 4 suggestions to prevent overflow
    const maxSuggestions = Math.min(this.currentSuggestions.length, 4);
    console.log('[IME] 🎯 Rendering', maxSuggestions, 'suggestions (strictly limited to 4)');
    
    for (let i = 0; i < maxSuggestions; i++) {
      // IMPORTANT: render from normalized list to avoid shape mismatches
      const suggestion = this.currentSuggestions[i];
      
      // Extract text from suggestion object (handle both {text: ...} and {word: ...} formats)
      let cleanText = '';
      if (typeof suggestion === 'string') {
        cleanText = suggestion;
      } else if (suggestion && typeof suggestion === 'object') {
        cleanText = (suggestion.text || suggestion.word || suggestion.ta || '').toString();
      }
      
      // Remove any superscript numbers or formatting characters
      cleanText = cleanText.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰²³]/g, '').trim();
      
      // Skip if no text
      if (!cleanText || cleanText.length === 0) {
        console.warn('[IME] ⚠️ Skipping empty suggestion at index', i, ':', suggestion);
        continue;
      }
      
      console.log('[IME] ✅ Rendering suggestion', i + 1, ':', cleanText);
      
      const item = document.createElement('div');
      item.className = `tamil-suggestion-item ${i === this.activeSuggestionIndex ? 'active' : ''}`;
      item.dataset.index = i;
      // CRITICAL: Store suggestion text directly in dataset so we can access it even if currentSuggestions is cleared
      item.dataset.suggestionText = cleanText;
      item.dataset.suggestionIndex = i.toString();
      // CRITICAL: Store tokenInfo in dataset so we can use it even if currentTokenInfo is cleared
      if (this.currentTokenInfo) {
        item.dataset.tokenStart = this.currentTokenInfo.start.toString();
        item.dataset.tokenEnd = this.currentTokenInfo.end.toString();
        item.dataset.token = this.currentTokenInfo.token;
      }
      
      // Ensure first item is active by default
      if (i === 0 && this.activeSuggestionIndex === 0) {
        item.classList.add('active');
      }
      
      // Number with period format: "1. word"
      const number = document.createElement('span');
      number.className = 'tamil-suggestion-number';
      number.textContent = (i + 1).toString() + '.';
      // CRITICAL: Ensure number is always visible
      number.style.setProperty('color', '#4F46E5', 'important');
      number.style.setProperty('display', 'inline-block', 'important');
      number.style.setProperty('visibility', 'visible', 'important');
      number.style.setProperty('opacity', '1', 'important');
      number.style.setProperty('font-weight', '700', 'important');
      number.style.setProperty('font-size', '16px', 'important');
      number.style.setProperty('min-width', '24px', 'important');
      
      const text = document.createElement('span');
      text.className = 'tamil-suggestion-text';
      text.textContent = cleanText;
      // CRITICAL: Ensure text is visible
      text.style.setProperty('color', '#1e293b', 'important');
      text.style.setProperty('display', 'inline-block', 'important');
      text.style.setProperty('visibility', 'visible', 'important');
      text.style.setProperty('opacity', '1', 'important');
      
      item.appendChild(number);
      item.appendChild(text);
      
      // CRITICAL: Ensure item is properly contained and doesn't overflow
      item.style.position = 'relative'; // Not absolute/fixed - contained within list
      item.style.display = 'flex';
      item.style.width = '100%';
      item.style.boxSizing = 'border-box';
      
      // Log to verify text is set
      console.log('[IME] ✅ Added suggestion item:', {
        index: i + 1,
        text: cleanText,
        textLength: cleanText.length,
        itemHTML: item.innerHTML.substring(0, 100)
      });
      
      // Click handler - use closure to capture data directly from item
      // Store suggestion data in closure to avoid relying on currentSuggestions
      const selectHandler = ((index, suggestionText, suggestionData) => {
        return (e) => {
          e.preventDefault();
          e.stopPropagation();
          // CRITICAL: Prevent double-insert from duplicate click/touch events (same selection within 500ms)
          if (this._suggestionClickGuard) {
            console.log('[IME] Ignoring duplicate click (guard active)');
            return;
          }
          this._suggestionClickGuard = true;
          const guardClear = () => { this._suggestionClickGuard = false; };
          setTimeout(guardClear, 500);
          console.log('[IME] Clicked suggestion', index + 1, ':', suggestionText, 'index:', index);
          console.log('[IME] Current suggestions available:', this.currentSuggestions ? this.currentSuggestions.length : 0);
          
          // CRITICAL: Restore currentTokenInfo from dataset if it was cleared
          if (!this.currentTokenInfo) {
            const tokenStart = e.currentTarget.dataset.tokenStart;
            const tokenEnd = e.currentTarget.dataset.tokenEnd;
            const token = e.currentTarget.dataset.token;
            if (tokenStart && tokenEnd && token) {
              this.currentTokenInfo = {
                token: token,
                start: parseInt(tokenStart, 10),
                end: parseInt(tokenEnd, 10)
              };
              console.log('[IME] Restored currentTokenInfo from dataset:', this.currentTokenInfo);
            }
          }
          
          // Use stored suggestion data from closure, fallback to dataset, then currentSuggestions
          let finalText = suggestionText;
          let finalIndex = index;
          
          // Try to get from currentSuggestions first (most reliable)
          if (this.currentSuggestions && this.currentSuggestions[index]) {
            finalText = this.currentSuggestions[index].text || this.currentSuggestions[index].word || suggestionText;
            console.log('[IME] Using suggestion from currentSuggestions');
      } else {
            // Fallback to stored data in closure or dataset
            const datasetText = e.currentTarget.dataset.suggestionText;
            if (datasetText) {
              finalText = datasetText;
              console.log('[IME] Using suggestion from dataset');
            }
            console.warn('[IME] currentSuggestions not available, using stored data');
          }
          
          // Call selectSuggestionWithText to bypass currentSuggestions check
          this.selectSuggestionWithText(finalIndex, finalText);
        };
      })(i, cleanText, suggestion);
      
      item.addEventListener('click', selectHandler);

      // Prevent pointer-down from moving the caret before we commit (mouse + touch).
      // IMPORTANT: Do NOT commit on mousedown/touchend; committing should happen once on click.
      item.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      
      // Hover handler to update active index with purple highlight
      item.addEventListener('mouseenter', () => {
        this.activeSuggestionIndex = i;
        this.updateActiveSuggestion();
        console.log('[IME] Hovering suggestion', i + 1, ':', cleanText);
      });
      
      // Ensure item is clickable
      item.style.setProperty('pointer-events', 'auto', 'important');
      item.style.setProperty('cursor', 'pointer', 'important');
      
      list.appendChild(item);
    }

    dropdown.appendChild(list);
    
    // Verify list has items
    const listItems = list.querySelectorAll('.tamil-suggestion-item');
    console.log('[IME] 📋 List created with', listItems.length, 'items');
    
    // CRITICAL: Ensure we never have more than 4 items
    if (listItems.length > 4) {
      console.error('[IME] ❌ ERROR: More than 4 items rendered! Removing extras...');
      for (let i = 4; i < listItems.length; i++) {
        listItems[i].remove();
      }
    }
    
    // CRITICAL: Verify all items are contained within the dropdown
    const allSuggestionItems = document.querySelectorAll('.tamil-suggestion-item');
    allSuggestionItems.forEach(item => {
      const parentDropdown = item.closest('#tamil-suggestions-dropdown');
      if (!parentDropdown) {
        console.error('[IME] ❌ Found orphaned suggestion item outside dropdown! Removing:', item);
        item.remove();
      } else if (parentDropdown !== dropdown) {
        console.error('[IME] ❌ Found suggestion item in wrong dropdown! Removing:', item);
        item.remove();
      }
    });
    
    if (listItems.length === 0) {
      console.error('[IME] ❌ No items in list! Suggestions array:', suggestions);
    } else {
      listItems.forEach((item, idx) => {
        const textEl = item.querySelector('.tamil-suggestion-text');
        console.log('[IME] Item', idx + 1, ':', {
          exists: !!item,
          textEl: !!textEl,
          textContent: textEl?.textContent || 'MISSING',
          innerHTML: item.innerHTML.substring(0, 100),
          contained: item.closest('#tamil-suggestions-dropdown') === dropdown
        });
      });
    }
    
    // Ensure first item is highlighted by default
    if (this.activeSuggestionIndex === 0 && listItems.length > 0) {
      this.updateActiveSuggestion();
    }

    // Add instruction text
    const instruction = document.createElement('div');
    instruction.className = 'tamil-suggestions-instruction';
    instruction.innerHTML = 'Press <strong>Space</strong> to accept highlighted option';
    // Ensure instruction is visible
    instruction.style.setProperty('color', '#64748b', 'important');
    instruction.style.setProperty('display', 'block', 'important');
    instruction.style.setProperty('visibility', 'visible', 'important');
    instruction.style.setProperty('opacity', '1', 'important');
    dropdown.appendChild(instruction);

    // Position dropdown near cursor - MUST happen after content is added
    console.log('[IME] Positioning dropdown...');
    
    // Force a layout calculation before positioning
    void dropdown.offsetHeight;
    
    // Calculate optimal width based on content
    const suggestionsList = dropdown.querySelector('.tamil-suggestions-list');
    if (suggestionsList) {
      // Measure the widest item
      let maxWidth = 200; // Minimum width
      const items = suggestionsList.querySelectorAll('.tamil-suggestion-item');
      items.forEach(item => {
        const textEl = item.querySelector('.tamil-suggestion-text');
        if (textEl) {
          // Create a temporary span to measure text width
          const temp = document.createElement('span');
          temp.style.visibility = 'hidden';
          temp.style.position = 'absolute';
          temp.style.fontSize = window.getComputedStyle(textEl).fontSize;
          temp.style.fontFamily = window.getComputedStyle(textEl).fontFamily;
          temp.style.fontWeight = window.getComputedStyle(textEl).fontWeight;
          temp.textContent = textEl.textContent;
          document.body.appendChild(temp);
          const textWidth = temp.offsetWidth;
          document.body.removeChild(temp);
          // Add padding for number, spacing, and dropdown padding
          const itemWidth = textWidth + 60; // Number (24px) + spacing (8px) + padding (24px) + margin (4px)
          if (itemWidth > maxWidth) {
            maxWidth = itemWidth;
          }
        }
      });
      // Set width with some padding
      dropdown.style.width = `${Math.min(maxWidth + 40, 500)}px`;
      console.log('[IME] Set dropdown width to:', dropdown.style.width, 'based on content');
    }
    
    this.positionDropdown(dropdown);
    
    // Force another reflow after positioning
    void dropdown.offsetHeight;
    
    // CRITICAL: Save position values before any style modifications
    const savedLeft = dropdown.style.left;
    const savedTop = dropdown.style.top;
    
    console.log('[IME] Dropdown positioned, computed style:', {
      display: window.getComputedStyle(dropdown).display,
      visibility: window.getComputedStyle(dropdown).visibility,
      opacity: window.getComputedStyle(dropdown).opacity,
      zIndex: window.getComputedStyle(dropdown).zIndex,
      left: savedLeft,
      top: savedTop,
      width: window.getComputedStyle(dropdown).width,
      height: window.getComputedStyle(dropdown).height
    });

    // CRITICAL: Apply additional styling while PRESERVING position from positionDropdown()
    // Use setProperty with !important to override any CSS
    dropdown.style.setProperty('display', 'block', 'important');
    dropdown.style.setProperty('visibility', 'visible', 'important');
    dropdown.style.setProperty('opacity', '1', 'important');
    dropdown.style.setProperty('pointer-events', 'auto', 'important');
    dropdown.style.setProperty('position', 'fixed', 'important');
    dropdown.style.setProperty('z-index', '999999', 'important');
    
    // CRITICAL: Restore position values (these were set by positionDropdown)
    if (savedLeft) dropdown.style.setProperty('left', savedLeft, 'important');
    if (savedTop) dropdown.style.setProperty('top', savedTop, 'important');
    
    dropdown.style.setProperty('background', '#ffffff', 'important');
    dropdown.style.setProperty('border', '1px solid rgba(79, 70, 229, 0.15)', 'important');
    dropdown.style.setProperty('border-radius', '16px', 'important');
    dropdown.style.setProperty('box-shadow', '0 20px 40px rgba(79, 70, 229, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)', 'important');
    dropdown.style.setProperty('min-width', '280px', 'important');
    dropdown.style.setProperty('max-width', '380px', 'important');
    dropdown.style.setProperty('padding', '0', 'important');
    dropdown.style.setProperty('margin', '0', 'important');
    dropdown.style.setProperty('font-family', 'system-ui, -apple-system, "Segoe UI", "Inter", sans-serif', 'important');
    
    // Force a reflow
    void dropdown.offsetHeight;
    
    // Mark as open
    this.translitDropdownOpen = true;

    // Force a reflow to ensure styles are applied
    void dropdown.offsetHeight;
    
    // Double-check visibility after reflow - fix without wiping position (left/top)
    const forceVisibility = () => {
      const computed = window.getComputedStyle(dropdown);
      const rect = dropdown.getBoundingClientRect();
      const isVisible = computed.display !== 'none' && 
                       computed.visibility !== 'hidden' &&
                       computed.opacity !== '0' &&
                       rect.width > 0 &&
                       rect.height > 0;
      
      if (isVisible) return;
      
      // CRITICAL: Preserve position - never wipe left/top or dropdown disappears or jumps
      const savedLeft = dropdown.style.left || dropdown.style.getPropertyValue('left');
      const savedTop = dropdown.style.top || dropdown.style.getPropertyValue('top');
      
      // Only override visibility/size properties; do NOT removeAttribute('style') (that wipes left/top)
      dropdown.style.setProperty('display', 'block', 'important');
      dropdown.style.setProperty('visibility', 'visible', 'important');
      dropdown.style.setProperty('opacity', '1', 'important');
      dropdown.style.setProperty('pointer-events', 'auto', 'important');
      dropdown.style.setProperty('position', 'fixed', 'important');
      dropdown.style.setProperty('z-index', '999999', 'important');
      if (savedLeft) dropdown.style.setProperty('left', savedLeft, 'important');
      if (savedTop) dropdown.style.setProperty('top', savedTop, 'important');
      if (rect.width === 0 || rect.height === 0) {
        dropdown.style.setProperty('min-width', '280px', 'important');
        dropdown.style.setProperty('min-height', '120px', 'important');
      }
      dropdown.style.setProperty('background', 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)', 'important');
      dropdown.style.setProperty('border', '1px solid rgba(79, 70, 229, 0.15)', 'important');
      dropdown.style.setProperty('border-radius', '16px', 'important');
      dropdown.style.setProperty('box-shadow', '0 20px 40px rgba(79, 70, 229, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)', 'important');
      dropdown.style.setProperty('padding', '0', 'important');
      dropdown.style.setProperty('margin', '0', 'important');
      void dropdown.offsetHeight;
    };
    
    // Check once after a short delay so layout has run (avoid false "not visible" from immediate check)
    setTimeout(() => {
      forceVisibility();
      // One retry for slow layout
      setTimeout(forceVisibility, 50);
    }, 10);
    
    // Release lock after a short delay to allow DOM to settle
    setTimeout(() => {
      this._isRenderingDropdown = false;
      console.log('[IME] ✅ Rendering lock released');
    }, 100);
    
    // Final verification after all updates
    setTimeout(() => {
      const finalCheck = document.getElementById('tamil-suggestions-dropdown');
      if (finalCheck) {
        const finalComputed = window.getComputedStyle(finalCheck);
        const finalRect = finalCheck.getBoundingClientRect();
        console.log('[IME] 🔍 FINAL CHECK - Dropdown visibility:', {
          exists: !!finalCheck,
          display: finalComputed.display,
          visibility: finalComputed.visibility,
          opacity: finalComputed.opacity,
          width: finalRect.width,
          height: finalRect.height,
          top: finalRect.top,
          left: finalRect.left,
          visible: finalComputed.display !== 'none' && finalRect.width > 0 && finalRect.height > 0
        });
        
        // If still not visible, force it one more time with DEBUG styling
        if (finalComputed.display === 'none' || finalRect.width === 0 || finalRect.height === 0) {
          console.error('[IME] ❌❌❌ Dropdown still not visible after all attempts!');
          console.error('[IME] Forcing visibility with DEBUG red border...');
          finalCheck.style.cssText = `
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: fixed !important;
            z-index: 999999 !important;
            top: 200px !important;
            left: 200px !important;
            background: white !important;
            border: 3px solid red !important;
            padding: 20px !important;
            min-width: 300px !important;
            min-height: 200px !important;
            box-shadow: 0 0 20px rgba(255,0,0,0.5) !important;
          `;
        } else {
          // Even if visible, ensure it's on top and has proper styling
          console.log('[IME] ✅ Dropdown is visible, ensuring it stays on top...');
          finalCheck.style.setProperty('z-index', '999999', 'important');
          finalCheck.style.setProperty('position', 'fixed', 'important');
          finalCheck.style.setProperty('pointer-events', 'auto', 'important');
          
          // Check if dropdown is actually visible and in viewport - but don't move to center
          // Instead, ensure it stays near cursor but adjust minimally if needed
          const rect = finalCheck.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          // Get current cursor position to maintain relationship
          const selection = window.getSelection();
          let cursorRect = null;
          if (selection && selection.rangeCount > 0) {
            try {
              const range = selection.getRangeAt(0);
              cursorRect = range.getBoundingClientRect();
            } catch (e) {
              console.warn('[IME] Could not get cursor position for final check');
            }
          }
          
          // Only adjust if dropdown is completely outside viewport AND we have cursor position
          if (cursorRect && (rect.left < 0 || rect.right > viewportWidth || rect.top < 0 || rect.bottom > viewportHeight)) {
            // Recalculate position based on cursor to keep it under the cursor
            let adjustedLeft = cursorRect.left;
            let adjustedTop = cursorRect.bottom + 8;
            
            // Adjust horizontally if needed (but keep near cursor)
            if (adjustedLeft + rect.width > viewportWidth) {
              adjustedLeft = Math.max(10, viewportWidth - rect.width - 10);
            }
            if (adjustedLeft < 10) {
              adjustedLeft = 10;
            }
            
            // Adjust vertically if needed (show above cursor if below viewport)
            if (adjustedTop + rect.height > viewportHeight) {
              adjustedTop = Math.max(10, cursorRect.top - rect.height - 8);
            }
            if (adjustedTop < 10) {
              adjustedTop = 10;
            }
            
            console.log('[IME] ⚠️ Dropdown adjusted to stay in viewport while maintaining cursor relationship:', {
              cursorPos: { left: cursorRect.left, top: cursorRect.top, bottom: cursorRect.bottom },
              originalPos: { left: rect.left, top: rect.top },
              adjustedPos: { left: adjustedLeft, top: adjustedTop },
              viewport: { width: viewportWidth, height: viewportHeight }
            });
            
            finalCheck.style.setProperty('left', `${adjustedLeft}px`, 'important');
            finalCheck.style.setProperty('top', `${adjustedTop}px`, 'important');
          } else if (!cursorRect && (rect.left < 0 || rect.right > viewportWidth || rect.top < 0 || rect.bottom > viewportHeight)) {
            // Only if we can't get cursor position, do minimal adjustment
            console.warn('[IME] ⚠️ Dropdown outside viewport but no cursor position available. Adjusting minimally...');
            let adjustedLeft = Math.max(10, rect.left);
            let adjustedTop = Math.max(10, rect.top);
            if (adjustedLeft + rect.width > viewportWidth) {
              adjustedLeft = Math.max(10, viewportWidth - rect.width - 10);
            }
            if (adjustedTop + rect.height > viewportHeight) {
              adjustedTop = Math.max(10, viewportHeight - rect.height - 10);
            }
            finalCheck.style.setProperty('left', `${adjustedLeft}px`, 'important');
            finalCheck.style.setProperty('top', `${adjustedTop}px`, 'important');
          }
        }
      } else {
        // Expected when a newer displaySuggestions() replaced this dropdown within 300ms (e.g. new query or empty list)
        if (window.logger && window.logger.debug) {
          window.logger.debug('[IME] Dropdown element no longer in DOM (likely replaced by newer suggestions)');
        }
      }
    }, 300);

    // Log detailed information for debugging
    const computedStyle = window.getComputedStyle(dropdown);
    console.log('[IME] ✅✅✅ Dropdown should be visible now!');
    console.log('[IME] 📊 Dropdown debug info:', {
      element: dropdown,
      inDOM: document.body.contains(dropdown),
      innerHTML: dropdown.innerHTML.substring(0, 100),
      inlineStyles: {
        display: dropdown.style.display,
        visibility: dropdown.style.visibility,
        opacity: dropdown.style.opacity,
        position: dropdown.style.position,
        left: dropdown.style.left,
        top: dropdown.style.top,
        zIndex: dropdown.style.zIndex
      },
      computedStyles: {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: computedStyle.opacity,
        position: computedStyle.position,
        left: computedStyle.left,
        top: computedStyle.top,
        zIndex: computedStyle.zIndex,
        width: computedStyle.width,
        height: computedStyle.height
      }
    });
    
    // Also log to help user debug
    console.log('[IME] 🔍 To debug: Check if dropdown element exists in DOM');
    console.log('[IME] 🔍 Run in console: document.getElementById("tamil-suggestions-dropdown")');
    
    // No debug styles - use premium theme styling from CSS
  }

  /**
   * Position the dropdown near the cursor
   */
  positionDropdown(dropdown) {
    try {
      // CRITICAL: Ensure dropdown has content and dimensions before positioning
      if (!dropdown.innerHTML || dropdown.innerHTML.trim().length === 0) {
        console.warn('[IME] Dropdown has no content, cannot position');
        return;
      }
      
      // First, ensure dropdown has basic styles and is visible
      dropdown.style.setProperty('position', 'fixed', 'important');
      dropdown.style.setProperty('z-index', '999999', 'important');
      dropdown.style.setProperty('display', 'block', 'important');
      dropdown.style.setProperty('visibility', 'visible', 'important');
      
      // Force a layout to get actual dimensions - try multiple times if needed
      void dropdown.offsetHeight;
      let currentRect = dropdown.getBoundingClientRect();
      let dropdownWidth = currentRect.width;
      let dropdownHeight = currentRect.height;
      
      // If dimensions are still 0, wait a bit and try again
      if (dropdownWidth === 0 || dropdownHeight === 0) {
        console.warn('[IME] Dropdown has zero dimensions, waiting for layout...');
        // Force layout again
        void dropdown.offsetHeight;
        currentRect = dropdown.getBoundingClientRect();
        dropdownWidth = currentRect.width || 300;
        dropdownHeight = currentRect.height || 200;
      }
      
      console.log('[IME] Dropdown dimensions:', { width: dropdownWidth, height: dropdownHeight, rect: currentRect });
      
      const selection = window.getSelection();
      let left, top;
      let cursorRect = null;
      
      if (selection && selection.rangeCount > 0) {
        try {
          const range = selection.getRangeAt(0).cloneRange();
          range.collapse(true); // Ensure range is collapsed at cursor
          
          // Use getCaretClientRect() helper which inserts a marker for accurate positioning
          // This is more reliable than getBoundingClientRect() for collapsed ranges
          cursorRect = getCaretClientRect();
          
          // Fallback to getBoundingClientRect if getCaretClientRect fails
          if (!cursorRect || cursorRect.width === 0) {
            cursorRect = range.getBoundingClientRect();
            // If still no valid rect, create a marker node to get accurate position
            if ((!cursorRect || cursorRect.width === 0) && range.startContainer) {
              const marker = document.createElement('span');
              marker.style.position = 'fixed';
              marker.style.visibility = 'hidden';
              marker.style.pointerEvents = 'none';
              marker.textContent = '\u200b'; // Zero-width space
              try {
                range.insertNode(marker);
                cursorRect = marker.getBoundingClientRect();
                marker.parentNode?.removeChild(marker);
              } catch (e) {
                console.warn('[IME] Could not insert marker for cursor position');
              }
            }
          }
          
          if (cursorRect && (cursorRect.width > 0 || cursorRect.height > 0 || cursorRect.left || cursorRect.top)) {
            // Ensure it's within viewport bounds
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Position dropdown directly under the cursor (last typed letter)
            left = cursorRect.left || cursorRect.x || 0;
            top = (cursorRect.bottom || cursorRect.y + cursorRect.height || cursorRect.top + 20) + 8;
            
            // CRITICAL: Only adjust if dropdown would go off-screen, but keep it near cursor
            // Adjust horizontally if needed (but stay as close to cursor as possible)
            if (left + dropdownWidth > viewportWidth) {
              // Move left to fit, but try to keep cursor visible
              left = Math.max(10, viewportWidth - dropdownWidth - 10);
            }
            // Ensure left is never negative
            if (left < 10) {
              left = 10;
            }
            
            // Adjust vertically if needed (show above cursor if below viewport)
            if (top + dropdownHeight > viewportHeight) {
              // Show above cursor instead
              const cursorTop = cursorRect.top || cursorRect.y || top;
              top = Math.max(10, cursorTop - dropdownHeight - 8);
            }
            if (top < 0) top = 10;
            
            console.log('[IME] Positioned dropdown at cursor:', { 
              left, 
              top, 
              cursorRect: { 
                left: cursorRect.left, 
                top: cursorRect.top, 
                bottom: cursorRect.bottom,
                right: cursorRect.right,
                width: cursorRect.width, 
                height: cursorRect.height 
              },
              dropdownSize: { width: dropdownWidth, height: dropdownHeight },
              viewport: { width: viewportWidth, height: viewportHeight },
              finalPosition: { left, top }
            });
          } else {
            // Invalid cursor rect, try alternative method
            console.warn('[IME] Invalid cursor rect, trying alternative method');
            // Try using range.getBoundingClientRect() as fallback
            const range = selection.getRangeAt(0).cloneRange();
            range.collapse(true);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0 || rect.left || rect.top) {
              cursorRect = rect;
              const viewportWidth = window.innerWidth;
              const viewportHeight = window.innerHeight;
              left = rect.left || 100;
              top = (rect.bottom || rect.top + 20) + 8;
              // Basic viewport adjustment
              if (left + dropdownWidth > viewportWidth) left = Math.max(10, viewportWidth - dropdownWidth - 10);
              if (left < 10) left = 10;
              if (top + dropdownHeight > viewportHeight) top = Math.max(10, rect.top - dropdownHeight - 8);
              if (top < 0) top = 10;
            } else {
              throw new Error('Cannot get valid cursor position');
            }
          }
        } catch (rangeError) {
          console.warn('[IME] Error getting cursor position, using fallback:', rangeError);
          cursorRect = null;
          // Don't set left/top here, let fallback logic handle it
        }
      }
      
      // If we couldn't get cursor position, use fallback methods
      if (typeof left === 'undefined' || typeof top === 'undefined') {
        // TipTap fallback: try ProseMirror root if legacy editorElement isn't set
        const tiptapRoot = document.querySelector('.ProseMirror');
        if (!this.editorElement && tiptapRoot) {
          const editorRect = tiptapRoot.getBoundingClientRect();
          left = Math.max(10, editorRect.left + 50);
          top = Math.max(10, editorRect.top + 100);
          console.log('[IME] Positioned dropdown relative to TipTap editor:', { left, top, editorRect });
        } else if (this.editorElement) {
          // Fallback: position relative to editor
          const editorRect = this.editorElement.getBoundingClientRect();
          left = Math.max(10, editorRect.left + 50);
          top = Math.max(10, editorRect.top + 100);
          console.log('[IME] Positioned dropdown relative to editor:', { left, top, editorRect });
        } else {
          // Last resort: position at center of viewport (but this should rarely happen)
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          left = Math.max(10, (viewportWidth - dropdownWidth) / 2);
          top = Math.max(10, (viewportHeight - dropdownHeight) / 2);
          console.log('[IME] Positioned dropdown at center viewport (last resort):', { left, top });
        }
      }
      
      // Apply positioning - use setProperty to ensure it works
      dropdown.style.setProperty('left', `${left}px`, 'important');
      dropdown.style.setProperty('top', `${top}px`, 'important');
      
      // Force a reflow and verify position
      void dropdown.offsetHeight;
      const finalRect = dropdown.getBoundingClientRect();
      
      // CRITICAL: Verify and fix if dropdown is outside viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let needsReposition = false;
      let adjustedLeft = finalRect.left;
      let adjustedTop = finalRect.top;
      
      // Check if dropdown is outside viewport
      if (finalRect.left < 0) {
        adjustedLeft = 20;
        needsReposition = true;
      }
      if (finalRect.right > viewportWidth) {
        adjustedLeft = viewportWidth - finalRect.width - 20;
        needsReposition = true;
      }
      if (finalRect.top < 0) {
        adjustedTop = 20;
        needsReposition = true;
      }
      if (finalRect.bottom > viewportHeight) {
        adjustedTop = viewportHeight - finalRect.height - 20;
        needsReposition = true;
      }
      
      // If dropdown is outside viewport, reposition it
      if (needsReposition) {
        console.warn('[IME] ⚠️ Dropdown is outside viewport! Repositioning...', {
          original: { left: finalRect.left, top: finalRect.top },
          adjusted: { left: adjustedLeft, top: adjustedTop },
          viewport: { width: viewportWidth, height: viewportHeight }
        });
        dropdown.style.setProperty('left', `${adjustedLeft}px`, 'important');
        dropdown.style.setProperty('top', `${adjustedTop}px`, 'important');
        void dropdown.offsetHeight; // Force reflow
      }
      
      console.log('[IME] Final dropdown position:', {
        left: dropdown.style.left,
        top: dropdown.style.top,
        width: finalRect.width,
        height: finalRect.height,
        visible: finalRect.width > 0 && finalRect.height > 0,
        inViewport: finalRect.top >= 0 && finalRect.left >= 0 && 
                   finalRect.bottom <= viewportHeight && 
                   finalRect.right <= viewportWidth
      });
      
      // If still has zero dimensions, force minimum size
      if (finalRect.width === 0 || finalRect.height === 0) {
        console.error('[IME] ⚠️ Dropdown has zero dimensions! Forcing size...');
        dropdown.style.setProperty('min-width', '260px', 'important');
        dropdown.style.setProperty('min-height', '100px', 'important');
        void dropdown.offsetHeight; // Force reflow again
      }
      
      // CRITICAL: Ensure dropdown is clickable
      dropdown.style.setProperty('pointer-events', 'auto', 'important');
      const list = dropdown.querySelector('.tamil-suggestions-list');
      if (list) {
        list.style.setProperty('pointer-events', 'auto', 'important');
      }
    } catch (error) {
      console.error('[IME] Error positioning dropdown:', error);
      // Fallback positioning - center of screen
      const left = Math.max(10, (window.innerWidth - 300) / 2);
      const top = Math.max(10, (window.innerHeight - 200) / 2);
      dropdown.style.setProperty('left', `${left}px`, 'important');
      dropdown.style.setProperty('top', `${top}px`, 'important');
    }
  }

  /**
   * Hide the suggestions dropdown
   */
  hideSuggestions() {
    window.logger?.debug?.('[IME] hideSuggestions called');
    
    // CRITICAL: Remove ALL dropdown instances completely (not just hide)
    // Remove both workspace.js dropdowns AND V2 TransliterationTypeahead dropdowns
    const allDropdowns = document.querySelectorAll('#tamil-suggestions-dropdown');
    console.log('[IME] Removing', allDropdowns.length, 'workspace dropdown instance(s)');
    allDropdowns.forEach((dropdown, index) => {
      console.log('[IME] Removing workspace dropdown', index + 1, 'of', allDropdowns.length);
      // Force hide with multiple methods
      dropdown.style.display = 'none';
      dropdown.style.visibility = 'hidden';
      dropdown.style.opacity = '0';
      dropdown.classList.add('hidden');
      // Clear content to prevent stale items
      dropdown.innerHTML = '';
      // CRITICAL: Actually remove from DOM, not just hide
      if (dropdown.parentNode) {
        dropdown.parentNode.removeChild(dropdown);
      }
      window.logger?.debug?.('[IME] ✅ Workspace dropdown removed from DOM');
    });
    
    // Also remove V2 TransliterationTypeahead dropdowns
    const v2Dropdowns = document.querySelectorAll('.translit-dropdown');
    if (v2Dropdowns.length > 0) {
      console.log('[IME] Removing', v2Dropdowns.length, 'V2 TransliterationTypeahead dropdown(s)');
      v2Dropdowns.forEach((dropdown, index) => {
        console.log('[IME] Removing V2 dropdown', index + 1, 'of', v2Dropdowns.length);
        dropdown.style.display = 'none';
        dropdown.style.visibility = 'hidden';
        dropdown.style.opacity = '0';
        dropdown.innerHTML = '';
        if (dropdown.parentNode) {
          dropdown.parentNode.removeChild(dropdown);
        }
        window.logger?.debug?.('[IME] ✅ V2 dropdown removed from DOM');
      });
      // Close the typeahead instance if it exists
      if (this.translitTypeahead && this.translitTypeahead.closeDropdown) {
        this.translitTypeahead.closeDropdown();
      }
    }
    
    // CRITICAL: Remove any orphaned suggestion items that might be outside the dropdown
    const orphanedItems = document.querySelectorAll('.tamil-suggestion-item');
    console.log('[IME] Checking', orphanedItems.length, 'suggestion items for orphans');
    orphanedItems.forEach(item => {
      const dropdown = item.closest('#tamil-suggestions-dropdown');
      if (!dropdown) {
        console.warn('[IME] Found orphaned suggestion item, removing:', item);
        item.remove();
      }
    });
    
    // CRITICAL: Also remove editor.js autocomplete boxes
    const editorAutocomplete = document.querySelectorAll('.autocomplete-box');
    if (editorAutocomplete.length > 0) {
      console.log('[IME] Removing', editorAutocomplete.length, 'editor.js autocomplete box(es)');
      editorAutocomplete.forEach(dd => {
        if (dd.parentNode) dd.parentNode.removeChild(dd);
      });
    }
    
    // CRITICAL: Double-check - remove any remaining dropdowns
    const remainingDropdowns = document.querySelectorAll('#tamil-suggestions-dropdown');
    if (remainingDropdowns.length > 0) {
      console.error('[IME] ❌ ERROR: Still found', remainingDropdowns.length, 'dropdown(s) after removal! Force removing...');
      remainingDropdowns.forEach(dd => {
        dd.remove();
      });
    }
    
    // Release rendering lock
    this._isRenderingDropdown = false;
    
    this.translitDropdownOpen = false;
    this.imeActive = false;
    this.currentSuggestions = [];
    this.activeSuggestionIndex = 0;
    // CRITICAL: Clear currentTokenInfo when hiding suggestions to prevent stale state
    // This prevents the "Token at stored position is no longer Latin" error
    if (this.currentTokenInfo) {
      window.logger?.debug?.('[IME] Clearing currentTokenInfo when hiding suggestions');
      this.currentTokenInfo = null;
    }
    
    console.log('[IME] ✅ hideSuggestions complete - all dropdowns removed');
  }

  // Legacy method - redirects to new method
  renderTranslitSuggestions(word, suggestions) {
    this.displaySuggestions(suggestions);
  }

  // Legacy method - redirects to new method
  highlightActiveSuggestion() {
    this.updateActiveSuggestion();
  }

  /**
   * Update visual state of active suggestion
   */
  updateActiveSuggestion() {
    const dropdown = document.getElementById('tamil-suggestions-dropdown');
    if (!dropdown) {
      console.warn('[IME] updateActiveSuggestion: dropdown not found');
      return;
    }

    const items = dropdown.querySelectorAll('.tamil-suggestion-item');
    if (items.length === 0) {
      console.warn('[IME] updateActiveSuggestion: no items found');
      return;
    }

    items.forEach((item, index) => {
      if (index === this.activeSuggestionIndex) {
        item.classList.add('active');
        // Ensure active class is applied with important styles for purple highlight
        item.style.setProperty('background', 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)', 'important');
        item.style.setProperty('color', 'white', 'important');
        const textEl = item.querySelector('.tamil-suggestion-text');
        if (textEl) {
          textEl.style.setProperty('color', 'white', 'important');
        }
        console.log('[IME] Highlighted suggestion', index + 1, 'as active');
      } else {
        item.classList.remove('active');
        // Reset to default styles
        item.style.removeProperty('background');
        item.style.removeProperty('color');
        const textEl = item.querySelector('.tamil-suggestion-text');
        if (textEl) {
          textEl.style.setProperty('color', '#1e293b', 'important');
        }
      }
    });
    
    console.log('[IME] Updated active suggestion to index:', this.activeSuggestionIndex);
  }

  // Legacy method - redirects to new method
  acceptSuggestion(index) {
    this.selectSuggestion(index);
  }

  /**
   * Select and insert a suggestion at the cursor position (internal method with text)
   * @param {number} index - Index of the suggestion
   * @param {string} tamilText - The Tamil text to insert
   */
  selectSuggestionWithText(index, tamilText) {
    // CRITICAL: Prevent duplicate calls from both click and mousedown events
    if (this.isSelectingSuggestion) {
      console.log('[IME] Already selecting suggestion, ignoring duplicate call');
      return;
    }
    
    if (!tamilText || !tamilText.trim()) {
      console.warn('[IME] Empty suggestion text provided');
      return;
    }

    // Set flag to prevent duplicate calls
    this.isSelectingSuggestion = true;
    console.log('[IME] Selecting suggestion with text:', tamilText, 'at index:', index);
    
    try {
      // Proceed with replacement using the provided text
      this.performReplacement(tamilText);
    } finally {
      // Reset flag after a short delay to allow replacement to complete
      setTimeout(() => {
        this.isSelectingSuggestion = false;
      }, 300);
    }
  }

  /**
   * Select and insert a suggestion at the cursor position
   * @param {number} index - Index of the suggestion to select
   */
  selectSuggestion(index) {
    window.logger?.debug?.('[IME] selectSuggestion called with index:', index, 'currentSuggestions length:', this.currentSuggestions ? this.currentSuggestions.length : 0);
    
    // Validate index and suggestions array
    if (!this.currentSuggestions || !Array.isArray(this.currentSuggestions) || this.currentSuggestions.length === 0) {
      window.logger?.error?.('[IME] Invalid suggestions array:', {
        hasSuggestions: !!this.currentSuggestions,
        isArray: Array.isArray(this.currentSuggestions),
        length: this.currentSuggestions ? this.currentSuggestions.length : 0
      });
      this.hideSuggestions();
      return;
    }
    
    if (index < 0 || index >= this.currentSuggestions.length) {
      window.logger?.error?.('[IME] Invalid suggestion index:', index, 'valid range: 0 to', this.currentSuggestions.length - 1);
      this.hideSuggestions();
      return;
    }
    
    if (!this.currentSuggestions[index]) {
      window.logger?.error?.('[IME] Suggestion at index', index, 'is undefined:', this.currentSuggestions);
      this.hideSuggestions();
      return;
    }

    const suggestion = this.currentSuggestions[index];
    const tamilText = suggestion.text || suggestion.word || '';

    if (!tamilText) {
      console.warn('[IME] Empty suggestion text');
      return;
    }

    window.logger?.debug?.('[IME] Selecting suggestion:', tamilText, 'at index:', index);
    
    // Use the internal method
    this.performReplacement(tamilText);
  }

  /**
   * Perform the actual replacement of the Latin token with Tamil text
   * @param {string} tamilText - The Tamil text to insert
   */
  performReplacement(tamilText) {
      // CRITICAL: Prevent duplicate insertions
      if (this.isInsertingSuggestion) {
        console.log('[IME] ⚠️ Already inserting suggestion, ignoring duplicate call');
        return;
      }
      
      this.isInsertingSuggestion = true;
      console.log('[IME] 🔒 Locked: Starting insertion of:', tamilText);
      
      try {
        window.logger?.debug?.('[IME] performReplacement called with text:', tamilText);
        window.logger?.debug?.('[IME] currentTokenInfo available:', !!this.currentTokenInfo, this.currentTokenInfo);
      
      // CRITICAL: Use stored tokenInfo from when suggestions were fetched (when token was Latin)
      // Don't get fresh token info as it might already be Tamil after previous selection
      if (!this.currentTokenInfo) {
        window.logger?.warn?.('[IME] ⚠️ currentTokenInfo is null! This should not happen if tokenInfo was stored in dataset.');
        window.logger?.warn?.('[IME] Attempting fallback: getting token from current cursor position...');
        
        // Fallback: try to get current token info
        const text = this.getEditorText() || '';
        const caretPos = (this.editor && this.editor.getCursorPosition && this.editor.getCursorPosition()) || text.length;
        const tokenInfo = getTokenAtCaret(text, caretPos);
        const { token, start, end } = tokenInfo;
        
        // Only proceed if token is Latin (getTokenAtCaret now only returns Latin tokens)
        if (!token || !/^[a-zA-Z]+$/.test(token)) {
          window.logger?.error?.('[IME] ❌ No stored tokenInfo and current token is not Latin, cannot replace');
          window.logger?.error?.('[IME] Current token:', token, 'isLatin:', /^[a-zA-Z]+$/.test(token || ''));
          window.logger?.error?.('[IME] Cursor position:', caretPos, 'Text around cursor:', text.substring(Math.max(0, caretPos - 10), Math.min(text.length, caretPos + 10)));
          this.hideSuggestions();
          return;
        }
        
        // Store it for replacement
        this.currentTokenInfo = { token, start, end };
        window.logger?.debug?.('[IME] ✅ Fallback: Stored tokenInfo from cursor:', this.currentTokenInfo);
      } else {
        window.logger?.debug?.('[IME] ✅ Using stored currentTokenInfo:', this.currentTokenInfo);
      }

      // Verify stored token is Latin - CRITICAL: Only replace if token is Latin
      if (this.currentTokenInfo.token && !/^[a-zA-Z]+$/.test(this.currentTokenInfo.token)) {
        window.logger?.warn?.('[IME] Stored token is not Latin:', this.currentTokenInfo.token);
        this.hideSuggestions();
        this.currentTokenInfo = null;
        return;
      }
      
      // Double-check: verify the token at the stored position is still Latin
      const text = this.getEditorText() || '';
      const currentTokenAtPos = text.slice(this.currentTokenInfo.start, this.currentTokenInfo.end);
      if (currentTokenAtPos && !/^[a-zA-Z]+$/.test(currentTokenAtPos)) {
        // Token is no longer Latin - this can happen if:
        // 1. User already selected a suggestion (token was replaced)
        // 2. User typed Tamil characters manually
        // 3. Another operation replaced the token
        // In this case, just clear state and abort gracefully
        console.log('[IME] Token at stored position is no longer Latin (likely already replaced):', currentTokenAtPos);
        console.log('[IME] Clearing IME state and aborting replacement');
        this.hideSuggestions();
        this.currentTokenInfo = null;
        this.currentSuggestions = [];
        this.imeActive = false;
        this.isSelectingSuggestion = false; // Reset selection flag
        return;
      }

    console.log('[IME] Replacing token:', this.currentTokenInfo.token, 'with:', tamilText);
    console.log('[IME] Token position:', this.currentTokenInfo.start, 'to', this.currentTokenInfo.end);

    // Replace the token with Tamil text using stored token info
    // Use the existing replaceTokenAtCaret method which handles everything properly
    this.replaceTokenAtCaret(tamilText, false);

    // Hide dropdown and clear state AFTER replacement
    // CRITICAL: Clear currentTokenInfo immediately to prevent race conditions
    const tokenInfoToClear = this.currentTokenInfo;
    this.currentTokenInfo = null; // Clear immediately
    this.hideSuggestions();
    this.currentSuggestions = [];
    this.activeSuggestionIndex = 0;
    this.imeActive = false;
    this.isSelectingSuggestion = false; // Reset selection flag
    
    console.log('[IME] ✅ Replacement complete, cleared currentTokenInfo:', tokenInfoToClear);
    
    } finally {
      // Unlock after a short delay to allow DOM updates
      setTimeout(() => {
        this.isInsertingSuggestion = false;
        console.log('[IME] 🔓 Unlocked: Insertion complete');
      }, 300);
    }
  }

  // Keyboard navigation handler
  handleKeyDown(e) {
    // Transliteration V2 handles its own keybindings (Space/Enter/Arrows) via the adapter.
    // If we also intercept here, we can double-commit and duplicate insertions.
    if (this.translitTypeahead) {
      return false;
    }
    // Always allow typing to proceed - don't block editor change events
    // Only intercept when IME is active and we have suggestions
    if (!this.imeActive || !this.currentSuggestions || this.currentSuggestions.length === 0) {
      // If not in IME mode, clear any stale state but don't block events
      if (e.key === ' ' || e.key === 'Enter' || e.key === '.' || e.key === ',' || e.key === ';') {
        this.clearGhostText();
        this.clearTranslitSuggestions();
        this.imeActive = false;
        this.editorMode = EditorMode.IDLE;
      }
      // Return false to allow normal typing and editor change events
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
          const textToInsert = suggestion.text || suggestion.word || '';
          this.replaceTokenAtCaret(textToInsert, appendSpace);
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
        // Space commits first/active suggestion
        if (this.imeActive && this.currentSuggestions && this.currentSuggestions.length > 0) {
          const suggestion = this.currentSuggestions[this.activeSuggestionIndex || 0];
          const textToInsert = suggestion && (suggestion.text || suggestion.word);
          if (textToInsert && textToInsert.length > 0) {
        e.preventDefault();
        e.stopPropagation();
            this.selectSuggestion(this.activeSuggestionIndex || 0);
            // Insert space after Tamil word (use insertSpaceAtCaret to avoid replacing the next token)
            setTimeout(() => {
              this.insertSpaceAtCaret();
              if (this.editor && this.editor.onChange) {
                this.editor.onChange();
              } else {
                this.handleEditorChange();
              }
            }, 10);
        }
        return true;
        }
        return false;
      
      case '1': case '2': case '3': case '4': case '5':
        // Number keys select specific suggestion
        if (this.imeActive && this.currentSuggestions) {
          const index = parseInt(e.key) - 1;
          if (index >= 0 && index < this.currentSuggestions.length) {
            e.preventDefault();
            e.stopPropagation();
            this.selectSuggestion(index);
            return true;
          }
        }
        return false;

      default:
        // If user continues typing, clear ghost text to prevent accidental commits
        // Only clear if it's a regular character (not modifier keys)
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // User is typing - clear ghost text but keep suggestions dropdown open
          this.clearGhostText();
        }
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

  // Insert a single space at the current caret (no replacement). Used after committing a suggestion.
  insertSpaceAtCaret() {
    if (window.USE_TIPTAP_EDITOR && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
      try {
        tiptapWorkspaceEditor.chain().focus().insertContent(' ').run();
        if (this.editor && this.editor.onChange) this.editor.onChange();
        return;
      } catch (_e) {
        // fallback to legacy path
      }
    }
    const text = this.getEditorText() || '';
    let pos = 0;
    try {
      pos = (this.editor && typeof this.editor.getCursorPosition === 'function' && this.editor.getCursorPosition()) || text.length;
    } catch (_e) {
      pos = text.length;
    }
    pos = Math.max(0, Math.min(pos, text.length));
    const newText = text.slice(0, pos) + ' ' + text.slice(pos);
    if (this.editor && this.editor.setText) {
      this.editor.setText(newText);
    } else if (this.editorElement) {
      this.editorElement.textContent = newText;
      this.editorElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const newPos = pos + 1;
    if (this.editor && this.editor.setCursorPosition) {
      this.editor.setCursorPosition(newPos);
    } else if (this.editorElement && this.editorElement.firstChild) {
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(this.editorElement.firstChild, Math.min(newPos, this.editorElement.textContent.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // Replace token at caret position with replacement
  replaceTokenAtCaret(replacement, appendSpace = false) {
    // TipTap mode: replace directly via TipTap commands/transaction.
    if (window.USE_TIPTAP_EDITOR && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
      // Prevent double-insert: same replacement text within 400ms is ignored
      const key = (replacement || '') + (appendSpace ? '|space' : '');
      const now = Date.now();
      if (this._lastReplaceKey === key && (now - (this._lastReplaceTime || 0)) < 400) {
        console.log('[IME] Skipping duplicate TipTap replace within 400ms');
        this.hideSuggestions?.();
        return;
      }
      this._lastReplaceKey = key;
      this._lastReplaceTime = now;
      const ok = replaceTipTapTokenAtCaret(replacement, appendSpace);
      if (!ok) {
        console.warn('[IME] TipTap replaceTokenAtCaret failed (no token before caret)');
        return;
      }
      this.justReplacedToken = true;
      this.hideSuggestions?.();
      return;
    }

    if (!replacement) {
      window.logger?.warn?.("[IME] replaceTokenAtCaret: missing tokenInfo or replacement", {
        hasTokenInfo: !!this.currentTokenInfo,
        hasReplacement: !!replacement
      });
      return;
    }
    // Prevent double-insert: same replacement within 400ms (legacy/textarea path)
    const replaceKey = (replacement || '') + (appendSpace ? '|space' : '');
    const now = Date.now();
    if (this._lastReplaceKey === replaceKey && (now - (this._lastReplaceTime || 0)) < 400) {
      window.logger?.debug?.('[IME] Skipping duplicate replace within 400ms');
      this.hideSuggestions?.();
      return;
    }
    this._lastReplaceKey = replaceKey;
    this._lastReplaceTime = now;
    const text = this.getEditorText() || '';

    // Prefer a fresh token read at commit-time (prevents partial replacements when tokenInfo is stale)
    // Fallback to stored token info if we can't read caret/token now.
    let tokenInfo = null;
    try {
      const caretPos =
        (this.editor && typeof this.editor.getCursorPosition === 'function' && this.editor.getCursorPosition()) ||
        text.length;
      tokenInfo = getTokenAtCaret(text, caretPos);
    } catch (_e) {
      tokenInfo = null;
    }
    if (!tokenInfo || !tokenInfo.token || !/^[a-zA-Z]+$/.test(tokenInfo.token)) {
      tokenInfo = this.currentTokenInfo;
    }
    if (!tokenInfo || !tokenInfo.token) {
      return;
    }

    let { token, start, end } = tokenInfo;
    
    // CRITICAL FIX: Check bounds to prevent errors
    if (start < 0 || end > text.length || start > end) {
      window.logger?.warn?.("[IME] replaceTokenAtCaret: invalid token positions", {
        start,
        end,
        textLength: text.length
      });
      return;
    }
    
    // Get current token at position (might have changed if user continued typing)
    // Expand to cover full Latin run (handles caret in middle + stale end)
    while (start > 0 && /[A-Za-z]/.test(text.charAt(start - 1))) start--;
    while (end < text.length && /[A-Za-z]/.test(text.charAt(end))) end++;
    const currentToken = text.slice(start, end);
    
    // CRITICAL: Only replace if current token is still Latin (English word)
    // This prevents junk word replacement when Tamil characters are present
    const isExactMatch = currentToken === token;
    const isStillLatin = /^[a-zA-Z]+$/.test(currentToken);
    const startsWithToken = currentToken.toLowerCase().startsWith(token.toLowerCase());
    
    // STRICT CHECK: Only allow replacement if token is still Latin
    if (!isStillLatin) {
      window.logger?.warn?.("[IME] replaceTokenAtCaret: Current token is not Latin, skipping replacement to prevent junk words", {
        expected: token,
        found: currentToken,
        start,
        end,
        isExactMatch,
        isStillLatin,
        startsWithToken,
        textAround: text.substring(Math.max(0, start - 5), Math.min(text.length, end + 5))
      });
      return; // Don't replace if token is not Latin - this prevents "மஉரஉஅ" type errors
    }
    
    // Additional safety: if token doesn't match and doesn't start with stored token, be cautious
    if (!isExactMatch && !startsWithToken && currentToken.length > token.length + 3) {
      window.logger?.warn?.("[IME] replaceTokenAtCaret: Token mismatch detected, but still Latin - proceeding with caution", {
        expected: token,
        found: currentToken
      });
    }
    
    // End is already expanded to full Latin run.
    const actualEnd = end;
    
    // CRITICAL: Only replace the Latin token, don't add to it
    const replacementText = replacement + (appendSpace ? ' ' : '');
    const newText = text.slice(0, start) + replacementText + text.slice(actualEnd);
    window.logger?.debug?.("[IME] Replacing token at position", start, "-", actualEnd, ":", currentToken, "with:", replacementText);
    window.logger?.debug?.("[IME] Text before replacement:", text.substring(Math.max(0, start - 10), Math.min(text.length, actualEnd + 10)));
    window.logger?.debug?.("[IME] Text after replacement:", newText.substring(Math.max(0, start - 10), Math.min(newText.length, start + replacementText.length + 10)));
    
    // CRITICAL: Clear currentTokenInfo BEFORE replacement to prevent race conditions
    // This ensures that if performReplacement is called again, it won't use stale tokenInfo
    this.currentTokenInfo = null;
    
    // Set the new text
    if (this.editor && this.editor.setText) {
    this.editor.setText(newText);
    } else if (this.editorElement) {
      // Fallback: directly set text content
      this.editorElement.textContent = newText;
      // Trigger input event
      const event = new Event('input', { bubbles: true });
      this.editorElement.dispatchEvent(event);
    }
    
    // Set cursor after replacement
    const newPos = start + replacementText.length;
    if (this.editor && this.editor.setCursorPosition) {
    this.editor.setCursorPosition(newPos);
    } else if (this.editorElement) {
      // Fallback: set cursor using selection
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(this.editorElement.firstChild || this.editorElement, Math.min(newPos, this.editorElement.textContent.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    this.clearGhostText();
    this.clearTranslitSuggestions();
    this.imeActive = false;
    this.editorMode = window.EditorMode ? window.EditorMode.IDLE : 'IDLE';
    this.currentTokenInfo = null;
    this.lastFetchToken = null; // Reset to allow new suggestions
    
    // CRITICAL: Set flag to prevent fetching suggestions for the SAME token that was just replaced
    // This prevents the dropdown from showing again right after selection for the same word
    this.justReplacedToken = true;
    this.hideSuggestions(); // Ensure dropdown is hidden
    
    // Clear the flag after replacement completes to allow normal suggestion fetching for next word
    // Reset immediately after a brief delay to allow next word suggestions
    setTimeout(() => {
      this.justReplacedToken = false;
      window.logger?.debug?.('[IME] ✅ Flag cleared, suggestions can be fetched again');
      
      // Manually trigger editor change AFTER flag is cleared to allow new suggestions for next word
      window.logger?.debug?.("[IME] Manually triggering editor change after token replacement");
      if (this.editor && this.editor.onChange) {
        this.editor.onChange();
      } else {
        this.handleEditorChange();
      }
    }, 300); // guard window after replacement
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
    // IMPORTANT: Disable legacy background submit calls.
    // We already run `autoAnalyze()` which calls `/api/submit` (save_draft:true) and updates the AI Assistant.
    // The legacy path calls `/api/submit` with save_draft:false and does NOT update the UI, causing:
    // - double submit calls
    // - confusing network traces (200/200) where suggestions exist but panel appears unchanged
    return;

    if (this.suppressSubmitUntil && Date.now() < this.suppressSubmitUntil) {
      if (this.DEBUG_IME) console.debug('[SUBMIT] skipped (suppressed after paste)');
      return;
    }
    if (this.imeActive || this.editorMode === EditorMode.IME_TYPING) {
      if (this.DEBUG_IME) console.debug('[SUBMIT] skipped (IME active)');
      return;
    }
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount < MIN_SUBMIT_WORDS) {
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
    if (this.suppressSubmitUntil && Date.now() < this.suppressSubmitUntil) {
      if (this.DEBUG_IME) console.debug('[SUBMIT] skipped (suppressed after paste)');
      return;
    }
    // Phase 7: Use helper method that works with both legacy and TipTap
    const text = (this.getEditorText() || '').trim();
    if (text !== hash) {
      return;
    }
    if (wordCount < MIN_SUBMIT_WORDS) return;
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

  // ---------------------------------------------------------------------------
  // Large-document chunked corrections helpers
  // ---------------------------------------------------------------------------

  /**
   * Split text into chunks of at most maxWords words, preserving paragraph
   * boundaries. Tamil text is dense (~7 chars/word × 3 bytes UTF-8) so keeping
   * chunks well under 30 KB avoids body-size limits on any individual request.
   */
  splitTextIntoChunks(text, maxWords) {
    const lines = text.split(/\n+/);
    const chunks = [];
    let buf = [];
    let count = 0;
    for (const line of lines) {
      const words = line.trim() ? line.trim().split(/\s+/) : [];
      const lw = words.length;
      // A single line (e.g. one large paragraph with no newlines) can itself exceed
      // maxWords. Split it by word count rather than dropping into a single oversized chunk.
      if (lw > maxWords) {
        if (buf.length > 0) { chunks.push(buf.join('\n')); buf = []; count = 0; }
        for (let wi = 0; wi < words.length; wi += maxWords) {
          chunks.push(words.slice(wi, wi + maxWords).join(' '));
        }
        continue;
      }
      if (count + lw > maxWords && buf.length > 0) {
        chunks.push(buf.join('\n'));
        buf = [];
        count = 0;
      }
      if (line.trim()) {
        buf.push(line);
        count += lw;
      }
    }
    if (buf.length > 0) chunks.push(buf.join('\n'));
    return chunks.length > 0 ? chunks : [text];
  }

  /** Fetch corrections for one chunk; returns [] on non-fatal failure. */
  async fetchOneChunkCorrections(chunkText, signal) {
    try {
      const resp = await this.apiFetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunkText }),
        signal,
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.success && Array.isArray(json.corrections)) return json.corrections;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.warn('[AI] Chunk corrections failed:', e.message);
    }
    return [];
  }

  /**
   * Fetch corrections for all chunks of a large document.
   * Runs CONCURRENCY chunks in parallel; calls onBatchDone(newCorrections, done, total)
   * after each batch so callers can stream partial results to the UI.
   */
  async fetchCorrectionsInChunks(text, signal, onBatchDone) {
    const WORDS_PER_CHUNK = 1500;
    const CONCURRENCY = 4;
    const chunks = this.splitTextIntoChunks(text, WORDS_PER_CHUNK);
    console.log(`[AI] Large document: ${chunks.length} chunks × ${WORDS_PER_CHUNK} words`);
    const all = [];
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      if (signal.aborted) break;
      const batch = chunks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(c => this.fetchOneChunkCorrections(c, signal)));
      const batchCorrections = results.flat();
      for (const r of batchCorrections) all.push(r);
      const done = Math.min(i + batch.length, chunks.length);
      console.log(`[AI] Chunks ${i + 1}–${done}/${chunks.length}: ${all.length} corrections so far`);
      if (onBatchDone && batchCorrections.length > 0) onBatchDone(batchCorrections, done, chunks.length);
    }
    return all;
  }

  // ---------------------------------------------------------------------------
  // SSE streaming corrections (single request — replaces fetchCorrectionsInChunks)
  // ---------------------------------------------------------------------------

  /**
   * Open a single SSE connection to /api/corrections/stream.
   * The server handles all chunking and aborts Gemini immediately on disconnect.
   * Updates the status bar with a live correction count as chunks arrive.
   * Returns the full array of raw corrections when the stream is done.
   */
  async _streamCorrectionsSSE(text, analysisSeq) {
    const allCorrections = [];
    let foundCount = 0;

    // Show live progress in the status bar while streaming
    const _updateProgress = (n) => {
      if (this.analysisSeq !== analysisSeq) return;
      const summaryEl = document.getElementById('suggestions-summary');
      if (!summaryEl) return;
      summaryEl.innerHTML = `
        <div class="flex items-center gap-2 text-primary-600">
          <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-sm font-medium">Analyzing${n > 0 ? ` — ${n} correction${n > 1 ? 's' : ''} found` : ''}…</span>
        </div>`;
    };

    try {
      const response = await this.apiFetch('/api/corrections/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tamil_style: this.getMode() || 'spoken' }),
        signal: this.abortController ? this.abortController.signal : undefined,
      });

      if (!response.ok) {
        // Handle free-tier word limit exceeded (422)
        if (response.status === 422) {
          try {
            const errBody = await response.json();
            if (errBody && errBody.error === 'word_limit_exceeded') {
              throw Object.assign(new Error('word_limit_exceeded'), {
                wordCount: errBody.word_count,
                wordLimit: errBody.word_limit,
                freeTierError: true,
              });
            }
          } catch (jsonErr) {
            if (jsonErr.freeTierError) throw jsonErr;
          }
        }
        console.warn('[AI/Stream] Server returned', response.status, '— falling through');
        return allCorrections;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let eventName = '';
      let dataBuf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // Stale check: a new autoAnalyze has started
        if (this.analysisSeq !== analysisSeq) {
          try { await reader.cancel(); } catch (_) {}
          return allCorrections;
        }

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete trailing line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataBuf = line.slice(6).trim();
          } else if (line === '') {
            // Blank line = message boundary — process accumulated event
            if (dataBuf) {
              let parsed;
              try { parsed = JSON.parse(dataBuf); } catch (_) {}
              if (parsed) {
                if (eventName === 'correction') {
                  allCorrections.push(parsed);
                  foundCount++;
                  // Throttle status updates (every 5 corrections to avoid excessive reflows)
                  if (foundCount % 5 === 1) _updateProgress(foundCount);
                } else if (eventName === 'error') {
                  console.warn('[AI/Stream] Error from server:', parsed.message);
                }
                // 'done' event: stream finished — nothing extra to do here
              }
            }
            eventName = '';
            dataBuf = '';
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e; // propagate — caller handles
      console.warn('[AI/Stream] Fetch error:', e.message);
    }

    console.log('[AI/Stream] Done. Corrections received:', allCorrections.length);
    return allCorrections;
  }

  // ============================================
  // CORRECTION HIGHLIGHTING IN EDITOR
  // ============================================

  /** Set up delegated event handlers on the editor element (called once from init). */
  _setupCorrectionHighlighting() {
    // Create the hover tooltip element and append to body (so it's never clipped).
    if (!document.getElementById('correction-tooltip')) {
      const tooltip = document.createElement('div');
      tooltip.id = 'correction-tooltip';
      document.body.appendChild(tooltip);
    }

    // Create the inline correction popover (one shared instance, re-positioned on each click).
    if (!document.getElementById('correction-popover')) {
      const pop = document.createElement('div');
      pop.id = 'correction-popover';
      document.body.appendChild(pop);
    }

    const editor = document.getElementById('editor');
    if (!editor) return;

    // Click on an underlined span → show inline popover AND focus the matching card in the AI panel.
    editor.addEventListener('click', (e) => {
      const span = e.target.closest('.correction-highlight');
      if (!span) {
        this._hideCorrectionPopover();
        return;
      }
      e.preventDefault();
      const id = span.dataset.suggestionId;
      if (!id) return;

      // Mark span as active
      editor.querySelectorAll('.correction-highlight.correction-active').forEach(s => s.classList.remove('correction-active'));
      span.classList.add('correction-active');

      // Scroll AI panel to the matching card
      if (this.suggestionsPanel && typeof this.suggestionsPanel.focusSuggestion === 'function') {
        this.suggestionsPanel.focusSuggestion(id);
      }

      // Show inline popover near the clicked span
      const suggestion = this.suggestionsPanel?.suggestions?.find(s => s.id === id);
      if (suggestion) {
        this._showCorrectionPopover(span, suggestion);
      }
    });

    // Close popover when clicking anywhere outside a correction span or the popover itself.
    document.addEventListener('click', (e) => {
      if (e.target.closest('.correction-highlight') || e.target.closest('#correction-popover')) return;
      this._hideCorrectionPopover();
    }, true);

    // Close popover on ESC.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hideCorrectionPopover();
    });

    // Mouse move → show / reposition tooltip on correction spans.
    // Suppress tooltip while the click popover is visible (they'd overlap).
    editor.addEventListener('mousemove', (e) => {
      const pop = document.getElementById('correction-popover');
      if (pop && pop.style.display !== 'none') { this._hideTooltip(); return; }
      const span = e.target.closest('.correction-highlight');
      if (!span) { this._hideTooltip(); return; }
      const title = span.dataset.title || '';
      const desc = span.dataset.description || '';
      const text = [title, desc].filter(Boolean).join(': ');
      if (text) this._showTooltip(e.clientX, e.clientY, text);
      else this._hideTooltip();
    });

    // Mouse leaves editor → always hide tooltip.
    editor.addEventListener('mouseleave', () => this._hideTooltip());

    // Hide tooltip on scroll inside the editor container.
    const editorScroll = editor.closest('.overflow-auto');
    if (editorScroll) editorScroll.addEventListener('scroll', () => this._hideTooltip(), { passive: true });
  }

  /**
   * Show a compact suggestion popover anchored below the given correction span.
   * The popover has Accept / Ignore buttons that mirror the panel card actions.
   */
  _showCorrectionPopover(span, suggestion) {
    const pop = document.getElementById('correction-popover');
    if (!pop) return;

    const original  = (suggestion.sourceText || '').trim();
    const corrected = suggestion.preview && suggestion.preview.includes('→')
      ? suggestion.preview.split('→').slice(1).join('→').trim()
      : '';
    const reason    = (suggestion.description || suggestion.title || '').trim();
    const type      = (suggestion.type || 'grammar').toLowerCase();
    const occCount  = suggestion.occurrenceCount || 1;
    const btnLabel  = occCount > 1 ? `Accept all ${occCount}` : 'Accept';

    // Build content using DOM API (safe — no innerHTML with user text)
    const typeBadge = document.createElement('span');
    typeBadge.className = `corr-pop-type ${type}`;
    typeBadge.textContent = type.charAt(0).toUpperCase() + type.slice(1);

    const row = document.createElement('div');
    row.className = 'corr-pop-row';
    if (original) {
      const orig = document.createElement('span');
      orig.className = 'corr-pop-original tamil-text';
      orig.textContent = original;
      row.appendChild(orig);
    }
    if (corrected) {
      const arrow = document.createElement('span');
      arrow.className = 'corr-pop-arrow';
      arrow.textContent = '→';
      const corr = document.createElement('span');
      corr.className = 'corr-pop-corrected tamil-text';
      corr.textContent = corrected;
      row.appendChild(arrow);
      row.appendChild(corr);
    }

    const actions = document.createElement('div');
    actions.className = 'corr-pop-actions';

    if (suggestion.onApply) {
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'corr-pop-accept';
      acceptBtn.textContent = btnLabel;
      acceptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        suggestion.onApply();
        if (this.suggestionsPanel) this.suggestionsPanel.removeSuggestion(suggestion.id);
        this._hideCorrectionPopover();
      });
      actions.appendChild(acceptBtn);
    }

    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'corr-pop-ignore';
    ignoreBtn.textContent = 'Ignore';
    ignoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (suggestion.onIgnore) suggestion.onIgnore();
      if (this.suggestionsPanel) this.suggestionsPanel.removeSuggestion(suggestion.id);
      this._hideCorrectionPopover();
    });
    actions.appendChild(ignoreBtn);

    // Assemble
    pop.innerHTML = '';
    pop.appendChild(typeBadge);
    pop.appendChild(row);
    if (reason) {
      const reasonEl = document.createElement('p');
      reasonEl.className = 'corr-pop-reason';
      reasonEl.textContent = reason;
      pop.appendChild(reasonEl);
    }
    pop.appendChild(actions);

    // Position below the span, clamped inside viewport
    pop.style.display = 'block';
    const spanRect = span.getBoundingClientRect();
    const popWidth = 280;
    let left = spanRect.left;
    let top  = spanRect.bottom + 10;

    // Clamp horizontally
    if (left + popWidth > window.innerWidth - 12) {
      left = Math.max(8, window.innerWidth - popWidth - 12);
    }
    // If below viewport, show above the span instead
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;
    const popHeight = pop.offsetHeight || 120;
    if (top + popHeight > window.innerHeight - 12) {
      pop.style.top = `${Math.max(8, spanRect.top - popHeight - 10)}px`;
    }
  }

  /** Hide the inline correction popover. */
  _hideCorrectionPopover() {
    const pop = document.getElementById('correction-popover');
    if (pop) pop.style.display = 'none';
    // Remove active highlight from all correction spans
    document.querySelectorAll('.correction-highlight.correction-active').forEach(s => s.classList.remove('correction-active'));
  }

  /** Remove all `.correction-highlight` spans from the editor, unwrapping their children. */
  _clearCorrectionHighlights() {
    const editor = document.getElementById('editor');
    if (!editor) return;
    const spans = Array.from(editor.querySelectorAll('.correction-highlight'));
    spans.forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    try { editor.normalize(); } catch (_e) {}
    this._hideTooltip();
  }

  /**
   * Wrap ALL occurrences of each suggestion's sourceText in styled spans.
   * Clears any previous highlights first.
   */
  _highlightCorrectionsInEditor(suggestions) {
    const editor = document.getElementById('editor');
    if (!editor) return;
    this._clearCorrectionHighlights();
    if (!suggestions || suggestions.length === 0) return;

    let count = 0;
    for (const s of suggestions) {
      const searchText = (s.sourceText || s.originalText || '').trim();
      if (searchText.length < 2) continue;
      const typeClass = this._getCorrectionTypeClass(s.type);
      const wrapped = this._wrapAllMatches(editor, searchText, s.id, typeClass, s.title || '', s.description || '');
      if (wrapped > 0) count++;
    }
    console.log('[Highlight] Highlighted', count, '/', suggestions.length, 'corrections in editor');
  }

  /**
   * Walk the editor DOM and wrap EVERY occurrence of searchText in a correction span.
   * Returns the total number of spans created.
   */
  _wrapAllMatches(container, searchText, suggestionId, typeClass, title, description) {
    let count = 0;
    const wrap = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Skip text already inside a correction span.
        if (node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('correction-highlight')) return;
        let remaining = node;
        let idx = remaining.textContent.indexOf(searchText);
        while (idx !== -1) {
          // Split: [before...match][after...]
          // remaining.splitText(idx) splits remaining into [before] and returns [match+after].
          const matchAndAfter = remaining.splitText(idx);
          // matchAndAfter.splitText(searchText.length) splits into [match] and returns [after].
          const after = matchAndAfter.splitText(searchText.length);
          const span = document.createElement('span');
          span.className = `correction-highlight ${typeClass}`;
          span.dataset.suggestionId = suggestionId;
          span.dataset.title = title;
          span.dataset.description = description;
          span.textContent = matchAndAfter.textContent;
          matchAndAfter.parentNode.replaceChild(span, matchAndAfter);
          count++;
          remaining = after;
          idx = remaining.textContent.indexOf(searchText);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('correction-highlight')) {
        // Clone childNodes list first — wrapping mutates the live NodeList.
        Array.from(node.childNodes).forEach(wrap);
      }
    };
    wrap(container);
    return count;
  }

  /** Map suggestion type string to a CSS class. */
  _getCorrectionTypeClass(type) {
    const t = (type || 'grammar').toLowerCase().replace(/\s+/g, '-');
    const map = {
      grammar: 'correction-grammar',
      punctuation: 'correction-punctuation',
      spelling: 'correction-spelling',
      style: 'correction-style',
      clarity: 'correction-clarity',
      'word-choice': 'correction-style',
      'incomplete-word': 'correction-spelling',
      sandhi: 'correction-grammar',
      'missing-space': 'correction-grammar',
      phonetic: 'correction-grammar',
      case: 'correction-grammar',
      space: 'correction-grammar',
    };
    return map[t] || 'correction-grammar';
  }

  /**
   * Find the first text-node occurrence of `searchText` under `container` and
   * wrap it in a `<span class="correction-highlight …">`. Returns true on success.
   */
  _wrapFirstMatch(container, searchText, suggestionId, typeClass, title, description) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      // Skip text already inside a correction span.
      if (node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('correction-highlight')) continue;
      const idx = node.textContent.indexOf(searchText);
      if (idx === -1) continue;
      try {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + searchText.length);
        const span = document.createElement('span');
        span.className = `correction-highlight ${typeClass}`;
        span.dataset.suggestionId = suggestionId;
        span.dataset.title = title;
        span.dataset.description = description;
        range.surroundContents(span);
        return true;
      } catch (e) {
        console.warn('[Highlight] surroundContents failed for:', searchText, e.message);
      }
      break;
    }
    return false;
  }

  _showTooltip(x, y, text) {
    const tooltip = document.getElementById('correction-tooltip');
    if (!tooltip) return;
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    this._positionTooltip(tooltip, x, y);
  }

  _positionTooltip(tooltip, x, y) {
    const OFFSET = 14;
    const tw = tooltip.offsetWidth || 200;
    const th = tooltip.offsetHeight || 40;
    let left = x + OFFSET;
    let top = y + OFFSET;
    if (left + tw > window.innerWidth - 8) left = x - tw - OFFSET;
    if (top + th > window.innerHeight - 8) top = y - th - OFFSET;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  _hideTooltip() {
    const tooltip = document.getElementById('correction-tooltip');
    if (tooltip) tooltip.classList.remove('visible');
  }

  async autoAnalyze() {
    // Optional opts: autoAnalyze({ silent: true })
    const opts = (arguments && arguments[0] && typeof arguments[0] === 'object') ? arguments[0] : {};
    const silent = !!opts.silent;

    const text = this.getEditorText().trim();
    
    console.log('[AI] 🚀 autoAnalyze() called with text length:', text.length);
    console.log('[AI] 📋 Full text:', text.substring(0, 200));

    // If user just applied suggestions, don't immediately re-run analysis (it clears the panel).
    if (this.suppressAutoAnalyzeUntil && Date.now() < this.suppressAutoAnalyzeUntil) {
      console.log('[AI] ⏸️ Suppressing autoAnalyze right after applying suggestions');
      return;
    }
    
    // Skip if text is empty - clear AI suggestions
    if (!text || text.length === 0) {
      console.log('[AI] ⚠️ Text is empty - clearing AI suggestions');
      // Reset so the same content triggers a fresh analysis after cut+paste
      this.lastAnalyzedText = '';
      if (this.suggestionsPanel && typeof this.suggestionsPanel.clearSuggestions === 'function') {
        this.suggestionsPanel.clearSuggestions();
      }
      this.updateAnalysisStatus('');
      return;
    }

    // Skip if text doesn't contain Tamil characters (avoid unnecessary submit calls)
    const hasTamil = /[\u0B80-\u0BFF]/.test(text);
    if (!hasTamil) {
      console.log('[AI] ⚠️ No Tamil characters detected - skipping analysis');
      this.updateAnalysisStatus('');
      return;
    }
    
    // Skip if text is too short (minimum 20 words) - clear AI suggestions
    const wordCount = countWords(text);
    console.log('[AI] 📊 Text analysis:', { wordCount, textLength: text.length, preview: text.substring(0, 100) });
    
    // Check if text meets minimum requirements (20 words)
    if (wordCount < MIN_SUBMIT_WORDS) {
      console.log('[AI] ⚠️ Text too short - clearing AI suggestions:', { wordCount, textLength: text.length });
      if (this.suggestionsPanel && typeof this.suggestionsPanel.clearSuggestions === 'function') {
        this.suggestionsPanel.clearSuggestions();
      }
      this.updateAnalysisStatus('');
      // Don't show notification when silent
      if (!silent && text.length > 0) {
        this.showNotification(`Type or paste at least ${MIN_SUBMIT_WORDS} words to get AI suggestions.`, 'info');
      }
      return;
    }
    
    // ── Free tier: enforce 200-word limit ──
    if (!_isProUser() && wordCount > FREE_TIER_MAX_WORDS) {
      console.log('[FreeTier] ⛔ Word count exceeds free tier limit:', wordCount, '>', FREE_TIER_MAX_WORDS);
      this.updateAnalysisStatus('');
      _showWordLimitCard(wordCount);
      return;
    }

    // ── Free tier: enforce daily suggestion count ──
    if (!_isProUser() && _getSuggestionsRemaining() <= 0) {
      console.log('[FreeTier] ⛔ Daily suggestion limit reached');
      this.updateAnalysisStatus('');
      _showDailyLimitCard();
      _updateQuotaBar();
      return;
    }

    // Skip if text hasn't changed since last analysis
    if (text === this.lastAnalyzedText) {
      console.log('[AI] ⏭️ Text unchanged since last analysis - skipping');
      return;
    }

    // Skip if we're already mid-analysis for this exact text.
    // This prevents the 2-second handleEditorChange debounce from firing a second
    // autoAnalyze while the first SSE stream is still running, which would abort
    // the first, clear the suggestions panel, and produce a stale "Looks good" state.
    if (this.isAnalyzing && this._analyzingText === text) {
      console.log('[AI] ⏭️ Already analyzing same text - skipping concurrent duplicate');
      return;
    }

    console.log('[AI] ✅ Text meets requirements - proceeding with analysis');
    
    // Cancel any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }

    // Cancel any in-flight SSE stream from a previous submission (prevents multiple open streams)
    if (this.activeEventSource) {
      try { this.activeEventSource.close(); } catch (_e) {}
      this.activeEventSource = null;
    }

    // New analysis sequence (used to cancel stale SSE/poll watchers)
    const analysisSeq = ++this.analysisSeq;
    
    this.isAnalyzing = true;
    this._analyzingText = text; // track current text so concurrent calls can detect it
    this.abortController = new AbortController();
    this.updateAnalysisStatus('analyzing');
    
    let data = null;
    try {
      // ── Single streaming request — server handles all chunking, no concurrent requests ──
      // Aborts server-side Gemini calls immediately when client disconnects or new analysis starts.
      console.log('[AI] 🚀 Starting streaming corrections for text length:', text.length);
      const streamedCorrections = await this._streamCorrectionsSSE(text, analysisSeq);
      data = { corrections: streamedCorrections };
      this.lastAnalyzedText = text;

      // Free tier: increment daily usage counter after a successful analysis
      if (!_isProUser()) {
        _incrementDailyCount();
        _updateQuotaBar();
      }

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
      // Backend/SSE/poll send top-level data.corrections (array). Prefer that when present so AI panel always shows.
      const parsedSubmissionSuggestions = (() => {
        const rawSug = data.submission?.suggestions;
        if (!rawSug) return [];
        if (Array.isArray(rawSug)) return rawSug;
        if (typeof rawSug === 'string') {
          try {
            const parsed = JSON.parse(rawSug);
            return Array.isArray(parsed) ? parsed : [];
          } catch (_e) {
            return [];
          }
        }
        return [];
      })();

      // Prefer data.corrections when backend sent it (SSE/poll/GET submission), then submission.suggestions, then rest
      const corrections =
        (Array.isArray(data.corrections) && data.corrections.length > 0 ? data.corrections : null) ||
        (Array.isArray(parsedSubmissionSuggestions) && parsedSubmissionSuggestions.length > 0 ? parsedSubmissionSuggestions : null) ||
        data.result?.suggestions ||
        data.suggestions ||
        [];
      // Free tier: filter to grammar/spelling/punctuation corrections only
      const filteredCorrections = _applyFreeTierFilter(corrections);
      if (!_isProUser() && filteredCorrections.length < corrections.length) {
        console.log('[FreeTier] Filtered', corrections.length - filteredCorrections.length, 'non-grammar corrections');
      }
      // Reassign so downstream code uses filtered results
      const effectiveCorrections = filteredCorrections;

      console.log('[AI Debug] Extracted corrections:', effectiveCorrections.length, 'items');
      console.log('[AI Debug] Raw corrections data:', JSON.stringify(effectiveCorrections, null, 2));
      console.log('[AI Debug] Full API response data:', JSON.stringify(data, null, 2));

      // Log each correction's type to verify they're from API
      effectiveCorrections.forEach((corr, idx) => {
        console.log(`[AI Debug] Correction ${idx + 1}:`, {
          type: corr.type || corr.Type || 'unknown',
          original: corr.original || corr.originalText || 'N/A',
          corrected: corr.corrected || corr.correction || 'N/A',
          reason: corr.reason || corr.description || 'N/A',
          source: 'API_RESPONSE'
        });
      });
      
      // Check if suggestionsPanel is initialized
      if (!this.suggestionsPanel) {
        console.error('[AI Debug] ❌ suggestionsPanel is not initialized!');
        // Try to initialize it
        const container = document.getElementById('suggestions-container');
        const summary = document.getElementById('suggestions-summary');
        const acceptAllBtn = document.getElementById('accept-all-btn');
        if (container && summary && acceptAllBtn) {
          this.suggestionsPanel = new SuggestionsPanel(container, summary, acceptAllBtn);
          this.suggestionsPanel.onAcceptSuggestion = () => this.handleSuggestionAccepted();
          console.log('[AI Debug] ✅ suggestionsPanel initialized on-the-fly');
        } else {
          console.error('[AI Debug] ❌ Cannot initialize suggestionsPanel - missing elements:', {
            container: !!container,
            summary: !!summary,
            acceptAllBtn: !!acceptAllBtn
          });
        }
      }
      
      // Count how many times each (type, original, corrected) appears in the RAW corrections
      // array before dedup. Backend sends one entry per chunk occurrence so the same error
      // word in 5 chunks = 5 entries → occurrenceCount 5 on the deduplicated card.
      const _occMap = Object.create(null);
      for (const r of effectiveCorrections) {
        const _o = (r.original || r.originalText || '').normalize('NFC').trim();
        const _c = (r.corrected || r.correction || '').normalize('NFC').trim();
        const _t = (r.type || r.Type || 'grammar').toString().toLowerCase().trim();
        if (_o && _c && _o !== _c) {
          const _k = `${_t}|${_o}|${_c}`;
          _occMap[_k] = (_occMap[_k] || 0) + 1;
        }
      }

      const geminiSuggestions = effectiveCorrections
        // Filter out invalid suggestions (must have valid original !== corrected)
        .filter((result, index) => {
          const original =
            result.original ||
            result.originalText ||
            result.original_text ||
            result.Original ||
            result.sourceText ||
            '';
          const corrected =
            result.corrected ||
            result.correction ||
            result.correctionText ||
            result.correction_text ||
            result.Correction ||
            result.Corrected ||
            result.suggestedText ||
            '';
          const normalizeComparable = (s) => {
            try {
              return String(s || '')
                .normalize('NFC')
                // remove zero-width chars
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                // normalize whitespace
                .replace(/\s+/g, ' ')
                .trim()
                // strip wrapping quotes (ASCII + Tamil quotes + smart quotes)
                .replace(/^[\"'“”‘’«»‹›「」『』『』《》〈〉「」『』ʻʼ’‘‚‛„‟\u2018\u2019\u201C\u201D\u201E\u2039\u203A\u00AB\u00BB\u201A\u201B]+/, '')
                .replace(/[\"'“”‘’«»‹›「」『』『』《》〈〉「」『』ʻʼ’‘‚‛„‟\u2018\u2019\u201C\u201D\u201E\u2039\u203A\u00AB\u00BB\u201A\u201B]+$/, '')
                .trim();
            } catch (_e) {
              return String(s || '').replace(/\s+/g, ' ').trim();
            }
          };
          const oNorm = normalizeComparable(original);
          const cNorm = normalizeComparable(corrected);
          const hasValidSuggestion = oNorm && cNorm && oNorm !== cNorm;
          if (!hasValidSuggestion) {
            console.log('[AI Debug] Filtered out duplicate/no-op suggestion:', { original, corrected, oNorm, cNorm, result });
          }
          return hasValidSuggestion;
        })
        .map((result, index) => {
          // Map backend fields to frontend expected format
          let original =
            result.original ||
            result.originalText ||
            result.original_text ||
            result.Original ||
            '';
          let corrected =
            result.corrected ||
            result.correction ||
            result.correctionText ||
            result.correction_text ||
            result.Correction ||
            result.Corrected ||
            '';
          // Strip stray Unicode artifacts that AI models sometimes embed in Tamil text
          // (arrows U+2190–U+27BF, math/symbol blocks, zero-width chars, specials block)
          const _stripAIArtifacts = (s) => String(s || '').normalize('NFC')
            .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '')
            .replace(/[\u2190-\u27BF]/g, '')
            .replace(/[\uFFF0-\uFFFF]/g, '')
            .trim();
          original  = _stripAIArtifacts(original);
          corrected = _stripAIArtifacts(corrected);
          const reason = result.reason || result.description || result.title || result.Reason || '';
          
          console.log('[AI Debug] Mapping suggestion from API:', { 
            original, 
            corrected, 
            reason, 
            type: result.type || result.Type || 'grammar',
            rawResult: result,
            source: 'API_RESPONSE'
          });
          
          // Use a stable ID so duplicates don't render repeatedly (and Apply/Ignore stays consistent).
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
          // Dedupe by (type, original, corrected) only so same correction shows once even if reason/position differs
          const stableKey = `${normalizeComparable(result.type || result.Type || 'grammar').toLowerCase()}|${normalizeComparable(original)}|${normalizeComparable(corrected)}`;
          const stableId = `gemini-${hashString(stableKey)}`;

          // Count how many raw correction entries share this (type, original, corrected) key.
          const _countKey = `${(result.type || result.Type || 'grammar').toString().toLowerCase().trim()}|${original.normalize('NFC').trim()}|${corrected.normalize('NFC').trim()}`;
          const occurrenceCount = _occMap[_countKey] || 1;

          return {
            id: stableId,
            title: reason || 'Grammar Suggestion',
            description: reason,
            type: result.type || result.Type || 'grammar',
            occurrenceCount,
            preview: original && corrected ? `${original} → ${corrected}` : corrected || original || '',
            sourceText: original,
            onApply: original && corrected ? () => {
              const currentText = this.getEditorText();
              // Replace ALL occurrences of `original` with `corrected` throughout the text.
              // Since the panel deduplicates by (type, original, corrected), one card
              // represents every instance of the same error — so applying it must fix them all.
              let pos = 0;
              let result2 = '';
              let changed = false;
              while (true) {
                const idx = currentText.indexOf(original, pos);
                if (idx === -1) { result2 += currentText.slice(pos); break; }
                result2 += currentText.slice(pos, idx) + corrected;
                pos = idx + original.length;
                changed = true;
              }
              if (changed) {
                const newText = result2;
                if (this.editor && typeof this.editor.setText === 'function') {
                  this.editor.setText(newText);
                } else if (this.editorElement) {
                  this.editorElement.textContent = newText;
                } else {
                  console.error('[APPLY] No editor method available');
                }
                if (this._applySaveTimeout) clearTimeout(this._applySaveTimeout);
                this._applySaveTimeout = setTimeout(() => {
                  if (typeof this.autosave === 'function') this.autosave();
                }, 500);
              }
            } : null,
            onIgnore: () => {
              // Just removes the suggestion
            }
          };
        });

      // If everything got filtered out but backend sent items, show a best-effort rendering
      // so users can still see what the API returned (even if it looks like a "no-op" after normalization).
      if (geminiSuggestions.length === 0 && Array.isArray(effectiveCorrections) && effectiveCorrections.length > 0) {
        const fallback = effectiveCorrections.map((result, idx) => {
          const original =
            result.original ||
            result.originalText ||
            result.original_text ||
            result.Original ||
            '';
          const corrected =
            result.corrected ||
            result.correction ||
            result.correctionText ||
            result.correction_text ||
            result.Correction ||
            result.Corrected ||
            '';
          const reason = result.reason || result.description || result.title || result.Reason || '';
          const type = result.type || result.Type || 'grammar';
          return {
            id: `gemini-fallback-${idx}-${Date.now()}`,
            title: reason || 'Suggestion',
            description: reason || '',
            type,
            preview: original && corrected ? `${original} → ${corrected}` : (corrected || original || ''),
            sourceText: original || '',
            onApply: null,
            onIgnore: () => {},
          };
        });
        geminiSuggestions.push(...fallback);
      }

      // Final guard: dedupe identical suggestions (backend can sometimes repeat items)
      const dedupedGeminiSuggestions = (() => {
        const seen = new Set();
        const out = [];
        for (const s of geminiSuggestions) {
          if (!s || !s.id) continue;
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          out.push(s);
        }
        return out;
      })();
      
      console.log('[AI Debug] Mapped suggestions:', dedupedGeminiSuggestions.length, 'items');
      console.log('[AI Debug] Mapped suggestions data:', JSON.stringify(dedupedGeminiSuggestions, null, 2));
      
      if (!this.suggestionsPanel) {
        console.error('[AI Debug] ❌ Cannot add suggestions - suggestionsPanel is null!');
        this.updateAnalysisStatus('error');
        return;
      }
      
      this.suggestionsPanel.clearSuggestions();
      console.log('[AI Debug] Cleared suggestions panel');
      
      if (dedupedGeminiSuggestions.length > 0) {
        this.suggestionsPanel.addSuggestions(dedupedGeminiSuggestions);
        console.log('[AI Debug] Added', dedupedGeminiSuggestions.length, 'suggestions to panel');
        console.log('[AI Debug] Panel suggestions count after add:', this.suggestionsPanel.suggestions.length);
        // Underline corrections inline in the editor
        this._highlightCorrectionsInEditor(this.suggestionsPanel.suggestions);
      } else {
        console.warn('[AI Debug] ⚠️ No suggestions to add (all filtered out or empty response)');
      }

      // Highlight spelling mistakes in editor
      if (this.editor && typeof this.editor.highlightSpellingMistakes === 'function') {
        this.editor.highlightSpellingMistakes(dedupedGeminiSuggestions);
      }
      
      console.log('[AI Debug] Final panel suggestions count:', this.suggestionsPanel.suggestions.length);
      
      // Only show "no issues" after backend completion.
      const finalStatus = String(data?.submission?.status || '').toLowerCase();
      if (finalStatus && finalStatus !== 'completed') {
        this.updateAnalysisStatus('analyzing');
        return;
      }

      // If backend reports an AI error but still returns success-shaped payload (empty corrections),
      // DO NOT show "Looks solid!" — surface the real message.
      const backendMsg = String(data?.message || data?.submission?.error || '').trim();
      if (dedupedGeminiSuggestions.length === 0 && backendMsg) {
        const isAiIssue =
          /temporarily unavailable|not configured|missing|timeout|provider|gemini|ai/i.test(backendMsg) ||
          !!data?.submission?.error;
        if (isAiIssue) {
          if (this.suggestionsPanel && typeof this.suggestionsPanel.setEmptyState === 'function') {
            this.suggestionsPanel.setEmptyState('idle');
          }
          this.updateAnalysisStatus('error');
          this.showNotification(backendMsg, 'error');
          return;
        }
      }

      if (dedupedGeminiSuggestions.length === 0) {
        if (this.suggestionsPanel && typeof this.suggestionsPanel.setEmptyState === 'function') {
          this.suggestionsPanel.setEmptyState('no-issues');
        }
        this.updateAnalysisStatus('no-issues');
      } else {
        this.updateAnalysisStatus('complete', dedupedGeminiSuggestions.length);
        // Suppress the next autoAnalyze for 3 s so a late-firing handleEditorChange
        // debounce cannot immediately clear and re-run analysis on the results we just showed.
        this.suppressAutoAnalyzeUntil = Date.now() + 3000;
      }
      // Update quota bar after each analysis
      _updateQuotaBar();
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
      // Free tier: word limit exceeded from backend
      if (error.freeTierError && error.message === 'word_limit_exceeded') {
        this.updateAnalysisStatus('');
        _showWordLimitCard(error.wordCount || countWords(text));
        return;
      }
      console.error('Auto-analysis error:', error);
      this.updateAnalysisStatus('error');
    } finally {
      this.isAnalyzing = false;
      this._analyzingText = '';
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
            <span class="text-sm font-medium">Looks solid!</span>
          </div>
        `;
        break;
      case 'error':
        summaryEl.innerHTML = `
          <div class="text-sm text-red-600">
            AI temporarily unavailable. Your text is safe — try again in a moment.
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
      wordCountEl.textContent = count;
    }
    // Free tier: show / hide word limit indicator and color the badge
    const limitEl = document.getElementById('word-count-limit');
    const badge = document.getElementById('editor-word-count-badge');
    if (!_isProUser()) {
      if (limitEl) limitEl.classList.remove('hidden');
      if (badge) {
        if (count > FREE_TIER_MAX_WORDS) {
          badge.classList.remove('border-gray-200', 'text-gray-500', 'border-amber-300', 'text-amber-700');
          badge.classList.add('border-red-300', 'text-red-600');
        } else if (count > FREE_TIER_MAX_WORDS * 0.85) {
          badge.classList.remove('border-gray-200', 'text-gray-500', 'border-red-300', 'text-red-600');
          badge.classList.add('border-amber-300', 'text-amber-700');
        } else {
          badge.classList.remove('border-red-300', 'text-red-600', 'border-amber-300', 'text-amber-700');
          badge.classList.add('border-gray-200', 'text-gray-500');
        }
      }
    } else {
      if (limitEl) limitEl.classList.add('hidden');
      if (badge) {
        badge.classList.remove('border-red-300', 'text-red-600', 'border-amber-300', 'text-amber-700');
        badge.classList.add('border-gray-200', 'text-gray-500');
      }
    }
  }

  updateAcceptedCount() {
    const count = this.suggestionsPanel.getAcceptedCount();
    const acceptedCountEl = document.getElementById('accepted-count');
    if (acceptedCountEl) {
      acceptedCountEl.textContent = count;
    }
  }

  scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    if (this.autosaveAuthBlocked) {
      return;
    }

    // Paste can trigger multiple editor-change events. We already queue exactly one
    // `autoAnalyze()` in `queuePasteAnalyze()`, so skip scheduling a second one here.
    if (this.pasteSuppressUntil && Date.now() < this.pasteSuppressUntil) {
      return;
    }

    this.saveTimeout = setTimeout(() => {
      // Unify "save" with proofreading submit to avoid double /api/submit calls.
      // This will only run when text meets MIN_SUBMIT_WORDS and contains Tamil.
      this.autoAnalyze({ silent: true });
    }, 2000);
  }

  async autosave() {
    if (this.autosaveAuthBlocked) {
      return;
    }
    // If a paste just happened, avoid immediately doing a second /api/submit (save_draft)
    // Paste should trigger ONE analysis submit; autosave can happen on the next edit.
    if (this.suppressSubmitUntil && Date.now() < this.suppressSubmitUntil) {
      return;
    }

    const text = this.getEditorText().trim();
    
    // Don't save empty drafts
    if (!text || text.length < 5) {
      return;
    }

    // Don't autosave via /api/submit until user has typed enough content
    // (prevents submit spam on every small edit)
    const wc = countWords(text);
    if (wc < MIN_SUBMIT_WORDS) {
      return;
    }
    
    const saveStatusEl = document.getElementById('save-status');
    const autosaveTimeEl = document.getElementById('autosave-time');
    
    if (saveStatusEl) {
      saveStatusEl.innerHTML = '<span class="inline-block w-2 h-2 bg-gray-400 rounded-full mr-2"></span>Saving...';
    }

    try {
      // Backend hard limit: ~100 KB raw bytes ≈ 33,333 Tamil chars (3 bytes/char UTF-8).
      // Truncate text so the draft is ALWAYS saved, even for very large documents.
      // The full text stays live in the editor; only the server copy is capped here.
      const MAX_SAVE_CHARS = 30_000;
      const saveText = text.length > MAX_SAVE_CHARS ? text.slice(0, MAX_SAVE_CHARS) : text;
      const wasTruncated = saveText.length < text.length;

      const response = await this.apiFetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: saveText,
          model: 'gemini-flash',
          save_draft: true,
          ...(this.currentDraft?.id ? { submission_id: this.currentDraft.id } : {}),
        })
      });

      if (!response.ok) {
        let errorData = { error: 'Unknown error' };
        try {
          const errorText = await response.text();
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText || response.statusText || 'Unknown error' };
          }
        } catch (e) {
          console.error('[AUTOSAVE] Could not parse error response:', e);
          errorData = { error: response.statusText || 'Unknown error' };
        }
        
        console.error('[AUTOSAVE] Failed to save draft:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          url: '/api/submit'
        });
        
        // Don't throw error for 401 - just log it (auth will handle redirect)
        if (response.status === 401) {
          console.warn('[AUTOSAVE] Unauthorized - token may be expired. Auth utils should handle refresh.');
          return; // Exit gracefully, don't throw
        }
        
        throw new Error(`Failed to save draft: ${errorData.error || response.statusText}`);
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
        saveStatusEl.innerHTML = wasTruncated
          ? '<span class="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>Saved (partial)'
          : '<span class="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>Saved';
      }
      if (autosaveTimeEl) {
        const now = new Date();
        autosaveTimeEl.textContent = `Last saved: ${now.toLocaleTimeString()}`;
      }
      if (wasTruncated) {
        const kChars = Math.round(text.length / 1000);
        this.showNotification(
          `Large document (${kChars}K chars): only first 30K characters saved to server. Full text is safe in your editor.`,
          'warning'
        );
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

    // Keep the "All set" empty-state visible and avoid immediately clearing it via a scheduled autoAnalyze.
    if (this.suggestionsPanel && typeof this.suggestionsPanel.setEmptyState === 'function') {
      this.suggestionsPanel.setEmptyState('resolved');
    }
    this.lastAnalyzedText = this.getEditorText().trim();
    this.suppressAutoAnalyzeUntil = Date.now() + 1500;

    this.updateAcceptedCount();
    this.showNotification('All suggestions applied!', 'success');
    
    // Auto-save draft after accepting all suggestions (never lose changes)
    if (typeof this.autosave === 'function') {
      console.log('[APPLY] Auto-saving draft after accepting all suggestions');
      setTimeout(() => this.autosave(), 300);
    }
  }

  async pollSubmission(submissionId, seq = this.analysisSeq) {
    if (!submissionId) return {};
    // Backend transitions: pending -> processing -> completed/failed.
    // We must keep polling through "processing" (previously we stopped too early).
    const maxTries = 12;
    const delays = [800, 1200, 1800, 2500, 3500, 5000, 7000, 9000, 11000, 13000, 15000, 15000];
    for (let i = 0; i < maxTries; i++) {
      // If a newer analysis started, stop this poller immediately (prevents extra numbered calls).
      if (seq !== this.analysisSeq) return {};
      const waitMs = delays[i] || 15000;
      await new Promise((r) => setTimeout(r, waitMs));
      try {
        if (seq !== this.analysisSeq) return {};
        // Go backend exposes this under /api/v1 (Vercel rewrite forwards it to Cloud Run backend).
        const res = await this.apiFetch(`/api/v1/submissions/${submissionId}`, { method: 'GET' });
        if (!res.ok) continue;
        const data = await res.json();
        const status = String(data.submission?.status || '').toLowerCase();
        console.log('[GEMINI] poll attempt', i + 1, 'status', status || '(empty)', 'waitedMs', waitMs);

        // Only stop when the backend is actually done.
        if (status === 'completed' || status === 'failed') {
          return data;
        }
        // Keep polling while pending/processing/unknown transient statuses.
      } catch (err) {
        console.warn('[GEMINI] poll error', err);
      }
    }
    return {};
  }

  async logout() {
    console.log('[WORKSPACE] logout() method called');
    
    // Use centralized logout function if available (from nav.ejs)
    if (window.performLogout && typeof window.performLogout === 'function') {
      console.log('[WORKSPACE] Using centralized performLogout function');
      // Pass skipConfirm=true for programmatic logout from workspace
      window.performLogout(true);
      return;
    }
    
    // Fallback: manual logout
    if (!confirm('Are you sure you want to log out?')) {
      return;
    }
    
    console.log('[WORKSPACE] User confirmed logout');
    
    // Always clear tokens first (client-side)
    console.log('[WORKSPACE] Clearing client-side tokens...');
    if (window.authUtils && typeof window.authUtils.clearAuthTokens === 'function') {
      window.authUtils.clearAuthTokens();
    } else {
      localStorage.removeItem('access_token');
      const cookieOptions = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = `access_token=; ${cookieOptions}`;
      document.cookie = `refresh_token=; ${cookieOptions}`;
      document.cookie = `proof_refresh_token=; ${cookieOptions}`;
    }
    
    // Try to call logout API (non-blocking)
    fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(() => {
      // Ignore errors
    });
    
    // Force redirect immediately (don't wait for API call)
    console.log('[WORKSPACE] Redirecting to home page immediately');
    window.location.href = '/';
  }

  showNotification(message, type = 'info') {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 transition-opacity duration-300`;
    
    const bgColors = {
      success: 'bg-emerald-600',
      error: 'bg-rose-600',
      warning: 'bg-yellow-500',
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
    
    if (listView) listView.classList.add('hidden');
    if (editorPanel) {
      editorPanel.classList.remove('hidden');
      editorPanel.style.display = 'flex';
    }
    
    // Find AI Assistant panel - try multiple times if not immediately available
    const findAIPanel = () => {
      const aiPanel = document.getElementById('ai-assistant-panel');
      if (aiPanel) {
        aiPanel.classList.remove('hidden');
        aiPanel.style.display = 'flex';
        aiPanel.style.visibility = 'visible';
        aiPanel.style.opacity = '1';
        console.log('[WorkspaceJS] ✅ AI Assistant panel is now visible', aiPanel.offsetWidth, 'px wide');
        return true;
      }
      return false;
    };
    
    // Try to find panel immediately
    if (!findAIPanel()) {
      // If not found, try again after DOM is ready (may be rendered later)
      setTimeout(() => {
        if (!findAIPanel()) {
          // Last attempt after a longer delay
          setTimeout(() => {
            const aiPanel = document.getElementById('ai-assistant-panel');
            if (aiPanel) {
              aiPanel.classList.remove('hidden');
              aiPanel.style.display = 'flex';
              aiPanel.style.visibility = 'visible';
              aiPanel.style.opacity = '1';
              console.log('[WorkspaceJS] ✅ AI Assistant panel found and shown (delayed)');
            } else {
              // Panel not found - this is OK if we're in a different view mode
              // Only log as debug, not warning, to reduce console noise
              if (this.currentMode === 'editor') {
                console.debug('[WorkspaceJS] AI Assistant panel not found - may not be rendered yet or page is in different mode');
              }
            }
          }, 500);
        }
      }, 100);
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
      // Use /api/v1/submissions to match backend endpoint
      const response = await this.apiFetch('/api/v1/submissions?limit=50');
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      this.drafts = data.submissions || data.data || [];
      
      if (loadingEl) loadingEl.classList.add('hidden');
      
      if (this.drafts.length === 0) {
        // Zero drafts is the canonical new-user state. If a homepage demo
        // saved a pending draft in localStorage (user clicked "Save & sign
        // up" on the marketing page), auto-open a new draft so the restore
        // flow inside createNewDraft() fires. Otherwise fall through to
        // the standard empty state.
        let hasPending = false;
        try {
          hasPending = !!localStorage.getItem('prooftamil_pending_draft');
        } catch (_) {}
        if (hasPending) {
          this.createNewDraft();
          return;
        }
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
      // Use the correct API endpoint - proxy will forward to backend
      const apiUrl = `/api/v1/submissions/${draftId}`;
      console.log('[WorkspaceJS] Fetching draft from:', apiUrl);

      // Cloud Run scales to zero when idle; on cold start it returns 503 {"status":"starting"}.
      // Retry with backoff for up to ~15s so the user's draft still loads after a cold boot.
      const MAX_COLD_START_RETRIES = 6;
      const COLD_START_RETRY_MS = 2500;
      let response = null;
      let coldStartShown = false;
      for (let attempt = 0; attempt <= MAX_COLD_START_RETRIES; attempt++) {
        response = await this.apiFetch(apiUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (response.status !== 503) break;
        // Peek at the body to check for Cloud Run "starting" sentinel
        const bodyClone = response.clone();
        let bodyText = '';
        try { bodyText = await bodyClone.text(); } catch (_e) {}
        const isStarting = bodyText.includes('"starting"') || bodyText.includes('starting');
        if (!isStarting) break; // Real 503, not a cold start
        if (attempt === MAX_COLD_START_RETRIES) break; // Exhausted retries
        if (!coldStartShown) {
          coldStartShown = true;
          this.showNotification('Backend is starting up, please wait a moment…', 'info');
          console.log('[WorkspaceJS] Cloud Run cold start detected — retrying draft load…');
        }
        await new Promise(resolve => setTimeout(resolve, COLD_START_RETRY_MS));
      }

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => String(response.status));
        console.error('API error response:', errorText);
        throw new Error(`Failed to load draft: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('[WorkspaceJS] Draft data loaded:', data);
      // Handle both response formats: { submission: {...} } or direct submission object
      const draft = data.submission || data;
      
      // Load draft into editor (prefer original_text; fallback to proofread_text for completed drafts)
      this.currentDraft = draft;
      const draftText = (draft.original_text || draft.text || draft.proofread_text || '').trim();
      console.log('[WorkspaceJS] Loading draft text into editor, length:', draftText.length);
      
      // Ensure editor panel is visible so content is shown
      this.showEditor();
      
      // Resolve editor element: use instance ref or fallback to DOM by id (fixes View Draft when ref not set yet)
      const editorEl = this.editorElement || document.getElementById('editor');
      
      // Set editor content - handle both TipTap and legacy editor
      if (window.USE_TIPTAP_EDITOR && typeof tiptapWorkspaceEditor !== 'undefined' && tiptapWorkspaceEditor) {
        console.log('[WorkspaceJS] Setting content in TipTap editor');
        tiptapWorkspaceEditor.commands.setContent(draftText || '');
      } else if (editorEl) {
        if (!this.editorElement) this.editorElement = editorEl;
        console.log('[WorkspaceJS] Setting content in legacy editor element');
        editorEl.textContent = draftText;
        const inputEvent = new Event('input', { bubbles: true });
        editorEl.dispatchEvent(inputEvent);
      } else if (this.editor && this.editor.editor) {
        console.log('[WorkspaceJS] Setting content in TamilEditor');
        this.editor.editor.textContent = draftText;
        const inputEvent = new Event('input', { bubbles: true });
        this.editor.editor.dispatchEvent(inputEvent);
      } else {
        console.error('[WorkspaceJS] No editor found to set content (editorEl:', !!editorEl, ')');
      }
      
      // Update word count after setting content
      this.updateWordCount();
      
      // Update title
      const titleInput = document.getElementById('draft-title');
      if (titleInput) {
        titleInput.value = draft.title || `Draft #${draft.id}`;
      }
      
      // Switch to editor view
      this.showEditor();
      
      // Clear URL hash to prevent reloading
      if (window.location.hash) {
        history.replaceState(null, null, ' ');
      }
      
      this.showNotification('Draft loaded successfully', 'success');
      
      // Trigger AI analysis ONLY if text meets minimum threshold (avoid errors/noise for short drafts)
      setTimeout(() => {
        try {
          const currentText = (this.getEditorText() || '').trim();
          const wc = countWords(currentText);
          const hasTamil = /[\u0B80-\u0BFF]/.test(currentText);
          const meetsMin = hasTamil && wc >= MIN_SUBMIT_WORDS;
          console.log('[WorkspaceJS] Draft loaded; auto-analyze gate:', { wc, len: currentText.length, hasTamil, meetsMin });
          if (!meetsMin) return;
          this.autoAnalyze({ silent: true });
        } catch (e) {
          // non-fatal
        }
      }, 500);
    } catch (error) {
      console.error('Error loading draft:', error);
      this.showNotification('Failed to load draft', 'error');
    }
  }

  // consumePendingDraft reads a demo→signup bridge payload from localStorage,
  // restores the text into the editor, and cleans up. Returns true when a
  // draft was restored so callers can skip the empty "welcome" flow.
  //
  // Payload shape (written by home-editor.js when the anonymous user clicks
  // "Save & sign up"):
  //   { text, html, savedAt, source }
  //
  // The key is single-use — we clear it after reading so a later signup or
  // login doesn't accidentally restore the same draft weeks later.
  consumePendingDraft() {
    try {
      const raw = localStorage.getItem('prooftamil_pending_draft');
      if (!raw) return false;
      localStorage.removeItem('prooftamil_pending_draft');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) return false;
      // Freshness gate: ignore anything older than 24 hours. A stale key
      // means the user bounced then came back much later — surprising them
      // with old text they've forgotten is worse than starting fresh.
      if (parsed.savedAt && (Date.now() - parsed.savedAt) > 24 * 60 * 60 * 1000) return false;
      // Restore into editor. Use html if provided so formatting survives;
      // fall back to text wrapped in a <p>.
      const content = parsed.html || ('<p>' + parsed.text.replace(/</g, '&lt;').replace(/\n/g, '</p><p>') + '</p>');
      this.setEditorContent(content);
      // Small toast so the user knows what happened.
      try {
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 z-50 rounded-lg bg-emerald-600 text-white px-4 py-3 shadow-lg';
        toast.textContent = '✓ Your draft from the homepage is here.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      } catch (_) {}
      console.log('[WorkspaceJS] Restored pending draft from', parsed.source || 'unknown source');
      return true;
    } catch (e) {
      console.warn('[WorkspaceJS] consumePendingDraft failed:', e);
      return false;
    }
  }

  // startPlanPillLifecycle owns the header plan-status pill. Runs on
  // workspace init: fetches usage/today, paints the pill in one of four
  // states (Pro active / Free with counter / Pro expiring soon / Payment
  // past due), then re-fetches on tab focus and every 60 seconds. That
  // covers the two scenarios where subscription state changes silently:
  // the user just paid in another tab, or their card was just declined.
  startPlanPillLifecycle() {
    if (this._planPillStarted) return;
    this._planPillStarted = true;
    this.refreshPlanPill();
    // Poll every 60s while the tab is visible. Cheap: single indexed count query.
    this._planPillInterval = setInterval(() => {
      if (!document.hidden) this.refreshPlanPill();
    }, 60_000);
    // Instant refresh when the user returns from another tab — this is
    // the moment they most likely just upgraded, so react fast.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refreshPlanPill();
    });
  }

  async refreshPlanPill() {
    try {
      const r = await this.apiFetch('/api/v1/billing/usage/today');
      if (!r.ok) return;
      const arr = await r.json();
      const usage = Array.isArray(arr) ? arr[0] : arr;
      if (!usage) return;
      this.usageToday = usage;
      this.paintPlanPill(usage);
    } catch (e) {
      console.warn('[PLAN PILL] fetch failed', e);
    }
  }

  paintPlanPill(usage) {
    const el = document.getElementById('plan-pill');
    const dot = document.getElementById('plan-pill-dot');
    const text = document.getElementById('plan-pill-text');
    if (!el || !dot || !text) return;

    // Decide state — order matters, first match wins.
    // 1. past_due (RED) beats everything: money problem, act now
    // 2. expires soon (AMBER): still Pro but about to lose it
    // 3. Pro active (GREEN)
    // 4. Free (GREY, with counter)
    let bg, border, color, dotColor, label, href = '/pricing';

    const rawStatus = (usage.raw_provider_status || '').toLowerCase();
    const isPastDue = rawStatus === 'past_due';

    // Compute days until expiry (only meaningful for Pro users)
    let daysUntilExpiry = null;
    if (usage.is_pro && usage.subscription_end_date) {
      const end = new Date(usage.subscription_end_date);
      const now = new Date();
      daysUntilExpiry = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    }

    if (isPastDue) {
      bg = '#FEE2E2'; border = '#FCA5A5'; color = '#991B1B'; dotColor = '#DC2626';
      label = 'Payment past due';
    } else if (usage.is_pro && daysUntilExpiry !== null && daysUntilExpiry <= 7) {
      bg = '#FEF3C7'; border = '#FCD34D'; color = '#92400E'; dotColor = '#D97706';
      label = daysUntilExpiry === 0
        ? 'Pro expires today'
        : `Pro expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`;
    } else if (usage.is_pro) {
      bg = '#DCFCE7'; border = '#86EFAC'; color = '#166534'; dotColor = '#16A34A';
      label = 'Pro';
      href = '/account'; // Pro users go to account instead of pricing
    } else {
      bg = '#F3F4F6'; border = '#E5E7EB'; color = '#374151'; dotColor = '#9CA3AF';
      label = `Free · ${usage.credits_used}/${usage.credits_limit} used today`;
    }

    el.style.background = bg;
    el.style.borderColor = border;
    el.style.color = color;
    dot.style.background = dotColor;
    text.textContent = label;
    el.href = href;
    el.classList.remove('hidden');
    el.classList.add('inline-flex');
  }

  // gatedCreateNewDraft is the New Draft entry point. It fetches the
  // caller's current-day quota before opening a fresh editor so a free
  // user who's already used their 20 credits sees an upgrade prompt
  // instead of an editor that will reject their submission. The gate
  // does NOT run on pending-draft restoration (signup bridge) because
  // that flow explicitly wants to bring the demo text over the fence.
  async gatedCreateNewDraft() {
    try {
      const r = await this.apiFetch('/api/v1/billing/usage/today');
      if (r.ok) {
        const arr = await r.json();
        const usage = Array.isArray(arr) ? arr[0] : arr;
        if (usage && usage.is_exhausted) {
          this.showQuotaExhaustedModal(usage);
          return;
        }
        // Not exhausted — cache for header pill display
        this.usageToday = usage;
      }
    } catch (e) {
      // Non-fatal: if the quota check itself fails (network hiccup, backend
      // deploy), fall through and let the editor open. The /submit endpoint
      // has its own enforcement so the user won't sneak past the real limit.
      console.warn('[QUOTA] usage/today check failed:', e);
    }
    this.createNewDraft();
  }

  // showQuotaExhaustedModal renders a lightweight upsell overlay when a
  // free user has used all 20 credits today. Reuses body-level DOM so it
  // works whether the user is on the empty state or the editor view. No
  // external CSS dependency — inline styles keep this self-contained.
  showQuotaExhaustedModal(usage) {
    // Bail if one is already open
    if (document.getElementById('quota-exhausted-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'quota-exhausted-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(15,17,25,0.55);display:flex;align-items:center;justify-content:center;padding:20px;font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;';
    overlay.innerHTML = `
      <div style="background:white;border-radius:14px;max-width:440px;width:100%;padding:28px 28px 24px;box-shadow:0 30px 60px -20px rgba(15,17,25,0.4);">
        <div style="width:44px;height:44px;border-radius:50%;background:#FEF3C7;color:#B45309;display:grid;place-items:center;margin-bottom:16px;font-weight:700;font-size:20px;">!</div>
        <h3 style="margin:0 0 8px;font-size:1.15rem;font-weight:600;color:#111827;">You've used your daily free credits</h3>
        <p style="margin:0 0 16px;font-size:0.9rem;line-height:1.55;color:#6B7280;">
          Free users get <strong>${usage.credits_limit} proofreads per day</strong>. Your credits reset at midnight UTC.
          Upgrade to Pro for unlimited proofreads, longer documents, and voice + OCR features.
        </p>
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 14px;font-size:0.82rem;color:#4B5563;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Used today</span><strong>${usage.credits_used} / ${usage.credits_limit}</strong></div>
          <div style="display:flex;justify-content:space-between;color:#9CA3AF;"><span>Resets on</span><span>${usage.usage_date} · 00:00 UTC</span></div>
        </div>
        <div style="display:flex;gap:10px;">
          <button id="quota-close-btn" type="button"
                  style="flex:1;padding:10px 14px;border:1px solid #D1D5DB;border-radius:8px;background:white;color:#374151;font-size:0.9rem;font-weight:500;cursor:pointer;">Close</button>
          <a href="/pricing"
             style="flex:1;padding:10px 14px;border:none;border-radius:8px;background:#4F46E5;color:white;font-size:0.9rem;font-weight:600;text-align:center;text-decoration:none;">Upgrade to Pro →</a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('quota-close-btn').addEventListener('click', () => overlay.remove());
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

    // If we arrived here from the homepage demo signup bridge, restore the
    // draft the anonymous user typed. Runs after showEditor so the editor
    // instance is fully mounted before setContent.
    this.consumePendingDraft();

    // Update URL
    window.history.pushState({}, '', '/workspace');
  }

  async deleteDraft(draftId) {
    if (!confirm('Are you sure you want to delete this draft? It will be moved to Archive for 45 days.')) {
      return;
    }

    try {
      const response = await this.apiFetch(`/api/v1/submissions/${draftId}`, {
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
// Migration flag: default is false, but DO NOT override if the page sets it explicitly.
// (Workspace behavior must work in both legacy + TipTap modes.)
if (typeof window.USE_TIPTAP_EDITOR === 'undefined') {
  window.USE_TIPTAP_EDITOR = false;
}

// Global TipTap editor instance
let tiptapWorkspaceEditor = null;

function getTipTapTokenAroundCaret() {
  if (!window.USE_TIPTAP_EDITOR || !tiptapWorkspaceEditor) return null;
  try {
    const { state } = tiptapWorkspaceEditor;
    const sel = state.selection;
    if (!sel || !sel.$from) return null;
    const $from = sel.$from;
    const parent = $from.parent;
    if (!parent || !parent.isTextblock) return null;

    const offset = $from.parentOffset || 0;
    const text = parent.textBetween(0, parent.content.size, '\n', '\n') || '';
    if (!text) return null;

    const before = text.slice(0, offset);
    const after = text.slice(offset);
    const left = (before.match(/([A-Za-z]+)$/) || [])[1] || '';
    const right = (after.match(/^([A-Za-z]+)/) || [])[1] || '';
    const token = left + right;
    if (!token) return null;

    const startOff = offset - left.length;
    const endOff = offset + right.length;
    const base = $from.start(); // absolute doc pos where this textblock starts
    return {
      token,
      fromPos: base + startOff,
      toPos: base + endOff,
    };
  } catch (e) {
    return null;
  }
}

function replaceTipTapTokenAtCaret(replacement, appendSpace = false) {
  if (!window.USE_TIPTAP_EDITOR || !tiptapWorkspaceEditor) return false;
  const info = getTipTapTokenAroundCaret();
  if (!info || !info.token) return false;
  const token = info.token;
  if (!/^[A-Za-z]+$/.test(token)) return false;
  const insert = replacement + (appendSpace ? ' ' : '');
  try {
    tiptapWorkspaceEditor.commands.insertContentAt({ from: info.fromPos, to: info.toPos }, insert);
    return true;
  } catch (e) {
    return false;
  }
}

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
        // Apply read-only mode (View Draft) to TipTap instance
        if (window.WORKSPACE_READONLY && typeof tiptapWorkspaceEditor.setEditable === 'function') {
          try {
            tiptapWorkspaceEditor.setEditable(false);
            console.log('[TipTap Migration] 🔒 TipTap setEditable(false) for read-only mode');
          } catch (_e) {
            // non-fatal
          }
        }
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
let workspaceControllerInstance = null;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    workspaceControllerInstance = new WorkspaceController();
    window.workspaceController = workspaceControllerInstance; // Expose globally for debugging
    console.log('[WorkspaceJS] ✅ WorkspaceController created');
    
    // CRITICAL: Call init() to set up event handlers and initialize the editor
    if (workspaceControllerInstance && typeof workspaceControllerInstance.init === 'function') {
      console.log('[WorkspaceJS] ✅ Calling init() method...');
      workspaceControllerInstance.init();
      console.log('[WorkspaceJS] ✅ WorkspaceController initialized and exposed as window.workspaceController');
    } else {
      console.error('[WorkspaceJS] ❌ init() method not found on WorkspaceController!');
    }
    
    // Phase 4: Switch to TipTap if flag is enabled
    setTimeout(() => switchWorkspaceEditor(), 500); // Wait a bit for TipTap to load
  });
} else {
  workspaceControllerInstance = new WorkspaceController();
  window.workspaceController = workspaceControllerInstance; // Expose globally for debugging
  console.log('[WorkspaceJS] ✅ WorkspaceController created');
  
  // CRITICAL: Call init() to set up event handlers and initialize the editor
  if (workspaceControllerInstance && typeof workspaceControllerInstance.init === 'function') {
    console.log('[WorkspaceJS] ✅ Calling init() method...');
    workspaceControllerInstance.init();
    console.log('[WorkspaceJS] ✅ WorkspaceController initialized and exposed as window.workspaceController');
  } else {
    console.error('[WorkspaceJS] ❌ init() method not found on WorkspaceController!');
  }
  
  // Phase 4: Switch to TipTap if flag is enabled
  setTimeout(() => switchWorkspaceEditor(), 500); // Wait a bit for TipTap to load
}

// Debug verification (runs after init)
setTimeout(function workspaceDebugVerification() {
  try {
    const wc = window.workspaceController;
    const editorEl = document.getElementById('editor');
    const hasTamilEditor = typeof TamilEditor !== 'undefined';
    const hasHandleEditorChange = wc && typeof wc.handleEditorChange === 'function';
    const hasAutoAnalyze = wc && typeof wc.autoAnalyze === 'function';
    const hasFetchRunnerSuggestions = wc && typeof wc.fetchRunnerSuggestions === 'function';
    console.log('[WorkspaceJS] 🔍 Debug verification:', {
      workspaceControllerInitialized: !!wc,
      editorElementExists: !!editorEl,
      tamilEditorClassAvailable: hasTamilEditor,
      handleEditorChange: hasHandleEditorChange,
      autoAnalyze: hasAutoAnalyze,
      fetchRunnerSuggestions: hasFetchRunnerSuggestions
    });
  } catch (e) {
    console.warn('[WorkspaceJS] Debug verification error:', e);
  }
}, 600);

// ── OCR Import: load text from handwriting-ocr-tool "Open in Editor" ────────
setTimeout(function ocrImportFromSession() {
  try {
    const ocrText = sessionStorage.getItem('ocr_import_text');
    if (!ocrText) return;
    sessionStorage.removeItem('ocr_import_text');
    const ocrFilename = sessionStorage.getItem('ocr_import_filename') || 'Handwriting';
    sessionStorage.removeItem('ocr_import_filename');

    // Convert plain text to HTML paragraphs
    const html = ocrText.split('\n').map(line => {
      const safe = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return safe.trim() ? `<p>${safe}</p>` : '<p><br></p>';
    }).join('');

    // Try TipTap first
    const tiptap = (function() {
      if (!window.USE_TIPTAP_EDITOR) return null;
      const g = window.tiptapWorkspaceEditor;
      return typeof g === 'function' ? g() : (g && g.commands ? g : null);
    })();

    if (tiptap) {
      tiptap.commands.setContent(html);
      tiptap.commands.focus('end');
      tiptap.emit && tiptap.emit('update', { editor: tiptap });
    } else {
      const editorEl = document.getElementById('editor');
      if (editorEl) {
        editorEl.innerHTML = html;
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        editorEl.focus();
      }
    }

    console.log('[WorkspaceJS] OCR import loaded:', ocrFilename, '—', ocrText.length, 'chars');

    // Brief toast notification
    const toast = document.createElement('div');
    toast.textContent = '✅ Handwriting OCR text loaded into editor';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#7c3aed;color:#fff;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:500;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.2)';
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3000);
  } catch (e) {
    console.warn('[WorkspaceJS] OCR import error:', e);
  }
}, 900);
