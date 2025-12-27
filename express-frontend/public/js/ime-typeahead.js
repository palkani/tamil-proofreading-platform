(() => {
  const DEBOUNCE_MS = 300;
  const MAX_ITEMS = 8;

  function getLastToken(text) {
    const match = (text || '').match(/(\S+)$/);
    return match ? match[1] : '';
  }

  function replaceLastToken(text, replacement) {
    return (text || '').replace(/(\S+)$/, replacement);
  }

  class IMETypeahead {
    constructor(adapter, opts = {}) {
      this.adapter = adapter;
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
        if (window.transliteratorReady) {
          await Promise.resolve(window.transliteratorReady);
        }
        if (typeof window.transliterateViaRunner !== 'function') {
          this.log('transliterateViaRunner missing');
          this.close();
          return;
        }
        const results = await window.transliterateViaRunner(token, this.mode, MAX_ITEMS, this.abort.signal);
        const candidates = (results || [])
          .map((item, idx) => {
            const word = typeof item === 'string'
              ? item
              : item.ta || item.word || item.text || item.suggestion || '';
            const score = (typeof item === 'object' && item) ? (item.score || item.confidence || 0) : 0;
            return {
              word,
              score,
              id: `ime-${idx}`,
            };
          })
          .filter(c => c.word);
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
        el.addEventListener('click', () => this.select(idx, items, false));
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
      if (e.key === 'Enter' || e.key === 'Tab') {
        this.select(this.activeIndex, items, false);
        e.preventDefault();
        return true;
      }
      if (e.key === ' ') {
        this.select(this.activeIndex, items, true);
        e.preventDefault();
        return true;
      }
      if (e.key === 'Escape') {
        this.close();
        return true;
      }
      return false;
    }

    insertSpace() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.collapse(false);
      const spaceNode = document.createTextNode(' ');
      range.insertNode(spaceNode);
      range.setStartAfter(spaceNode);
      range.setEndAfter(spaceNode);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    select(idx, items, appendSpace) {
      if (!items || !items[idx]) return;
      const word = items[idx].word;
      // Replace only the last token in the current text node
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const text = node.textContent || '';
        const nextText = replaceLastToken(text, word);
        node.textContent = nextText;
        const newOffset = nextText.length;
        const newRange = document.createRange();
        newRange.setStart(node, Math.min(newOffset, node.textContent.length));
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else if (typeof this.adapter.replaceToken === 'function') {
        this.adapter.replaceToken(word);
      }
      this.close();
      if (appendSpace) {
        this.insertSpace();
      }
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

