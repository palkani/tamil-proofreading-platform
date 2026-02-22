/**
 * Sentence Rewrite — Tamil Proofreading Platform
 *
 * When the user selects text in the editor, a floating "✨ Rewrite" button
 * appears. Clicking it calls POST /api/rewrite (Gemini) and shows up to 3
 * alternatives in a popover. Clicking an alternative replaces the selection.
 *
 * Tone can be changed via the #rewrite-tone-select dropdown inside the popover.
 */
(function () {
  'use strict';

  const MIN_CHARS = 10;   // don't show for tiny selections
  const MAX_CHARS = 2000; // matches backend limit

  let _currentTone = 'formal';
  let _lastSelectedText = '';
  let _lastRange = null;          // saved DOM range for contenteditable
  let _tiptapFrom = null;         // saved TipTap from position
  let _tiptapTo   = null;         // saved TipTap to position
  let _btn = null;                // floating Rewrite button element
  let _popover = null;            // popover element
  let _hideTimer = null;

  // ── Editor helpers ─────────────────────────────────────────────────────────
  function getTipTap() {
    if (!window.USE_TIPTAP_EDITOR) return null;
    const g = window.tiptapWorkspaceEditor;
    return typeof g === 'function' ? g() : (g && g.commands ? g : null);
  }

  function getEditorEl() {
    const legacy = document.getElementById('editor');
    if (legacy && !legacy.classList.contains('hidden')) return legacy;
    return document.getElementById('home-editor') || null;
  }

  function isInsideEditor(node) {
    const containers = [
      document.getElementById('editor'),
      document.getElementById('home-editor'),
      document.getElementById('tiptap-workspace-editor'),
    ].filter(Boolean);
    return containers.some(c => c.contains(node));
  }

  // ── Floating button ────────────────────────────────────────────────────────
  function getOrCreateBtn() {
    if (_btn) return _btn;
    _btn = document.createElement('button');
    _btn.id = 'rewrite-float-btn';
    _btn.innerHTML = '✨ Rewrite';
    _btn.setAttribute('aria-label', 'Rewrite selected text with AI');
    _btn.addEventListener('click', onRewriteClick);
    document.body.appendChild(_btn);
    return _btn;
  }

  function showBtn(rect) {
    const btn = getOrCreateBtn();
    clearTimeout(_hideTimer);
    // Position above the selection, centered
    const top  = rect.top  + window.scrollY - 44;
    const left = rect.left + window.scrollX + (rect.width / 2) - 52;
    btn.style.top  = Math.max(4, top)  + 'px';
    btn.style.left = Math.max(4, left) + 'px';
    btn.classList.remove('rewrite-btn-hidden');
    btn.classList.add('rewrite-btn-visible');
  }

  function hideBtn() {
    if (!_btn) return;
    _btn.classList.remove('rewrite-btn-visible');
    _btn.classList.add('rewrite-btn-hidden');
  }

  // ── Popover ────────────────────────────────────────────────────────────────
  function getOrCreatePopover() {
    if (_popover) return _popover;

    _popover = document.createElement('div');
    _popover.id = 'rewrite-popover';
    _popover.innerHTML = `
      <div class="rewrite-popover-header">
        <span class="rewrite-popover-title">✨ AI Rewrite</span>
        <div class="rewrite-popover-controls">
          <select id="rewrite-tone-select" class="rewrite-tone-select" title="Rewrite style">
            <option value="formal">Formal</option>
            <option value="casual">Casual</option>
            <option value="simple">Simple</option>
          </select>
          <button class="rewrite-close-btn" aria-label="Close">✕</button>
        </div>
      </div>
      <div id="rewrite-results" class="rewrite-results">
        <div class="rewrite-loading">Generating rewrites…</div>
      </div>
    `;

    _popover.querySelector('#rewrite-tone-select').addEventListener('change', e => {
      _currentTone = e.target.value;
      if (_lastSelectedText) fetchRewrites(_lastSelectedText);
    });
    _popover.querySelector('.rewrite-close-btn').addEventListener('click', closePopover);

    document.body.appendChild(_popover);
    return _popover;
  }

  function showPopover(anchorRect) {
    const pop = getOrCreatePopover();
    const popW = 340;
    let left = anchorRect.left + window.scrollX + (anchorRect.width / 2) - popW / 2;
    let top  = anchorRect.bottom + window.scrollY + 8;

    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    if (top + 220 > window.innerHeight + window.scrollY) {
      top = anchorRect.top + window.scrollY - 230;
    }

    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
    pop.classList.remove('rewrite-pop-hidden');
    pop.classList.add('rewrite-pop-visible');
  }

  function closePopover() {
    if (_popover) {
      _popover.classList.remove('rewrite-pop-visible');
      _popover.classList.add('rewrite-pop-hidden');
    }
    hideBtn();
  }

  function setResults(html) {
    const el = document.getElementById('rewrite-results');
    if (el) el.innerHTML = html;
  }

  // ── API call ──────────────────────────────────────────────────────────────
  async function fetchRewrites(text) {
    setResults('<div class="rewrite-loading">⏳ Generating rewrites…</div>');

    const token = localStorage.getItem('access_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ text, tone: _currentTone })
      });

      const data = await res.json();
      if (!res.ok) {
        setResults(`<div class="rewrite-error">⚠ ${data.error || 'Failed to rewrite'}</div>`);
        return;
      }

      const rewrites = data.rewrites || [];
      if (rewrites.length === 0) {
        setResults('<div class="rewrite-error">No rewrites returned.</div>');
        return;
      }

      const items = rewrites.map((r, i) => `
        <button class="rewrite-option" data-index="${i}" title="Click to replace selected text">
          <span class="rewrite-option-num">${i + 1}</span>
          <span class="rewrite-option-text">${escapeHtml(r)}</span>
        </button>
      `).join('');

      setResults(items);

      document.querySelectorAll('.rewrite-option').forEach(btn => {
        btn.addEventListener('click', () => {
          applyRewrite(rewrites[parseInt(btn.getAttribute('data-index'))]);
        });
      });

    } catch (err) {
      console.error('[Rewrite] fetch error:', err);
      setResults(`<div class="rewrite-error">⚠ ${err.message}</div>`);
    }
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Apply replacement ─────────────────────────────────────────────────────
  function applyRewrite(newText) {
    const tiptap = getTipTap();
    if (tiptap && _tiptapFrom !== null && _tiptapTo !== null) {
      tiptap.chain().focus()
        .deleteRange({ from: _tiptapFrom, to: _tiptapTo })
        .insertContentAt(_tiptapFrom, newText)
        .run();
      closePopover();
      return;
    }

    // contenteditable: restore saved range and replace
    if (_lastRange) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(_lastRange);
        document.execCommand('insertText', false, newText);
        const el = getEditorEl();
        if (el) el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    closePopover();
  }

  // ── Selection watcher ─────────────────────────────────────────────────────
  function onSelectionChange() {
    clearTimeout(_hideTimer);

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      _hideTimer = setTimeout(hideBtn, 400);
      return;
    }

    const range   = sel.getRangeAt(0);
    const text    = sel.toString().trim();
    const anchorNode = sel.anchorNode;

    // Only show inside editor elements
    if (!isInsideEditor(anchorNode)) {
      hideBtn();
      return;
    }

    if (text.length < MIN_CHARS || text.length > MAX_CHARS) {
      hideBtn();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0) { hideBtn(); return; }

    _lastSelectedText = text;

    // Save range for contenteditable restore
    _lastRange = range.cloneRange();

    // Save TipTap positions
    const tiptap = getTipTap();
    if (tiptap) {
      try {
        const { from, to } = tiptap.state.selection;
        _tiptapFrom = from;
        _tiptapTo   = to;
      } catch (_) {}
    }

    showBtn(rect);
  }

  // ── Button click handler ──────────────────────────────────────────────────
  function onRewriteClick(e) {
    e.stopPropagation();
    if (!_lastSelectedText) return;

    // Re-read rect from btn position for popover placement
    const btnRect = _btn.getBoundingClientRect();
    showPopover({
      left:   btnRect.left,
      right:  btnRect.right,
      top:    btnRect.top  + window.scrollY,
      bottom: btnRect.bottom + window.scrollY,
      width:  btnRect.width
    });

    // Pre-set tone select
    const sel = document.getElementById('rewrite-tone-select');
    if (sel) sel.value = _currentTone;

    fetchRewrites(_lastSelectedText);
  }

  // ── Close on outside click ────────────────────────────────────────────────
  document.addEventListener('click', e => {
    if (_popover && !_popover.contains(e.target) && e.target !== _btn) {
      closePopover();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePopover();
  });

  // Attach selection listener
  document.addEventListener('selectionchange', onSelectionChange);

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = `
    /* Floating rewrite button */
    #rewrite-float-btn {
      position: absolute;
      z-index: 9990;
      background: #7c3aed;
      color: #fff;
      border: none;
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 3px 14px rgba(124,58,237,0.45);
      transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px);
    }
    #rewrite-float-btn.rewrite-btn-visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    #rewrite-float-btn.rewrite-btn-hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(4px);
    }
    #rewrite-float-btn:hover { background: #6d28d9; }

    /* Popover */
    #rewrite-popover {
      position: absolute;
      z-index: 9991;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      width: 340px;
      max-width: calc(100vw - 16px);
      overflow: hidden;
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    #rewrite-popover.rewrite-pop-hidden { opacity: 0; pointer-events: none; transform: translateY(6px); }
    #rewrite-popover.rewrite-pop-visible { opacity: 1; pointer-events: auto; transform: translateY(0); }

    .rewrite-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px 10px;
      border-bottom: 1px solid #f3f4f6;
      background: #faf5ff;
    }
    .rewrite-popover-title {
      font-size: 13px;
      font-weight: 700;
      color: #5b21b6;
    }
    .rewrite-popover-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .rewrite-tone-select {
      font-size: 12px;
      border: 1px solid #ddd6fe;
      border-radius: 6px;
      padding: 3px 6px;
      color: #6d28d9;
      background: #fff;
      cursor: pointer;
    }
    .rewrite-close-btn {
      background: none;
      border: none;
      font-size: 14px;
      color: #9ca3af;
      cursor: pointer;
      padding: 2px 4px;
      line-height: 1;
      border-radius: 4px;
    }
    .rewrite-close-btn:hover { background: #f3f4f6; color: #374151; }

    .rewrite-results { padding: 8px 0; }
    .rewrite-loading, .rewrite-error {
      padding: 16px 14px;
      font-size: 13px;
      color: #6b7280;
      text-align: center;
    }
    .rewrite-error { color: #dc2626; }

    .rewrite-option {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      width: 100%;
      text-align: left;
      padding: 10px 14px;
      border: none;
      background: none;
      cursor: pointer;
      transition: background 0.12s;
      border-bottom: 1px solid #f9fafb;
    }
    .rewrite-option:last-child { border-bottom: none; }
    .rewrite-option:hover { background: #f5f3ff; }
    .rewrite-option-num {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #7c3aed;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
    }
    .rewrite-option-text {
      font-size: 14px;
      color: #111827;
      line-height: 1.55;
      font-family: 'Noto Sans Tamil', 'Latha', system-ui, sans-serif;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

})();
