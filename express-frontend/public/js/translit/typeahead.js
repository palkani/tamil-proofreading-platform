// Google-style transliteration typeahead shared module
// Feature flag: enable only when window.TRANS_SUGGEST_V2 is truthy.
(function () {
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
  const DEBOUNCE_MS = 300;
  const MAX = 8;
  const DEBUG = typeof window !== 'undefined' && !!window.__TRANS_LIT_DEBUG__;
  const IS_DEV = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;
  const HAS_RUNNER = typeof window !== 'undefined' && typeof window.transliterateViaRunner === 'function';

  class TransliterationTypeahead {
    constructor(adapter, opts = {}) {
      this.adapter = adapter;
      this.getMode = opts.getMode || (() => 'spoken');
      this.cache = new Map();
      this.timer = null;
      this.abortController = null;
      this.dropdown = null;
      this.activeIndex = 0;
      this.latestToken = null;

      this.handleInput = this.handleInput.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleBlur = this.handleBlur.bind(this);
      this.attach();
    }

    log(...args) {
      if (DEBUG) console.log('[TRANS-SUGGEST]', ...args);
    }

    attach() {
      this.adapter.onChange(this.handleInput);
      this.adapter.onKeyDown(this.handleKeydown);
      this.adapter.onBlur(this.handleBlur);
      document.addEventListener('click', (e) => {
        if (this.dropdown && !this.dropdown.contains(e.target)) {
          this.closeDropdown();
        }
      });
    }

    handleBlur() {
      this.closeDropdown();
    }

    handleKeydown(e) {
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

    handleInput() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.maybeSuggest(), DEBOUNCE_MS);
    }

    getTokenInfo() {
      const preText = this.adapter.getTextBeforeCaret() || '';
      const match = preText.match(/[A-Za-z]+$/);
      if (!match || match[0].length < 2) return null;
      const token = match[0];
      return {
        token,
        start: preText.length - token.length,
        end: preText.length,
      };
    }

    async maybeSuggest() {
      const info = this.getTokenInfo();
      if (!info) {
        this.closeDropdown();
        return;
      }
      if (this.latestToken === info.token) return;
      this.latestToken = info.token;

      // cache
      const cached = this.cache.get(info.token);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        this.log('cache hit', info.token, cached.items.length);
        this.renderDropdown(cached.items, info);
        return;
      }

      // abort inflight
      if (this.abortController) this.abortController.abort();
      this.abortController = new AbortController();
      const mode = this.getMode() || 'spoken';
      if (!HAS_RUNNER || typeof window.transliterateViaRunner !== 'function') {
        this.log('runner function missing');
        this.closeDropdown();
        return;
      }
      if (IS_DEV) {
        console.debug("[TRANSLITERATOR] CALLING RUNNER", { text: info.token, mode, limit: MAX });
      }

      try {
        this.log('request', { token: info.token });
        const data = await window.transliterateViaRunner(info.token, mode, MAX, this.abortController.signal);
        const items = this.normalize(data);
        this.cache.set(info.token, { items, ts: Date.now() });
        this.log('response', { status: 'ok', count: items.length });
        if (!items.length) {
          this.closeDropdown();
          return;
        }
        this.renderDropdown(items, info);
      } catch (err) {
        if (err.name === 'AbortError') return;
        this.log('fetch error', err);
        this.closeDropdown();
      }
    }

    normalize(data) {
      const arr = Array.isArray(data)
        ? data
        : data?.suggestions ||
          data?.data?.suggestions ||
          data?.result?.suggestions ||
          [];
      return (arr || []).map((s, i) => {
        if (typeof s === 'string') {
          return { word: s, score: 1, label: 'Recommended', usage: 'Both', reason: '', id: `s-${i}` };
        }
        return {
          word: s.word || s.ta || s.text || s.suggestion || '',
          score: s.score || s.confidence || 0,
          label: s.label || 'Suggested',
          usage: s.usage || s.mode || 'Both',
          reason: s.reason || s.description || '',
          id: `s-${i}`,
        };
      }).filter(s => s.word);
    }

    renderDropdown(items, info) {
      this.closeDropdown();
      const rect = this.adapter.getCaretRect() || this.adapter.getFallbackRect();
      if (!rect) return;

      const dropdown = document.createElement('div');
      dropdown.className = 'translit-dropdown fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-auto';
      dropdown.style.minWidth = '200px';
      const viewW = window.innerWidth || 360;
      const viewH = window.innerHeight || 640;
      const left = Math.max(8, Math.min(rect.left, viewW - 220));
      let top = rect.bottom + 6;
      if (top > viewH - 40) {
        top = Math.max(8, rect.top - 206);
      }
      if (top < 0 || top > viewH - 20) {
        const fb = this.adapter.getFallbackRect && this.adapter.getFallbackRect();
        top = Math.min(viewH - 220, Math.max(8, fb?.top || 40));
      }
      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${top}px`;

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'px-3 py-2 text-sm text-gray-500';
        empty.textContent = 'No suggestions found';
        dropdown.appendChild(empty);
      }

      items.slice(0, MAX).forEach((s, idx) => {
        const el = document.createElement('div');
        el.dataset.idx = idx;
        el.className = 'px-3 py-2 flex flex-col gap-1 cursor-pointer hover:bg-purple-50 text-sm';
        el.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="font-semibold text-gray-900">${s.word}</span>
            <span class="text-xs text-gray-500">${Math.round((s.score || 0) * 100)}%</span>
          </div>
          <div class="text-xs text-gray-500 flex gap-2">
            <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">${s.label || 'Suggested'}</span>
            <span class="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">${s.usage || 'Both'}</span>
          </div>
          ${s.reason ? `<div class="text-xs text-gray-500">${s.reason}</div>` : ''}
        `;
        el.addEventListener('mouseenter', () => {
          this.activeIndex = idx;
          this.highlight(Array.from(dropdown.querySelectorAll('[data-idx]')));
        });
        el.addEventListener('click', () => this.select(el, info));
        dropdown.appendChild(el);
      });

      document.body.appendChild(dropdown);
      this.dropdown = dropdown;
      this.activeIndex = 0;
      this.highlight(Array.from(dropdown.querySelectorAll('[data-idx]')));
    }

    highlight(items) {
      items.forEach((el, i) => el.classList.toggle('bg-purple-50', i === this.activeIndex));
    }

    select(el, info) {
      if (!el) return;
      const ta = el.querySelector('.font-semibold')?.textContent || '';
      if (!ta) return;
      this.adapter.replaceRange(info.start, info.end, ta + ' ');
      this.closeDropdown();
    }

    closeDropdown() {
      if (this.dropdown && this.dropdown.parentNode) {
        this.dropdown.parentNode.removeChild(this.dropdown);
      }
      this.dropdown = null;
      this.activeIndex = 0;
    }
  }

  window.TransliterationTypeahead = TransliterationTypeahead;
})();

