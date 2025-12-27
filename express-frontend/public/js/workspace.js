// Main Workspace Controller

function getLastToken(text) {
  const match = (text || '').match(/(\S+)$/);
  return match ? match[1] : '';
}

function replaceLastToken(text, replacement) {
  return (text || '').replace(/(\S+)$/, replacement);
}

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
    console.log('IME fetchRunnerSuggestions CALLED');
    const { q = '', limit = 8, mode = 'spoken' } = params || {};
    const qs = new URLSearchParams({ q, limit, mode, _ts: Date.now(), _r: Math.random().toString(36).slice(2) }).toString();
    const url = `/api/transliterate/suggest?${qs}`;
    if (this.DEBUG_IME) console.debug('IME GET:', url);

    try {
      // Cancel any in-flight request
      if (this.translitAbort) this.translitAbort.abort();
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
        } else if (this.updateTranslitSuggestions) {
          this.updateTranslitSuggestions(this.lastRunnerSuggestions);
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
      const suggestions = (raw || [])
        .map((s) => ({
          text: s.ta || s.word || s.text || '',
          score: typeof s.score === 'number' ? s.score : 0,
        }))
        .filter((s) => s.text);
      this.lastRunnerSuggestions = suggestions;
      this.currentSuggestions = suggestions;
      this.imeActive = true;
      this.editorMode = EditorMode.IME_TYPING;

      if (this.renderTranslitSuggestions) {
        this.renderTranslitSuggestions(q, suggestions);
      } else if (this.updateTranslitSuggestions) {
        this.updateTranslitSuggestions(suggestions);
      }
      return suggestions;
    } catch (err) {
      console.error('[Translit] fetchRunnerSuggestions failed', err);
      return [];
    }
  }

  init() {
    // Initialize editor
    const editorElement = document.getElementById('editor');
    if (editorElement) {
      this.editor = new TamilEditor(editorElement);
      this.editor.onChange = () => this.handleEditorChange();
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

  handleEditorChange() {
    this.updateWordCount();
    this.scheduleSave();
    const text = this.editor.getPlainText() || '';
    const lastToken = getLastToken(text);
    const isLatin = /^[A-Za-z]+$/.test(lastToken);
    if (this.DEBUG_IME) console.debug('[IME] onChange', { lastToken, imeActive: this.imeActive, editorMode: this.editorMode });

    // IME activation
    if (lastToken && isLatin && lastToken.length >= 2) {
      this.imeActive = true;
      this.editorMode = EditorMode.IME_TYPING;
      this.fetchRunnerSuggestions({ q: lastToken, limit: 8, mode: 'spoken' });
      return; // DO NOT schedule submit while IME is active
    }

    // IME deactivate when token not latin / too short
    if (!isLatin || lastToken.length === 0) {
      this.imeActive = false;
      this.editorMode = EditorMode.IDLE;
      this.clearTranslitSuggestions();
    }

    // Submit scheduling only when IME not active
    this.scheduleSubmitThrottled(text);
  }

  getCurrentWord() {
    const text = this.editor.getPlainText();
    const parts = text.split(/\s+/);
    const last = parts[parts.length - 1] || '';
    return last.trim();
  }

  renderTranslitSuggestions(word, suggestions) {
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
    box.style.position = 'absolute';
    box.style.zIndex = 99999;
    box.style.background = 'white';
    box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.08)';

    if (!suggestions.length) {
      const li = document.createElement('li');
      li.className = 'flex px-2 py-1 text-sm text-gray-500';
      li.textContent = 'No suggestions found';
      list.appendChild(li);
      this.translitDropdownOpen = false;
      return;
    }

    this.translitDropdownOpen = true;
    suggestions.slice(0, 5).forEach((sugg) => {
      const li = document.createElement('li');
      const label = sugg.label || 'Recommended';
      const usage = sugg.usage || 'Both';
      const reason = sugg.reason || '';
      li.className = 'flex flex-col px-2 py-1 rounded hover:bg-purple-50 cursor-pointer';
      li.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-semibold text-purple-700">${sugg.text || sugg.word}</span>
          <span class="text-xs text-gray-500">${Math.round((sugg.score || 0) * 100)}%</span>
        </div>
        <div class="text-xs text-gray-600 flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">${label}</span>
          <span class="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">${usage}</span>
        </div>
        ${reason ? `<div class="text-xs text-gray-500 mt-1">${reason}</div>` : ''}
      `;
      li.addEventListener('click', () => {
        this.replaceLastWord(word, sugg.text || sugg.word);
        this.clearTranslitSuggestions();
        this.imeActive = false;
        this.editorMode = EditorMode.IDLE;
      });
      list.appendChild(li);
    });
  }

  clearTranslitSuggestions() {
    const box = document.getElementById('translit-suggest-box');
    const status = document.getElementById('translit-suggest-status');
    const list = document.getElementById('translit-suggest-list');
    if (!box || !status || !list) return;
    status.textContent = 'Type English to see Tamil suggestions…';
    list.innerHTML = '';
    box.classList.add('hidden');
    this.translitDropdownOpen = false;
    this.currentSuggestions = [];
  }

  replaceLastWord(word, replacement) {
    if (!word || !replacement) return;
    const text = this.editor.getPlainText();
    const newText = replaceLastToken(text, replacement);
    this.editor.setText(newText);
    const range = document.createRange();
    range.selectNodeContents(this.editor.editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
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

  updateTranslitSuggestions() {
    const word = this.getCurrentWord();
    if (!word || word.length < 2 || !/^[a-zA-Z]+$/.test(word)) {
      this.clearTranslitSuggestions();
      return;
    }

    if (this.translitCache.has(word)) {
      this.renderTranslitSuggestions(word, this.translitCache.get(word));
      return;
    }

    if (this.translitTimer) {
      clearTimeout(this.translitTimer);
    }
    if (this.translitAbort) {
      this.translitAbort.abort();
    }

    this.translitTimer = setTimeout(async () => {
      this.translitAbort = new AbortController();
      try {
        const mode = this.getMode();
        const suggestions = await this.fetchRunnerSuggestions(word, mode, 8, this.translitAbort.signal);
        this.translitCache.set(word, suggestions);
        this.renderTranslitSuggestions(word, suggestions);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[Translit] Suggest error:', err);
      }
    }, 300);
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
    const text = (this.editor.getPlainText() || '').trim();
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
    const text = this.editor.getPlainText().trim();
    
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
              const currentText = this.editor.getPlainText();
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
    const text = this.editor.getPlainText().trim();
    
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
    const text = this.editor.getPlainText();
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

    const text = this.editor.getPlainText().trim();
    
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
      const html = this.editor.getHTML();
      
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

    const text = this.editor.getPlainText();
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
          const currentText = this.editor.getPlainText();
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
        const plain = this.editor.getPlainText();
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
    const text = this.editor.getPlainText();
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

// Initialize workspace when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WorkspaceController();
  });
} else {
  new WorkspaceController();
}
