/**
 * Document Import — Tamil Proofreading Platform
 * Supports .txt, .docx (Word), and .pdf files.
 *
 * .txt  → FileReader.readAsText(), inserts as paragraphs
 * .docx → mammoth.js (CDN, loaded on demand) converts to HTML
 * .pdf  → PDF.js (CDN, loaded on demand) extracts text page by page
 *
 * Works with TipTap editor (workspace) and contenteditable (home editor).
 */
(function () {
  'use strict';

  const MAMMOTH_CDN    = 'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js';
  const PDFJS_CDN      = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER   = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MAX_FILE_MB    = 20;
  const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

  // ── Editor helpers ────────────────────────────────────────────────────────
  function getTipTap() {
    if (!window.USE_TIPTAP_EDITOR) return null;
    const g = window.tiptapWorkspaceEditor;
    return typeof g === 'function' ? g() : (g && g.commands ? g : null);
  }

  function getContentEditable() {
    const legacyEl = document.getElementById('editor');
    if (legacyEl && !legacyEl.classList.contains('hidden')) return legacyEl;
    return document.getElementById('home-editor') || null;
  }

  function plainTextToHtml(text) {
    return text
      .split('\n')
      .map(line => {
        const safe = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return safe.trim() ? `<p>${safe}</p>` : '<p><br></p>';
      })
      .join('');
  }

  function insertHtmlIntoEditor(html) {
    const tiptap = getTipTap();
    if (tiptap) {
      tiptap.commands.setContent(html);
      tiptap.commands.focus('end');
      // Fire change so autosave / word-count triggers
      tiptap.emit && tiptap.emit('update', { editor: tiptap });
      return;
    }

    const el = getContentEditable();
    if (!el) { console.warn('[DocImport] No editor found'); return; }
    el.innerHTML = html;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    // Move cursor to end
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  }

  // ── Mammoth lazy loader ───────────────────────────────────────────────────
  function loadMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = MAMMOTH_CDN;
      script.onload  = () => resolve(window.mammoth);
      script.onerror = () => reject(new Error('Failed to load mammoth.js from CDN'));
      document.head.appendChild(script);
    });
  }

  // ── PDF.js lazy loader ────────────────────────────────────────────────────
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDFJS_CDN;
      script.onload = () => {
        if (!window.pdfjsLib) { reject(new Error('PDF.js loaded but pdfjsLib not found')); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js from CDN'));
      document.head.appendChild(script);
    });
  }

  // ── File processing ───────────────────────────────────────────────────────
  async function processFile(file) {
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      showToast(`File too large. Maximum size is ${MAX_FILE_MB} MB.`, 'error');
      return;
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();

    if (ext === 'txt') {
      showToast('Importing text file…', 'info');
      try {
        const text = await file.text();
        const html  = plainTextToHtml(text);
        insertHtmlIntoEditor(html);
        showToast(`✓ "${file.name}" imported (${text.length.toLocaleString()} characters)`, 'success');
      } catch (err) {
        showToast('Failed to read file: ' + err.message, 'error');
      }
      return;
    }

    if (ext === 'docx') {
      showToast('Extracting text from Word document…', 'info');
      try {
        const mammoth      = await loadMammoth();
        const arrayBuffer  = await file.arrayBuffer();
        const result       = await mammoth.convertToHtml({ arrayBuffer });
        if (result.messages && result.messages.length) {
          console.warn('[DocImport] mammoth warnings:', result.messages);
        }
        insertHtmlIntoEditor(result.value || '<p></p>');
        showToast(`✓ "${file.name}" imported successfully`, 'success');
      } catch (err) {
        console.error('[DocImport] .docx error:', err);
        showToast('Failed to import .docx: ' + err.message, 'error');
      }
      return;
    }

    if (ext === 'pdf') {
      showToast('Extracting text from PDF…', 'info');
      try {
        const pdfjsLib   = await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages    = pdf.numPages;
        const pageParts   = [];
        for (let i = 1; i <= numPages; i++) {
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();
          // items with str content; join with space, preserving line breaks via hasEOL
          const pageText = content.items
            .map(item => (item.str || '') + (item.hasEOL ? '\n' : ''))
            .join('')
            .trim();
          if (pageText) pageParts.push(pageText);
        }
        const fullText = pageParts.join('\n\n');
        if (!fullText.trim()) {
          showToast('No selectable text found in this PDF (may be a scanned image). Try a text-based PDF.', 'error');
          return;
        }
        const html = plainTextToHtml(fullText);
        insertHtmlIntoEditor(html);
        showToast(`✓ "${file.name}" imported (${numPages} page${numPages !== 1 ? 's' : ''}, ${fullText.length.toLocaleString()} chars)`, 'success');
      } catch (err) {
        console.error('[DocImport] PDF error:', err);
        showToast('Failed to import PDF: ' + err.message, 'error');
      }
      return;
    }

    showToast('Unsupported file type. Please use .pdf, .txt, or .docx', 'error');
  }

  // ── Toast notification ────────────────────────────────────────────────────
  function showToast(msg, type) {
    const existing = document.getElementById('doc-import-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'doc-import-toast';
    el.textContent = msg;

    const colors = {
      success: 'background:#16a34a;color:#fff',
      error:   'background:#dc2626;color:#fff',
      info:    'background:#2563eb;color:#fff',
    };
    el.style.cssText = [
      'position:fixed',
      'top:20px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:99998',
      'padding:10px 20px',
      'border-radius:10px',
      'font-size:14px',
      'font-weight:500',
      'box-shadow:0 4px 20px rgba(0,0,0,0.2)',
      'max-width:min(480px,90vw)',
      'text-align:center',
      'transition:opacity 0.3s ease',
      colors[type] || colors.info,
    ].join(';');

    document.body.appendChild(el);
    if (type !== 'info') {
      setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
    }
  }

  // ── Drag-and-drop on editor area ──────────────────────────────────────────
  function attachDragDrop() {
    const targets = [
      document.getElementById('editor'),
      document.getElementById('home-editor'),
      document.getElementById('tiptap-workspace-editor'),
    ].filter(Boolean);

    targets.forEach(el => {
      el.addEventListener('dragover', e => {
        const hasFile = e.dataTransfer && Array.from(e.dataTransfer.items || []).some(i => i.kind === 'file');
        if (!hasFile) return;
        e.preventDefault();
        el.style.outline = '3px dashed #7c3aed';
        el.style.outlineOffset = '-4px';
      });
      el.addEventListener('dragleave', () => {
        el.style.outline = '';
        el.style.outlineOffset = '';
      });
      el.addEventListener('drop', e => {
        el.style.outline = '';
        el.style.outlineOffset = '';
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext === 'txt' || ext === 'docx' || ext === 'pdf') {
          e.preventDefault();
          processFile(file);
        }
        // Other types fall through to browser default (e.g. image drop)
      });
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function openPicker() {
    let input = document.getElementById('doc-import-file-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id   = 'doc-import-file-input';
      input.accept = '.pdf,.txt,.docx';
      input.style.display = 'none';
      input.addEventListener('change', async e => {
        await processFile(e.target.files[0]);
        e.target.value = '';
      });
      document.body.appendChild(input);
    }
    input.click();
  }

  window.docImport = { open: openPicker };

  // Init drag-drop after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachDragDrop);
  } else {
    attachDragDrop();
  }
})();
