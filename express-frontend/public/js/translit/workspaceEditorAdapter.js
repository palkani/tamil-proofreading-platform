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
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      try {
        // Replace the full Latin token around the caret, not just "endOffset - tokenLen".
        // This avoids partial replacements when caret moved or offsets are stale.
        let container = range.endContainer;
        let offset = range.endOffset;

        // Ensure we operate on a text node
        if (container && container.nodeType !== Node.TEXT_NODE) {
          // Try to drill into a text node if possible
          const tn = container.childNodes && container.childNodes.length ? container.childNodes[0] : null;
          if (tn && tn.nodeType === Node.TEXT_NODE) {
            container = tn;
            offset = Math.min(offset, (tn.nodeValue || '').length);
          }
        }
        if (!container || container.nodeType !== Node.TEXT_NODE) {
          throw new Error('no_text_node');
        }

        const text = container.nodeValue || '';
        let left = offset;
        let right = offset;
        while (left > 0 && /[A-Za-z]/.test(text.charAt(left - 1))) left--;
        while (right < text.length && /[A-Za-z]/.test(text.charAt(right))) right++;

        // If there is no Latin token around caret, fall back to the original tokenLen heuristic.
        if (left === right) {
          const endOffset = offset;
          const tokenLen = Math.max(0, (end - start) || 0);
          left = Math.max(0, endOffset - tokenLen);
          right = endOffset;
        }

        const newText = text.slice(0, left) + replacement + text.slice(right);
        container.nodeValue = newText;

        // Place caret after inserted replacement
        const caretPos = Math.min(left + String(replacement || '').length, (container.nodeValue || '').length);
        const newRange = document.createRange();
        newRange.setStart(container, caretPos);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } catch (err) {
        // Fallback: replace last token in textContent
        const text = this.editorEl.textContent || '';
        // Replace last Latin run at end (best-effort)
        const m = text.match(/([A-Za-z]+)\s*$/);
        if (m && m.index != null) {
          const newText = text.slice(0, m.index) + replacement;
          this.editorEl.textContent = newText;
        } else {
          const newText = text + replacement;
          this.editorEl.textContent = newText;
        }
      }
    }
  }

  window.WorkspaceEditorAdapter = WorkspaceEditorAdapter;
})();

