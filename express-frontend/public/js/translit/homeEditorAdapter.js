// Adapter for Home editor (contenteditable) to work with TransliterationTypeahead
(function () {
  class HomeEditorAdapter {
    constructor(editorEl) {
      this.editorEl = editorEl;
      this.changeHandlers = [];
      this.keyHandlers = [];
      this.blurHandlers = [];
      if (this.editorEl) {
        this.editorEl.addEventListener('input', () => this.emitChange());
        this.editorEl.addEventListener('keydown', (e) => this.emitKey(e));
        this.editorEl.addEventListener('blur', () => this.emitBlur());
      }
    }

    onChange(cb) { this.changeHandlers.push(cb); }
    onKeyDown(cb) { this.keyHandlers.push(cb); }
    onBlur(cb) { this.blurHandlers.push(cb); }

    emitChange() { this.changeHandlers.forEach((cb) => cb()); }
    emitKey(e) { this.keyHandlers.forEach((cb) => cb(e)); }
    emitBlur() { this.blurHandlers.forEach((cb) => cb()); }

    getTextBeforeCaret() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return '';
      const range = sel.getRangeAt(0).cloneRange();
      const pre = range.cloneRange();
      pre.selectNodeContents(this.editorEl);
      pre.setEnd(range.endContainer, range.endOffset);
      return pre.toString();
    }

    getCaretRect() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rects = range.getClientRects();
      if (rects.length) return rects[0];
      return this.getFallbackRect();
    }

    getFallbackRect() {
      if (!this.editorEl) return null;
      const r = this.editorEl.getBoundingClientRect();
      return { top: r.bottom, bottom: r.bottom, left: r.left };
    }

    focus() {
      try {
        this.editorEl && this.editorEl.focus && this.editorEl.focus();
      } catch (_e) {}
    }

    captureSelection() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const r = sel.getRangeAt(0);
      if (!r) return null;
      if (this.editorEl && !this.editorEl.contains(r.startContainer)) return null;
      return {
        sc: r.startContainer,
        so: r.startOffset,
        ec: r.endContainer,
        eo: r.endOffset,
      };
    }

    restoreSelection(snapshot) {
      try {
        if (!snapshot) return false;
        const { sc, so, ec, eo } = snapshot;
        if (!sc || !ec) return false;
        if (this.editorEl && (!this.editorEl.contains(sc) || !this.editorEl.contains(ec))) return false;
        const range = document.createRange();
        const scLen = sc.nodeType === Node.TEXT_NODE ? (sc.nodeValue || '').length : (sc.childNodes ? sc.childNodes.length : 0);
        const ecLen = ec.nodeType === Node.TEXT_NODE ? (ec.nodeValue || '').length : (ec.childNodes ? ec.childNodes.length : 0);
        range.setStart(sc, Math.min(Math.max(0, so || 0), scLen));
        range.setEnd(ec, Math.min(Math.max(0, eo || 0), ecLen));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      } catch (_e) {
        return false;
      }
    }

    replaceRange(start, end, replacement) {
      const root = this.editorEl;
      if (!root) return;

      const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
      const totalTextLen = (root.textContent || '').length;
      const absStart = clamp(Number(start || 0), 0, totalTextLen);
      const absEnd = clamp(Number(end || 0), 0, totalTextLen);
      if (absEnd < absStart) return;

      const locate = (abs) => {
        let remaining = abs;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const len = (node.nodeValue || '').length;
          if (remaining <= len) {
            return { node, offset: remaining };
          }
          remaining -= len;
          node = walker.nextNode();
        }
        // If we fell off the end, return last node end.
        const last = (() => {
          const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let n = null;
          let cur = w.nextNode();
          while (cur) { n = cur; cur = w.nextNode(); }
          return n;
        })();
        return last ? { node: last, offset: (last.nodeValue || '').length } : null;
      };

      try {
        const a = locate(absStart);
        const b = locate(absEnd);
        if (!a || !b || !a.node || !b.node) throw new Error('locate_failed');

        const range = document.createRange();
        range.setStart(a.node, clamp(a.offset, 0, (a.node.nodeValue || '').length));
        range.setEnd(b.node, clamp(b.offset, 0, (b.node.nodeValue || '').length));
        range.deleteContents();
        const textNode = document.createTextNode(String(replacement || ''));
        range.insertNode(textNode);

        const sel = window.getSelection();
        if (sel) {
          const caret = document.createRange();
          caret.setStart(textNode, (textNode.nodeValue || '').length);
          caret.collapse(true);
          sel.removeAllRanges();
          sel.addRange(caret);
        }
      } catch (_err) {
        const text = root.textContent || '';
        const m = text.match(/([A-Za-z]+)\s*$/);
        if (m && m.index != null) {
          root.textContent = text.slice(0, m.index) + String(replacement || '');
        } else {
          root.textContent = text + String(replacement || '');
        }
      }
    }
  }

  window.HomeEditorAdapter = HomeEditorAdapter;
})();

