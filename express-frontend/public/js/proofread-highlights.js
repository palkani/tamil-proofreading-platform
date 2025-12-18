// Minimal inline highlight manager for Proofread V2 (feature-flagged)
// Underlines based on normalized suggestions (start/end offsets).
// Styles:
//  - spelling: red underline
//  - grammar: blue underline
//  - style: purple underline
(function () {
  const DEBUG = typeof window !== 'undefined' && !!window.__DEBUG_PROOFREAD__;

  class ProofreadHighlights {
    constructor(editorEl) {
      this.editorEl = editorEl;
      this.activeSpans = [];
      this.snapshots = [];
      this.maxSnapshots = 10;
    }

    log(...args) {
      if (DEBUG) console.log('[PROOFREAD-HI]', ...args);
    }

    clear() {
      this.activeSpans.forEach((span) => {
        if (span.parentNode) {
          const parent = span.parentNode;
          while (span.firstChild) parent.insertBefore(span.firstChild, span);
          parent.removeChild(span);
        }
      });
      this.activeSpans = [];
    }

    snapshot(text) {
      this.snapshots.push(text);
      if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
    }

    undo(text) {
      const last = this.snapshots.pop();
      if (!last) return { text, changed: false };
      return { text: last, changed: true };
    }

    underline(suggestions) {
      this.clear();
      if (!this.editorEl) return;
      const walker = document.createTreeWalker(this.editorEl, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }

      const mapRange = (start, end) => {
        let acc = 0;
        let startNode = null, endNode = null, startOffset = 0, endOffset = 0;
        for (const tn of textNodes) {
          const len = tn.textContent.length;
          if (!startNode && acc + len >= start) {
            startNode = tn;
            startOffset = start - acc;
          }
          if (!endNode && acc + len >= end) {
            endNode = tn;
            endOffset = end - acc;
            break;
          }
          acc += len;
        }
        if (!startNode || !endNode) return null;
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
      };

      suggestions.forEach((sugg) => {
        const range = mapRange(sugg.start, sugg.end);
        if (!range) return;
        const span = document.createElement('span');
        span.dataset.proofreadId = sugg.id;
        span.dataset.proofreadType = sugg.type;
        span.className = `proofread-underline proofread-${sugg.type || 'grammar'}`;
        range.surroundContents(span);
        this.activeSpans.push(span);
      });
    }
  }

  // Inject minimal CSS once
  if (typeof document !== 'undefined' && !document.getElementById('proofread-underline-styles')) {
    const style = document.createElement('style');
    style.id = 'proofread-underline-styles';
    style.textContent = `
      .proofread-underline { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 2px; cursor: pointer; }
      .proofread-spelling { text-decoration-color: #f87171; }
      .proofread-grammar { text-decoration-color: #5b8cff; }
      .proofread-style { text-decoration-color: #c084fc; }
    `;
    document.head.appendChild(style);
  }

  window.ProofreadHighlights = ProofreadHighlights;
})();

