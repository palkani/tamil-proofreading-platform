/**
 * Tamil Auto-Suggestions V3
 * Fast, standalone transliteration typeahead for Home & Workspace editors.
 *
 * How it works:
 *  1. Listens for typing in any editor element (capture phase → fires first)
 *  2. Extracts the trailing English token before the caret (≥ 2 chars)
 *  3. Shows INSTANT suggestions from the local transliteration.js engine (0 ms)
 *  4. Simultaneously fetches /api/v1/suggest for better backend results
 *  5. Merges & de-dupes; re-renders if backend adds new words
 *  6. Space / Enter → accept top suggestion
 *     Arrow keys  → navigate list
 *     Escape      → close
 *     Click       → select clicked item
 *  7. Sets window.__TRANSLIT_V3_LOADED so old systems skip their pipelines.
 */
(function () {
  'use strict';

  if (window.__TRANSLIT_V3_LOADED) return;   // guard: only one instance
  window.__TRANSLIT_V3_LOADED = true;

  // ── Config ─────────────────────────────────────────────────────────────
  const MIN_TOKEN = 2;       // chars needed before suggestions appear
  const MAX_SHOW  = 8;       // max items in dropdown
  const DEBOUNCE  = 80;      // ms after last keystroke → show local suggestions

  // ── State ──────────────────────────────────────────────────────────────
  let _dd       = null;   // dropdown element (null = closed)
  let _words    = [];     // words currently shown
  let _idx      = 0;      // highlighted index
  let _token    = null;   // current English token
  let _tStart   = 0;      // token's absolute char start in editor text
  let _tEnd     = 0;      // token's absolute char end
  let _editor   = null;   // active editor element
  let _timer    = null;   // debounce timer
  let _abort    = null;   // AbortController for in-flight backend fetch
  const _cache  = new Map(); // simple memo: key → string[]

  // ── Editor detection ───────────────────────────────────────────────────
  const EDITOR_IDS = ['editor', 'home-editor', 'tiptap-workspace-editor'];

  function findEditor(target) {
    for (const id of EDITOR_IDS) {
      const el = document.getElementById(id);
      if (el && (el === target || el.contains(target))) return el;
    }
    return null;
  }

  // ── Caret / text helpers ───────────────────────────────────────────────
  function textBeforeCaret(root) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    try {
      const r = sel.getRangeAt(0);
      if (!root.contains(r.startContainer)) return '';
      const pre = document.createRange();
      pre.selectNodeContents(root);
      pre.setEnd(r.endContainer, r.endOffset);
      return pre.toString();
    } catch (_) { return ''; }
  }

  function caretRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
      const r = sel.getRangeAt(0).cloneRange();
      r.collapse(true);
      const rects = r.getClientRects();
      if (rects.length) return rects[0];
    } catch (_) {}
    if (_editor) {
      const r = _editor.getBoundingClientRect();
      return { top: r.top + 24, bottom: r.top + 24, left: r.left + 8 };
    }
    return null;
  }

  function parseToken(preText) {
    const m = preText.match(/[A-Za-z]{2,}$/);
    if (!m) return null;
    return { token: m[0].toLowerCase(), start: preText.length - m[0].length, end: preText.length };
  }

  // ── Suggestions ────────────────────────────────────────────────────────
  function localSuggestions(token) {
    const k = 'L:' + token;
    if (_cache.has(k)) return _cache.get(k);
    let words = [];
    if (typeof window.getTamilSuggestionsFromEnglish === 'function') {
      try {
        // Pass the global dictionary so prefix-matching in steps 5/6 works correctly
        const dict = Array.isArray(window.tamilDictionary) ? window.tamilDictionary : [];
        words = window.getTamilSuggestionsFromEnglish(token, dict) || [];
      } catch (_) {}
    } else if (typeof window.transliterateToTamil === 'function') {
      try { const t = window.transliterateToTamil(token); if (t && t !== token) words = [t]; } catch (_) {}
    }
    // For longer English tokens, require longer Tamil results (avoid phoneme fragments)
    const minTamilChars = token.length >= 5 ? 4 : token.length >= 4 ? 3 : token.length >= 3 ? 2 : 1;
    const out = [...new Set(words.filter(w => w && [...w].length >= minTamilChars))].slice(0, MAX_SHOW);
    _cache.set(k, out);
    return out;
  }

  async function backendSuggestions(token, signal) {
    const k = 'B:' + token;
    if (_cache.has(k)) return _cache.get(k);
    try {
      const res = await fetch(
        `/api/v1/suggest?q=${encodeURIComponent(token)}&limit=${MAX_SHOW}&mode=spoken`,
        { signal, cache: 'default', headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return [];
      const d = await res.json();
      // For longer English tokens, require longer Tamil results (avoid phoneme fragments)
      const minTamilChars = token.length >= 5 ? 4 : token.length >= 4 ? 3 : token.length >= 3 ? 2 : 1;
      const words = (d.suggestions || [])
        .map(s => typeof s === 'string' ? s : (s.word || s.text || s.ta || ''))
        .filter(w => w && [...w].length >= minTamilChars);
      if (words.length) _cache.set(k, words.slice(0, MAX_SHOW));
      return words.slice(0, MAX_SHOW);
    } catch (_) { return []; }
  }

  /**
   * Score-aware merge: backend rank is used to re-order local results.
   * The backend (language-model powered) knows which word is most relevant —
   * if it ranks a word higher than the local heuristic did, we honour that.
   * Words only in local are kept; words only in backend fill remaining slots.
   *
   * @param {string[]} local        - locally-generated suggestions
   * @param {string[]} backend      - backend-returned suggestions
   * @param {string}   localTranslit - direct transliteration of the typed token
   *                                  used to filter phonetically inconsistent
   *                                  backend-only words (e.g. "உயை" for "uyi")
   */
  function mergeSuggestions(local, backend, localTranslit) {
    // BACKEND-FIRST. The backend is lexicon-frequency-ranked, so its order IS the
    // answer — position 0 is the most common real word for this input. Emit backend
    // words in backend order, then fill any remaining slots with local-only guesses.
    //
    // This replaces the old "local-first" merge, which emitted the client-side
    // transliteration guesses first and only appended backend-only words at the end
    // behind a phonetic prefix-gate. That buried — and often filtered out entirely —
    // the correct top word: e.g. "ennam" → எண்ணம் is backend #1, but the local engine
    // guessed எந்நம், so எண்ணம் failed the prefix-gate and never showed.
    //
    // localTranslit is kept for signature compatibility; no longer used to gate
    // backend results (the backend already returns phonetically-relevant words).
    void localTranslit;
    const norm = (w) => ((w || '').normalize ? w.normalize('NFC') : (w || ''));
    const seen = new Set();
    const out = [];

    // 1. Backend words, in the backend's own (frequency) order.
    for (const w of backend) {
      const k = norm(w);
      if (k && !seen.has(k)) { seen.add(k); out.push(w); }
      if (out.length >= MAX_SHOW) break;
    }
    // 2. Fill remaining slots with local-only guesses the backend didn't return
    //    (covers rare inputs the lexicon has no entry for).
    for (const w of local) {
      if (out.length >= MAX_SHOW) break;
      const k = norm(w);
      if (k && !seen.has(k)) { seen.add(k); out.push(w); }
    }
    return out;
  }

  // ── Dropdown ───────────────────────────────────────────────────────────
  function closeDropdown() {
    if (_dd?.parentNode) _dd.parentNode.removeChild(_dd);
    _dd = null; _words = []; _idx = 0;
  }

  function openDropdown(words) {
    closeDropdown();
    if (!words.length) return;
    const rect = caretRect();
    if (!rect) return;

    const vw = window.innerWidth, vh = window.innerHeight;
    let top  = rect.bottom + 6;
    let left = rect.left;
    if (top + 300 > vh) top = Math.max(4, rect.top - 300);
    left = Math.max(8, Math.min(left, vw - 210));

    const dd = document.createElement('div');
    dd.id = 'ts-v3';
    dd.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'background:#ffffff',
      'border:1.5px solid #ede9fe',
      'border-radius:14px',
      'box-shadow:0 12px 40px rgba(124,58,237,0.18),0 4px 14px rgba(0,0,0,0.10)',
      'min-width:190px',
      'max-width:340px',
      'overflow:hidden',
      "font-family:'Noto Sans Tamil','Latha','Vijaya',system-ui,sans-serif",
      'pointer-events:auto',
      'user-select:none',
      `left:${left}px`,
      `top:${top}px`,
    ].join(';');

    // Header
    const hdr = document.createElement('div');
    hdr.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:8px 13px 7px', 'border-bottom:1px solid #f5f3ff',
      'background:linear-gradient(90deg,#faf5ff,#f5f3ff)',
    ].join(';');
    hdr.innerHTML = [
      '<span style="font-size:11.5px;font-weight:700;color:#7c3aed;letter-spacing:.3px;">✨ Tamil Suggestions</span>',
      '<span style="font-size:10px;color:#a78bfa;letter-spacing:.2px;">Space · Enter to select</span>',
    ].join('');
    dd.appendChild(hdr);

    // Items
    words.forEach((word, i) => {
      const row = document.createElement('div');
      row.dataset.i = String(i);
      row.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:9px 14px', 'cursor:pointer',
        'border-bottom:1px solid #faf5ff',
        `background:${i === 0 ? '#f5f3ff' : 'transparent'}`,
      ].join(';');

      const badge = document.createElement('span');
      badge.style.cssText = [
        'flex-shrink:0', 'width:22px', 'height:22px', 'border-radius:50%',
        'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:11px', 'font-weight:700', 'transition:background .12s',
        `background:${i === 0 ? '#7c3aed' : '#f3f4f6'}`,
        `color:${i === 0 ? '#fff' : '#9ca3af'}`,
      ].join(';');
      badge.textContent = String(i + 1);

      const txt = document.createElement('span');
      txt.style.cssText = [
        'font-size:17px', 'color:#111827', 'line-height:1.4',
        `font-weight:${i === 0 ? '600' : '400'}`,
      ].join(';');
      txt.textContent = word;

      row.appendChild(badge);
      row.appendChild(txt);

      row.addEventListener('mouseenter', () => { _idx = i; highlight(); });
      row.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
      row.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); applySelection(i); });

      dd.appendChild(row);
    });

    // Footer hint
    const foot = document.createElement('div');
    foot.style.cssText = 'padding:6px 13px;font-size:10.5px;color:#9ca3af;background:#fafafa;border-top:1px solid #f3f4f6;';
    foot.innerHTML = '⬆⬇ navigate &nbsp;·&nbsp; <kbd style="padding:1px 4px;border:1px solid #ddd;border-radius:4px;background:#f9f9f9;font-size:10px;">Esc</kbd> close';
    dd.appendChild(foot);

    _words = words; _idx = 0;
    document.body.appendChild(dd);
    _dd = dd;
  }

  function highlight() {
    if (!_dd) return;
    _dd.querySelectorAll('[data-i]').forEach((el, i) => {
      const active = i === _idx;
      el.style.background = active ? '#f5f3ff' : 'transparent';
      const badge = el.querySelector('span:first-child');
      if (badge) {
        badge.style.background = active ? '#7c3aed' : '#f3f4f6';
        badge.style.color      = active ? '#fff'     : '#9ca3af';
      }
      const txt = el.querySelector('span:last-child');
      if (txt) txt.style.fontWeight = active ? '600' : '400';
    });
  }

  // ── Apply selection ────────────────────────────────────────────────────
  function getTipTap() {
    if (!window.USE_TIPTAP_EDITOR) return null;
    const g = window.tiptapWorkspaceEditor;
    return typeof g === 'function' ? g() : (g?.commands ? g : null);
  }

  function applySelection(idx) {
    const word = _words[idx];
    if (!word || !_editor) { closeDropdown(); return; }

    // --- TipTap editor ---
    const tt = getTipTap();
    if (tt && _token) {
      try {
        const { from } = tt.state.selection;
        const replaceFrom = from - _token.length;
        tt.chain().focus()
          .deleteRange({ from: replaceFrom, to: from })
          .insertContentAt(replaceFrom, word + ' ')
          .run();
        closeDropdown();
        return;
      } catch (_) {
        // fall through to DOM approach
      }
    }

    // --- DOM / contenteditable approach ---
    domReplace(_editor, _tStart, _tEnd, word + ' ');
    _editor.dispatchEvent(new Event('input', { bubbles: true }));
    closeDropdown();
  }

  function domReplace(root, start, end, text) {
    const total = (root.textContent || '').length;
    const s = Math.min(Math.max(start, 0), total);
    const e = Math.min(Math.max(end,   0), total);

    function locate(off) {
      let rem = off;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n = w.nextNode();
      while (n) {
        const len = (n.nodeValue || '').length;
        if (rem <= len) return { node: n, offset: rem };
        rem -= len;
        n = w.nextNode();
      }
      // end of last text node
      const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let last = null, cur = w2.nextNode();
      while (cur) { last = cur; cur = w2.nextNode(); }
      return last ? { node: last, offset: (last.nodeValue || '').length } : null;
    }

    try {
      const a = locate(s), b = locate(e);
      if (!a || !b) throw new Error('locate_failed');
      const range = document.createRange();
      range.setStart(a.node, Math.min(a.offset, (a.node.nodeValue || '').length));
      range.setEnd(b.node,   Math.min(b.offset, (b.node.nodeValue || '').length));
      range.deleteContents();
      const tn = document.createTextNode(text);
      range.insertNode(tn);
      const sel = window.getSelection();
      if (sel) {
        const cr = document.createRange();
        cr.setStart(tn, tn.nodeValue.length);
        cr.collapse(true);
        sel.removeAllRanges();
        sel.addRange(cr);
      }
    } catch (_) {
      // fallback: replace last Latin run in textContent
      const t = root.textContent || '';
      const m = t.match(/[A-Za-z]+\s*$/);
      if (m) root.textContent = t.slice(0, m.index) + text;
    }
  }

  // ── Main pipeline ──────────────────────────────────────────────────────
  function onInput(e) {
    const ed = findEditor(e.target);
    if (!ed) return;
    _editor = ed;

    clearTimeout(_timer);
    if (_abort) { try { _abort.abort(); } catch (_) {} _abort = null; }

    _timer = setTimeout(async () => {
      const pre  = textBeforeCaret(ed);
      const info = parseToken(pre);

      if (!info) {
        closeDropdown();
        _token = null;
        return;
      }

      _token  = info.token;
      _tStart = info.start;
      _tEnd   = info.end;

      // 1️⃣  INSTANT: show local suggestions immediately (0 ms latency)
      const local = localSuggestions(info.token);
      if (local.length > 0) openDropdown(local);

      // Compute local transliteration for backend phonetic filtering
      let localTranslit = '';
      if (typeof window.transliterateToTamil === 'function') {
        try {
          const t = window.transliterateToTamil(info.token);
          if (t && t !== info.token) localTranslit = t;
        } catch (_) {}
      }

      // 2️⃣  BACKEND: fetch /api/v1/suggest in parallel, merge when it arrives
      _abort = new AbortController();
      const { signal } = _abort;
      const capturedToken = info.token;
      const capturedTranslit = localTranslit;

      const backend = await backendSuggestions(capturedToken, signal).catch(() => []);
      if (signal.aborted || _token !== capturedToken) return; // stale

      if (backend.length > 0) {
        const merged = mergeSuggestions(local, backend, capturedTranslit);
        // Only re-render if the merged list is different from what we're showing
        const merged_str = merged.join('|');
        const current_str = _words.join('|');
        if (merged_str !== current_str) openDropdown(merged);
      }
    }, DEBOUNCE);
  }

  function onKeydown(e) {
    if (!_dd) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _idx = (_idx + 1) % _words.length;
      highlight();

    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _idx = (_idx - 1 + _words.length) % _words.length;
      highlight();

    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab') {
      // Standard Tamil IME: Space commits the top suggestion
      const target = e.target;
      if (!target || !findEditor(target)) return; // only intercept if focus is in editor
      e.preventDefault();
      applySelection(_idx);

    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  }

  // Close when clicking outside the dropdown
  document.addEventListener('click', e => {
    if (_dd && !_dd.contains(e.target)) closeDropdown();
  }, true);

  // Close on composition (e.g. IME for other scripts)
  document.addEventListener('compositionstart', closeDropdown);

  // Attach in capture phase so we fire before old handler pipelines
  document.addEventListener('input',   onInput,   true);
  document.addEventListener('keydown', onKeydown, true);

  console.log('[TranslitV3] ✅ Tamil auto-suggestions V3 loaded');
})();
