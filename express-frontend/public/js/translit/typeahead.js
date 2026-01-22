// Google-style transliteration typeahead shared module
// Feature flag: enable only when window.TRANS_SUGGEST_V2 is truthy.
(function () {
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
  const DEBOUNCE_MS = 300;
  // UI policy: top 5 suggestions (ranked)
  const MAX = 5;
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
        // Don't interfere with navigation links
        if (e.target.closest('a[href]')) {
          return;
        }
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
      if (IS_DEV) {
        console.debug("[TRANSLITERATOR] CALLING RUNNER", { text: info.token, mode, limit: MAX });
      }

      try {
        this.log('request', { token: info.token });
        if (window.transliteratorReady) {
          await Promise.resolve(window.transliteratorReady);
        }
        if (!HAS_RUNNER || typeof window.transliterateViaRunner !== 'function') {
          this.log('runner function missing');
          this.closeDropdown();
          return;
        }
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

      // Normalize + dedupe + drop empty words (prevents blank rows / repeated junk)
      const cleaned = (() => {
        const seen = new Set();
        const out = [];
        for (const it of (items || [])) {
          const w = String(it?.word || '').trim();
          if (!w) continue;
          const key = w.normalize ? w.normalize('NFC') : w;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ ...it, word: w });
          if (out.length >= MAX) break;
        }
        return out;
      })();
      if (!cleaned.length) {
        this.closeDropdown();
        return;
      }

      const dropdown = document.createElement('div');
      dropdown.className = 'translit-dropdown fixed bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden';
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

      // Header (with close button)
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between px-4 py-3 border-b border-gray-100';
      header.innerHTML = `
        <div class="text-sm font-semibold text-gray-900">Suggestions</div>
        <button type="button" class="p-1 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close suggestions">×</button>
      `;
      header.querySelector('button')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeDropdown();
      });
      dropdown.appendChild(header);

      cleaned.forEach((s, idx) => {
        const el = document.createElement('div');
        el.dataset.idx = idx;
        el.className = 'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-purple-50 text-sm';
        el.innerHTML = `
          <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${idx === 0 ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'}">${idx + 1}</span>
          <span class="text-base font-semibold text-gray-900 flex-1">${s.word}</span>
        `;
        el.addEventListener('mouseenter', () => {
          this.activeIndex = idx;
          this.highlight(Array.from(dropdown.querySelectorAll('[data-idx]')));
        });
        el.addEventListener('pointerdown', (e) => {
          // Prevent caret changes before we replace
          e.preventDefault();
          e.stopPropagation();
        });
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.select(el, info);
        });
        dropdown.appendChild(el);
      });

      // Footer hint
      const footer = document.createElement('div');
      footer.className = 'px-4 py-3 text-xs text-gray-600 border-t bg-gray-50';
      footer.innerHTML = 'Press <kbd class="mx-1 px-2 py-0.5 rounded-md border border-gray-300 bg-white text-gray-700 font-semibold">Space</kbd> to select first option';
      dropdown.appendChild(footer);

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

      // Anonymous-safe feedback (logged-in only): helps improve ranking over time.
      // We intentionally do NOT send full text, only the token + chosen word + mode.
      try {
        const token = (info && info.token) ? String(info.token) : '';
        if (!token) return;

        const accessToken = (() => {
          try { return localStorage.getItem('access_token') || ''; } catch (_e) { return ''; }
        })();
        if (!accessToken) return;

        const isExpired = (t) => {
          try {
            const parts = String(t || '').split('.');
            if (parts.length !== 3) return true;
            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const payload = JSON.parse(atob(base64));
            const now = Math.floor(Date.now() / 1000);
            return payload.exp ? payload.exp < (now - 60) : true;
          } catch (_e) {
            return true;
          }
        };
        if (isExpired(accessToken)) return;

        const mode = (this.getMode && this.getMode()) ? String(this.getMode()) : 'spoken';
        fetch('/api/v1/events/activity', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            event_type: 'suggestion_accept',
            metadata: {
              kind: 'translit',
              token: token.toLowerCase(),
              chosen: String(ta || ''),
              mode,
              path: (typeof window !== 'undefined' && window.location) ? window.location.pathname : '',
            },
          }),
          keepalive: true,
        }).catch(() => {});
      } catch (_e) {
        // non-fatal
      }
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

