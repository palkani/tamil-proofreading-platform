// Proofread response normalization (frontend-only)
// Feature-flagged usage: only call when window.PROOFREAD_V2 is truthy.
// Provides:
//   - normalizeProofreadResponse(raw, plainText)
//   - applyProofreadReplacement(text, start, end, replacement)
(function () {
  const DEBUG = typeof window !== 'undefined' && !!window.__DEBUG_PROOFREAD__;

  function log(...args) {
    if (DEBUG) console.log('[PROOFREAD]', ...args);
  }

  function flattenTokens(raw) {
    const arr = [];
    if (Array.isArray(raw?.tokens)) {
      raw.tokens.forEach((t) => {
        (t?.suggestions || []).forEach((s) => arr.push(s));
      });
    }
    return arr;
  }

  function normalizeProofreadResponse(raw, plainText = '') {
    if (!raw) return [];
    const buckets = [
      raw.suggestions,
      raw.corrections,
      raw?.result?.suggestions,
      flattenTokens(raw),
    ].filter(Boolean);

    const merged = buckets.flat().filter(Boolean);
    log('raw suggestions count', merged.length);

    const norm = [];
    merged.forEach((s, idx) => {
      const start = typeof s.start === 'number' ? s.start : null;
      const end = typeof s.end === 'number' ? s.end : null;
      const original = s.original || s.originalText || s.sourceText || '';
      const corrected = s.corrected || s.correction || s.target || s.suggested || '';
      if (!original || !corrected) return;

      let nStart = start;
      let nEnd = end;
      if (nStart === null || nEnd === null) {
        const foundAt = plainText.indexOf(original);
        if (foundAt === -1) {
          log('skip ambiguous range', original);
          return;
        }
        nStart = foundAt;
        nEnd = foundAt + original.length;
      }
      if (nStart >= nEnd || nStart < 0 || nEnd > plainText.length) {
        log('skip invalid range', nStart, nEnd, original);
        return;
      }

      const type = (s.type || s.category || 'grammar').toLowerCase();
      const mappedType =
        type.includes('spell') ? 'spelling' :
        type.includes('style') ? 'style' :
        type.includes('trans') ? 'transliteration' :
        'grammar';

      norm.push({
        id: s.id || `pf-${idx}-${Date.now()}`,
        type: mappedType,
        start: nStart,
        end: nEnd,
        original,
        corrected,
        reason: s.reason || s.description || '',
        confidence: s.score || s.confidence || undefined,
      });
    });
    log('normalized', norm.length);
    return norm;
  }

  function applyProofreadReplacement(text, start, end, replacement) {
    if (typeof start !== 'number' || typeof end !== 'number') return { text, changed: false };
    if (start < 0 || end > text.length || start >= end) return { text, changed: false };
    return {
      text: text.slice(0, start) + replacement + text.slice(end),
      changed: true,
    };
  }

  window.normalizeProofreadResponse = normalizeProofreadResponse;
  window.applyProofreadReplacement = applyProofreadReplacement;
})();

