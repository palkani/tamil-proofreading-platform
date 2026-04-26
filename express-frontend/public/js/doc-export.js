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
  function exportPdf() {
    const { html, text } = getEditorContent();
    if (!html.trim() && !text.trim()) {
      window.alert('Editor is empty — type or import some text before exporting.');
      return;
    }

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
</style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${html.trim() ? html : escapeHtml(text).replace(/\n\n+/g, '</p><p>').replace(/^/, '<p>') + '</p>'}
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

    closeAllMenus();
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

    try {
      const res = await fetch('/api/document/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ html, text, title }),
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
        if (!isOpen) positionMenu(btn, menu);
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireMenus);
  } else {
    wireMenus();
  }

  window.docExport = { exportPdf, exportDocx };
})();
