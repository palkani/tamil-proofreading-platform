// Transliteration Typeahead (shared for Home + Workspace editors)
// Provides debounced fetch, caching, abortable requests, caret-anchored dropdown, and keyboard selection.
// Assumes editorEl is a contenteditable area; safe no-op if selection context is missing.

(function () {
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const DEBOUNCE_MS = 300;
  const MAX_SUGGESTIONS = 8;
  const DEBUG = typeof window !== 'undefined' && !!window.__TRANS_LIT_DEBUG__;
  const IS_DEV = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;
  const HAS_RUNNER = typeof window !== 'undefined' && typeof window.transliterateViaRunner === 'function';

  class TranslitTypeahead {
    constructor(opts) {
      this.editorEl = opts.editorEl;
      this.getMode = opts.getMode || (() => 'spoken');
      this.cache = new Map();
      this.abortController = null;
      this.timer = null;
      this.dropdown = null;
      this.activeIndex = 0;
      this.latestToken = null;
      this.latestRange = null;
      this.boundInput = this.onInput.bind(this);
      this.boundKeydown = this.onKeydown.bind(this);
      this.boundClick = this.onClick.bind(this);
      this.attach();
    }

    attach() {
      if (!this.editorEl) return;
      this.editorEl.addEventListener('input', this.boundInput);
      this.editorEl.addEventListener('keydown', this.boundKeydown);
      document.addEventListener('click', this.boundClick);
    }

    destroy() {
      if (!this.editorEl) return;
      this.editorEl.removeEventListener('input', this.boundInput);
      this.editorEl.removeEventListener('keydown', this.boundKeydown);
      document.removeEventListener('click', this.boundClick);
      this.closeDropdown();
    }

    log(...args) {
      if (DEBUG) console.log('[TRANSLIT]', ...args);
    }

    onInput() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.handleTransliteration(), DEBOUNCE_MS);
    }

    onKeydown(e) {
      if (!this.dropdown) return;
      const items = Array.from(this.dropdown.querySelectorAll('[data-idx]'));
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % items.length;
        this.highlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + items.length) % items.length;
        this.highlight(items);
      } else if (['Enter', 'Tab', ' '].includes(e.key)) {
        e.preventDefault();
        this.select(items[this.activeIndex]);
      } else if (e.key === 'Escape') {
        this.closeDropdown();
      }
    }

    onClick(e) {
      if (this.dropdown && !this.dropdown.contains(e.target) && e.target !== this.editorEl) {
        this.closeDropdown();
      }
    }

    getCaretToken() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0).cloneRange();
      const preRange = range.cloneRange();
      preRange.selectNodeContents(this.editorEl);
      preRange.setEnd(range.endContainer, range.endOffset);
      const preText = preRange.toString();
      const match = preText.match(/[A-Za-z]+$/);
      if (!match || match[0].length < 2) return null;
      const token = match[0];
      this.latestRange = range;
      return { token, preText };
    }

    async handleTransliteration() {
      const tokenInfo = this.getCaretToken();
      if (!tokenInfo) {
        this.closeDropdown();
        return;
      }
      const { token } = tokenInfo;
      if (this.latestToken === token) return;
      this.latestToken = token;

      // Cache check
      const cached = this.cache.get(token);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        this.log('cache hit', token, cached.suggestions.length);
        this.renderDropdown(cached.suggestions);
        return;
      }

      // Abort previous
      if (this.abortController) this.abortController.abort();
      this.abortController = new AbortController();

      const mode = this.getMode() || 'spoken';
      if (!HAS_RUNNER || typeof window.transliterateViaRunner !== 'function') {
        this.log('runner function missing');
        this.closeDropdown();
        return;
      }
      if (IS_DEV) {
        console.debug("[TRANSLITERATOR] CALLING RUNNER", { text: token, mode, limit: MAX_SUGGESTIONS });
      }

      try {
        const data = await window.transliterateViaRunner(token, mode, MAX_SUGGESTIONS, this.abortController.signal);
        const suggestions = this.normalizeSuggestions(data);
        this.cache.set(token, { suggestions, ts: Date.now() });
        this.log('response', { status: 'ok', count: suggestions.length });
        if (!suggestions.length) {
          this.closeDropdown();
          return;
        }
        this.renderDropdown(suggestions);
      } catch (err) {
        if (err.name === 'AbortError') return;
        this.log('fetch error', err);
        this.closeDropdown();
      }
    }

    normalizeSuggestions(data) {
      const arr =
        Array.isArray(data)
          ? data
          : data?.suggestions ||
            data?.data?.suggestions ||
            data?.result?.suggestions ||
            [];
      return (arr || []).map((item, idx) => {
        if (typeof item === 'string') {
          return { word: item, score: 1, label: 'Recommended', usage: 'Both', id: `s-${idx}` };
        }
        return {
          word: item.word || item.ta || item.text || item.suggestion || '',
          score: item.score || item.confidence || 0,
          label: item.label || 'Recommended',
          usage: item.usage || item.mode || 'Both',
          reason: item.reason || item.description || '',
          id: `s-${idx}`,
        };
      }).filter(s => s.word);
    }

    renderDropdown(suggestions) {
      this.closeDropdown();
      const rect = this.getCaretRect();
      if (!rect) return;

      const dropdown = document.createElement('div');
      dropdown.className =
        'translit-dropdown fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-auto';
      dropdown.style.minWidth = '180px';
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;

      if (!suggestions.length) {
        const empty = document.createElement('div');
        empty.className = 'px-3 py-2 text-sm text-gray-500';
        empty.textContent = 'No suggestions found';
        dropdown.appendChild(empty);
      }

      suggestions.slice(0, MAX_SUGGESTIONS).forEach((sugg, idx) => {
        const item = document.createElement('div');
        item.dataset.idx = idx;
        item.className =
          'px-3 py-2 flex flex-col cursor-pointer hover:bg-purple-50 text-sm';
        item.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="font-semibold text-gray-900">${sugg.word}</span>
            <span class="text-xs text-gray-500">${Math.round((sugg.score || 0) * 100)}%</span>
          </div>
          <div class="text-xs text-gray-500 flex gap-2">
            <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">${sugg.label || 'Suggested'}</span>
            <span class="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">${sugg.usage || 'Both'}</span>
          </div>
          ${sugg.reason ? `<div class="text-xs text-gray-500 mt-1">${sugg.reason}</div>` : ''}
        `;
        item.addEventListener('mouseenter', () => {
          this.activeIndex = idx;
          this.highlight(Array.from(dropdown.querySelectorAll('[data-idx]')));
        });
        item.addEventListener('click', () => this.select(item));
        dropdown.appendChild(item);
      });

      document.body.appendChild(dropdown);
      this.dropdown = dropdown;
      this.activeIndex = 0;
      this.highlight(Array.from(dropdown.querySelectorAll('[data-idx]')));
    }

    highlight(items) {
      items.forEach((el, i) => {
        el.classList.toggle('bg-purple-50', i === this.activeIndex);
      });
    }

    select(itemEl) {
      if (!itemEl) return;
      const ta = itemEl.querySelector('.font-semibold')?.textContent || '';
      if (!ta) return;
      this.applyReplacement(ta + ' ');
      this.closeDropdown();
    }

    applyReplacement(text) {
      const sel = window.getSelection();
      if (!sel || !this.latestRange) return;
      try {
        const range = this.latestRange.cloneRange();
        const tokenInfo = this.getCaretToken();
        if (!tokenInfo) return;
        const { token } = tokenInfo;
        range.setStart(range.endContainer, range.endOffset - token.length);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) {
        this.log('applyReplacement failed', err);
      }
    }

    getCaretRect() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rects = range.getClientRects();
      if (rects.length === 0) {
        const dummy = document.createElement('span');
        dummy.appendChild(document.createTextNode('\u200b'));
        range.insertNode(dummy);
        const rect = dummy.getBoundingClientRect();
        dummy.parentNode.removeChild(dummy);
        return rect;
      }
      return rects[0];
    }

    closeDropdown() {
      if (this.dropdown && this.dropdown.parentNode) {
        this.dropdown.parentNode.removeChild(this.dropdown);
      }
      this.dropdown = null;
      this.activeIndex = 0;
    }
  }

  window.TranslitTypeahead = TranslitTypeahead;
})();

