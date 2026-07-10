/**
 * Document Export — Tamil Proofreading Platform
 * Exports editor content to PDF or Word (.docx).
 *
 * PDF  → opens browser Print dialog with a clean print stylesheet (user picks "Save as PDF").
 *        Tamil renders perfectly via system fonts; no font-embedding work needed.
 * DOCX → POSTs HTML+text to /api/document/export-docx and triggers a file download.
 *
 * Works with TipTap editor (workspace) and contenteditable (home / free-tamil-editor).
 * Wires up Export dropdown menus identified by id="*-export-btn" + id="*-export-menu".
 */
(function () {
  'use strict';

  // ── Plan detection ────────────────────────────────────────────────────────
  // Pro/Basic/Enterprise users get a clean export (no H1 title, no watermark).
  // Free / anonymous users get a "prooftamil.com" watermark on each page.
  // Resolved from window.USER_PLAN if available (workspace pre-injects it),
  // otherwise from /api/v1/me on first export. Cached after first resolve.
  let _planCache = null;

  function _planFromString(s) {
    const p = String(s || '').toLowerCase();
    return ['pro', 'basic', 'enterprise'].includes(p) ? p : 'free';
  }

  async function getUserPlan() {
    if (_planCache) return _planCache;
    const fromGlobal = _planFromString(window.USER_PLAN);
    if (fromGlobal !== 'free' || window.USER_LOGGED_IN === false) {
      _planCache = fromGlobal;
      return _planCache;
    }
    // Either logged-out (free) or USER_PLAN not yet resolved — ask the backend.
    try {
      const res = await fetch('/api/v1/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const plan = _planFromString(data && data.user && data.user.subscription);
        window.USER_PLAN = plan;
        _planCache = plan;
        return plan;
      }
    } catch (_) {}
    _planCache = 'free';
    return _planCache;
  }

  // ── Editor helpers (mirrors doc-import.js) ────────────────────────────────
  function getTipTap() {
    if (!window.USE_TIPTAP_EDITOR) return null;
    const g = window.tiptapWorkspaceEditor;
    return typeof g === 'function' ? g() : (g && g.getHTML ? g : null);
  }

  function getContentEditable() {
    const legacyEl = document.getElementById('editor');
    if (legacyEl && !legacyEl.classList.contains('hidden')) return legacyEl;
    return document.getElementById('home-editor') || null;
  }

  function getEditorContent() {
    const tiptap = getTipTap();
    if (tiptap) {
      return { html: tiptap.getHTML(), text: tiptap.getText() };
    }
    const el = getContentEditable();
    if (!el) return { html: '', text: '' };
    return { html: el.innerHTML, text: el.innerText };
  }

  function getDocumentTitle() {
    // Prefer a draft title input if present (workspace usually has one)
    const inputs = ['draft-title', 'title-input', 'doc-title'];
    for (const id of inputs) {
      const el = document.getElementById(id);
      if (el && el.value && el.value.trim()) return el.value.trim();
    }
    return 'ProofTamil-Document';
  }

  // ── PDF export via Print dialog ───────────────────────────────────────────
  async function exportPdf() {
    const { html, text } = getEditorContent();
    if (!html.trim() && !text.trim()) {
      window.alert('Editor is empty — type or import some text before exporting.');
      return;
    }

    closeAllMenus();
    const plan = await getUserPlan();
    const isPro = plan !== 'free';

    const title = getDocumentTitle();
    const safeTitle = String(title).replace(/[<>&"]/g, '');

    // Render content into a hidden iframe and trigger print on it.
    // This avoids hijacking the main page's print stylesheet and lets the
    // user pick "Save as PDF" in the system print dialog.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    // Pro tier: no auto-prepended title heading and no watermark.
    // Free / anonymous: keep the title (so the user knows what they exported)
    // AND add a "prooftamil.com" watermark on every printed page.
    const titleHtml = isPro ? '' : `<h1>${safeTitle}</h1>`;
    const watermarkHtml = isPro
      ? ''
      : '<div class="watermark-footer" aria-hidden="true">prooftamil.com</div>';

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html>
<html lang="ta">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { size: A4; margin: 20mm; }
  html, body { font-family: 'Noto Sans Tamil', 'Latha', 'Lohit Tamil', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; line-height: 1.7; font-size: 12pt; }
  body { margin: 0; padding: 0; }
  h1 { font-size: 18pt; margin: 0 0 12pt; padding-bottom: 8pt; border-bottom: 1pt solid #ccc; }
  h2 { font-size: 14pt; margin: 16pt 0 6pt; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; font-weight: 600; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt 20pt; }
  blockquote { margin: 8pt 0; padding-left: 12pt; border-left: 2pt solid #ddd; color: #555; }
  /* Strip any error-highlight styling that leaks from the editor */
  .home-correction-highlight, .hc-grammar, .hc-spelling, .hc-style { text-decoration: none !important; background: transparent !important; }
  /* Free-tier watermark — fixed positioning repeats on every printed page in Chrome/Safari */
  .watermark-footer {
    position: fixed;
    bottom: 6mm;
    right: 10mm;
    font-size: 8.5pt;
    color: #9ca3af;
    letter-spacing: 0.02em;
  }
  @media print { .watermark-footer { color: #9ca3af !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  ${titleHtml}
  ${html.trim() ? html : escapeHtml(text).replace(/\n\n+/g, '</p><p>').replace(/^/, '<p>') + '</p>'}
  ${watermarkHtml}
</body>
</html>`);
    doc.close();

    // Wait for content to render, then trigger print.
    const fire = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.error('[DocExport] Print failed:', e);
        window.alert('Could not open the print dialog. Please try again.');
      }
      // Remove iframe after a delay (some browsers print synchronously, others async).
      setTimeout(() => { try { document.body.removeChild(iframe); } catch (_) {} }, 1500);
    };
    if (iframe.contentDocument.readyState === 'complete') fire();
    else iframe.onload = fire;
  }

  // ── DOCX export via backend ───────────────────────────────────────────────
  async function exportDocx() {
    const { html, text } = getEditorContent();
    if (!html.trim() && !text.trim()) {
      window.alert('Editor is empty — type or import some text before exporting.');
      return;
    }

    closeAllMenus();
    const title = getDocumentTitle();
    const plan = await getUserPlan();

    try {
      const res = await fetch('/api/document/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ html, text, title, plan }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(title)}.docx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch (_) {}
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      console.error('[DocExport] DOCX export failed:', e);
      window.alert(`Word export failed: ${e.message}`);
    }
  }

  // ── TXT export — client-side Blob download ────────────────────────────────
  // Plain-text export is the simplest of the three formats: grab the
  // editor's plain text, wrap it in a Blob, trigger a download. No
  // backend, no library, no watermark rendering step. Preserves
  // paragraph breaks by keeping the newlines that .innerText / TipTap
  // .getText() already emit.
  async function exportTxt() {
    const { text } = getEditorContent();
    if (!text.trim()) {
      window.alert('Editor is empty — type or import some text before exporting.');
      return;
    }
    closeAllMenus();
    const title = getDocumentTitle();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(title)}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (_) {}
      URL.revokeObjectURL(url);
    }, 100);
  }

  function sanitizeFilename(s) {
    return String(s || 'document')
      .replace(/[^\w஀-௿.\-]+/g, '-')
      .slice(0, 80) || 'document';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Dropdown menu wiring ──────────────────────────────────────────────────
  // Auto-discover Export menus by convention: button id ending in "-export-btn"
  // toggles a sibling menu with id ending in "-export-menu".
  function findMenuPairs() {
    const btns = document.querySelectorAll('[id$="-export-btn"]');
    const pairs = [];
    btns.forEach((btn) => {
      const menuId = btn.id.replace(/-export-btn$/, '-export-menu');
      const menu = document.getElementById(menuId);
      if (menu) pairs.push({ btn, menu });
    });
    return pairs;
  }

  // Position the menu using `position: fixed` so it escapes any parent's
  // `overflow: hidden / auto` (the toolbar containers clip absolute children).
  // Right-edge clamping keeps it on-screen on small viewports.
  function positionMenu(btn, menu) {
    const btnRect = btn.getBoundingClientRect();
    // Make menu visible (still off-screen) so we can measure its width.
    menu.classList.remove('hidden');
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    menu.style.top = '0px';
    menu.style.left = '0px';

    const menuWidth = menu.offsetWidth || 176;          // w-44 fallback
    const menuHeight = menu.offsetHeight || 96;
    const margin = 8;

    // Prefer aligning the menu's right edge to the button's right edge so the
    // dropdown sits under the icon. Clamp to the viewport.
    let left = btnRect.right - menuWidth;
    if (left < margin) left = margin;
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }

    // Default: open downward. If not enough space below, flip upward.
    let top = btnRect.bottom + 4;
    if (top + menuHeight > window.innerHeight - margin) {
      top = btnRect.top - menuHeight - 4;
      if (top < margin) top = margin;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = '';
  }

  function closeAllMenus() {
    findMenuPairs().forEach(({ menu }) => menu.classList.add('hidden'));
  }

  function wireMenus() {
    const pairs = findMenuPairs();
    pairs.forEach(({ btn, menu }) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !menu.classList.contains('hidden');
        closeAllMenus();
        if (!isOpen) {
          positionMenu(btn, menu);
          // Re-sync plan state each open — user may have upgraded mid-session.
          syncMenuPlanState(menu);
        }
      });
    });
    // Close on outside click / Escape
    document.addEventListener('click', closeAllMenus);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllMenus();
    });
    // Reposition or close on viewport changes (avoid stale floating menu)
    window.addEventListener('resize', closeAllMenus);
    window.addEventListener('scroll', closeAllMenus, true);

    // Delegate clicks on the per-format buttons inside the new dropdown UI
    // (data-export-format attribute). Free users are redirected to /pricing;
    // Pro users trigger the matching export function. Kept as a delegated
    // listener so we don't need to re-bind if the DOM is re-rendered.
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-export-format]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const format = btn.getAttribute('data-export-format');
      handleFormatClick(format);
    });
  }

  // Trigger the appropriate export function AFTER checking the plan.
  // We already refreshed the plan when the menu opened, so this is a
  // fast in-memory check. Free / unknown → send to /pricing.
  async function handleFormatClick(format) {
    const plan = await getUserPlan();
    if (plan === 'free') {
      // Redirect to pricing. Keeping the destination local (same domain,
      // simple href) avoids fighting the top-nav's own upgrade behaviour.
      window.location.href = '/pricing';
      return;
    }
    if (format === 'docx') return exportDocx();
    if (format === 'pdf')  return exportPdf();
    if (format === 'txt')  return exportTxt();
  }

  // Reflect the current plan on the dropdown element itself so the
  // co-located CSS in workspace.ejs can hide/show the Pro-feature banner
  // and lock icons purely via [data-plan="…"] attribute selectors — no
  // per-element class toggling. Runs async once the plan resolves.
  async function syncMenuPlanState(menu) {
    if (!menu) return;
    // Instantly reflect any cached plan.
    if (_planCache) {
      menu.setAttribute('data-plan', _planCache === 'free' ? 'free' : 'pro');
    }
    // Then confirm via a full lookup (may hit /api/v1/me).
    const plan = await getUserPlan();
    menu.setAttribute('data-plan', plan === 'free' ? 'free' : 'pro');
  }

  // Run one plan sync at load time so any already-open menu (unlikely)
  // and the initial DOM reflect the correct state before the first click.
  function syncAllMenus() {
    findMenuPairs().forEach(({ menu }) => syncMenuPlanState(menu));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wireMenus(); syncAllMenus(); });
  } else {
    wireMenus();
    syncAllMenus();
  }

  window.docExport = { exportPdf, exportDocx, exportTxt };
})();
