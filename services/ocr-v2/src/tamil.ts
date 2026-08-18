// Tamil grapheme + normalization helpers.
//
// WHY THIS EXISTS: Tamil is a Brahmic script. A "letter" that users see
// (e.g. கூ) is one grapheme cluster made of multiple Unicode code points
// (க + ூ = 2 code points, 1 grapheme). If we compute CER over code
// points we count every matra (vowel-sign) error as its own edit, which
// inflates the number and hides the real per-letter accuracy. Every
// metric in this repo MUST operate on grapheme clusters, not code points.
//
// The Devanagari OCR-VLM stress test paper (2606.29213) is explicit about
// this — the same mistake there caused reported accuracies to drift by
// 10-20 percentage points depending on the counting convention.

/**
 * Split a string into user-perceived characters (grapheme clusters).
 * Uses Intl.Segmenter, which is available in Node 16+ and all modern
 * browsers. For Tamil this correctly groups (consonant + matra) and
 * (consonant + virama + consonant) as single units.
 */
export function graphemes(text: string): string[] {
  if (!text) return [];
  const segmenter = new Intl.Segmenter('ta', { granularity: 'grapheme' });
  const out: string[] = [];
  for (const seg of segmenter.segment(text)) {
    out.push(seg.segment);
  }
  return out;
}

/**
 * Count grapheme clusters. Convenience wrapper for readability at
 * call sites (e.g. `graphemeCount(gt) - graphemeCount(pred)`).
 */
export function graphemeCount(text: string): number {
  return graphemes(text).length;
}

/**
 * Normalize a Tamil string for comparison. Two OCR outputs that "look
 * the same" can differ in ways that shouldn't count as errors:
 *
 *   - NFC vs NFD encoding (canonical composition)
 *   - Zero-width joiner / non-joiner sprinkled in
 *   - Trailing whitespace variations
 *   - Different line-break characters
 *
 * We never normalize case (irrelevant to Tamil) and we never touch
 * punctuation (which IS meaningful — a missing full stop is a real error).
 */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[​‌‍﻿]/g, '') // strip ZWSP/ZWNJ/ZWJ/BOM
    .replace(/\r\n?/g, '\n') // unify line endings
    .replace(/[ \t]+$/gm, '') // trailing whitespace per line
    .trim();
}

/**
 * Split text into whitespace-separated words for WER computation. A
 * "word" here is a token; we do NOT try to detect sandhi boundaries.
 * NFC normalization happens first so equivalent encodings collapse.
 */
export function words(text: string): string[] {
  const t = normalize(text);
  if (!t) return [];
  return t.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Classify a single grapheme into a script bucket. Used by the pipeline
 * to route post-correction (Tamil words go through the Tamil lexicon;
 * Latin words are left alone so we don't mangle "WhatsApp").
 *
 * Ranges:
 *   Tamil       — U+0B80..U+0BFF
 *   Latin       — U+0041..U+007A (A-Z, a-z)
 *   Digit       — 0-9 (any script, but ASCII most common)
 *   Punctuation — . , ; : ! ? and friends
 */
export type Script = 'tamil' | 'latin' | 'digit' | 'punct' | 'space' | 'other';

export function scriptOf(grapheme: string): Script {
  if (!grapheme) return 'other';
  const cp = grapheme.codePointAt(0) ?? 0;
  if (cp >= 0x0b80 && cp <= 0x0bff) return 'tamil';
  if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) return 'latin';
  if (cp >= 0x0030 && cp <= 0x0039) return 'digit';
  if (/\s/.test(grapheme)) return 'space';
  if (/[.,;:!?()"'\-–—/\\[\]{}]/.test(grapheme)) return 'punct';
  return 'other';
}
