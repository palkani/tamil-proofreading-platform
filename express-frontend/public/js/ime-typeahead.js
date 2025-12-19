(() => {
  const DEBOUNCE_MS = 200;
  const MAX_ITEMS = 8;

  class IMETypeahead {
    constructor(adapter, opts = {}) {
      this.adapter = adapter;
      this.endpoint = opts.endpoint || '/api/v1/ime/suggest';
      this.mode = opts.mode || 'spoken';
      this.enabled = opts.enabled !== false;
      this.timer = null;
      this.abort = null;
      this.dropdown = null;
      this.activeIndex = 0;
      this.items = [];
    }

    log(...args) {
      console.log('[IME]', ...args);
    }

    onInput() {
      if (!this.enabled) return;
      const token = this.adapter.getSelectionToken();
      if (!token || token.length < 2 || !/^[A-Za-z]+$/.test(token)) {
        this.close();
        return;
      }
      if (this.timer) clearTimeout(this.timer);
      if (this.abort) this.abort.abort();
      this.timer = setTimeout(() => this.fetch(token), DEBOUNCE_MS);
    }

    async fetch(token) {
      this.log('request start', token);
      this.abort = new AbortController();
      try {
        const res = await fetch(`${this.endpoint}?q=${encodeURIComponent(token)}&limit=${MAX_ITEMS}&mode=${this.mode}`, {
          credentials: 'include',
          signal: this.abort.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const candidates = (data.candidates || []).filter(c => c.word);
        this.log('response ok', { count: candidates.length });
        if (candidates.length === 0) {
          this.renderDropdown([]);
          return;
        }
        this.renderDropdown(candidates.slice(0, MAX_ITEMS));
      } catch (err) {
        if (err.name === 'AbortError') {
          this.log('request aborted');
          return;
        }
        this.log('error', err);
        this.close();
      }
    }

    renderDropdown(items) {
      this.close();
      if (!items || items.length === 0) return;
      this.items = items;
      const rect = this.adapter.getCaretRect();
      if (!rect) return;

      const dropdown = document.createElement('div');
      dropdown.className = 'translit-dropdown fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-auto';
      dropdown.style.minWidth = '200px';
      const viewW = window.innerWidth || 360;
      let left = Math.max(8, Math.min(rect.left, viewW - 220));
      let top = rect.bottom + 6;
      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${top}px`;

      items.forEach((s, idx) => {
        const el = document.createElement('div');
        el.dataset.idx = idx;
        el.className = 'px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-purple-50 text-sm';
        el.innerHTML = `
          <span class="w-4 text-xs text-gray-400">${idx + 1}.</span>
          <span class="font-semibold text-gray-900 flex-1">${s.word}</span>
          <span class="text-xs text-gray-500">${Math.round((s.score || 0) * 100)}%</span>
        `;
        el.addEventListener('mouseenter', () => {
          this.activeIndex = idx;
          this.highlight(dropdown);
        });
        el.addEventListener('click', () => this.select(idx, items));
        dropdown.appendChild(el);
      });

      document.body.appendChild(dropdown);
      this.dropdown = dropdown;
      this.activeIndex = 0;
      this.highlight(dropdown);
    }

    highlight(dropdown) {
      if (!dropdown) return;
      dropdown.querySelectorAll('[data-idx]').forEach((el, i) => {
        el.classList.toggle('bg-purple-50', i === this.activeIndex);
      });
    }

    handleKey(e, items) {
      items = items || this.items || [];
      if (!this.dropdown) return false;
      if (e.key === 'ArrowDown') {
        this.activeIndex = (this.activeIndex + 1) % Math.max(items.length, 1);
        this.highlight(this.dropdown);
        return true;
      }
      if (e.key === 'ArrowUp') {
        this.activeIndex = (this.activeIndex - 1 + items.length) % Math.max(items.length, 1);
        this.highlight(this.dropdown);
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        this.select(this.activeIndex, items);
        return true;
      }
      if (e.key === 'Escape') {
        this.close();
        return true;
      }
      return false;
    }

    select(idx, items) {
      if (!items || !items[idx]) return;
      const word = items[idx].word;
      this.adapter.replaceToken(word + ' ');
      this.close();
    }

    close() {
      if (this.dropdown && this.dropdown.parentNode) {
        this.dropdown.parentNode.removeChild(this.dropdown);
      }
      this.dropdown = null;
      this.activeIndex = 0;
    }
  }

  window.IMETypeahead = IMETypeahead;
})();

