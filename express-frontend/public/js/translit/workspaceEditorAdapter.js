// Adapter for Workspace editor to work with TransliterationTypeahead
(function () {
  class WorkspaceEditorAdapter {
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

    replaceRange(start, end, replacement) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      try {
        const endOffset = range.endOffset;
        const tokenLen = end - start;
        range.setStart(range.endContainer, Math.max(0, endOffset - tokenLen));
        range.deleteContents();
        const node = document.createTextNode(replacement);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) {
        // Fallback: replace last token in textContent
        const text = this.editorEl.textContent || '';
        const newText = text.slice(0, text.length - (end - start)) + replacement;
        this.editorEl.textContent = newText;
      }
    }
  }

  window.WorkspaceEditorAdapter = WorkspaceEditorAdapter;
})();

