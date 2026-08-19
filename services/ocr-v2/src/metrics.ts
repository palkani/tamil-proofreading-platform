// OCR evaluation metrics — grapheme-cluster CER, WER, per-page rollups.
//
// Follows the reporting discipline from the Devanagari OCR-VLM paper:
//   1. CER is computed over grapheme clusters, not code points.
//   2. We report MEDIAN CER + catastrophic-rate (% of pages with CER > 30%).
//      Mean CER hides the rare total failure — and one page in twenty
//      coming back as gibberish is what actually kills the feature.
//
// The Levenshtein routine is a straightforward two-row DP. Not the fastest
// for 100k-token inputs, but our page sizes never exceed ~4k graphemes.

import { graphemes, normalize, words } from './tamil.js';

/**
 * Levenshtein edit distance between two arrays. Generic so we can reuse
 * it for graphemes (CER) and word tokens (WER). Symmetric — order of
 * arguments doesn't matter for the returned distance.
 */
function levenshtein<T>(a: T[], b: T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Character Error Rate over Tamil grapheme clusters. Returned as a
 * fraction in [0, 1] — multiply by 100 for a percentage.
 *
 * CER = edit-distance(pred, gt) / |gt|
 *
 * If ground truth is empty, we return 0 for empty prediction and 1
 * (100% error) otherwise. This matches convention in the OCR literature.
 */
export function cer(prediction: string, groundTruth: string): number {
  const gt = graphemes(normalize(groundTruth));
  const pred = graphemes(normalize(prediction));
  if (gt.length === 0) return pred.length === 0 ? 0 : 1;
  return levenshtein(pred, gt) / gt.length;
}

/**
 * Word Error Rate. Same shape as cer() — fraction in [0, 1].
 * Word = whitespace-separated token after NFC normalization.
 */
export function wer(prediction: string, groundTruth: string): number {
  const gt = words(groundTruth);
  const pred = words(prediction);
  if (gt.length === 0) return pred.length === 0 ? 0 : 1;
  return levenshtein(pred, gt) / gt.length;
}

/** Per-page score for one evaluation run. */
export interface PageScore {
  page: string;         // filename or ID
  cer: number;          // 0..1
  wer: number;          // 0..1
  gtGraphemes: number;  // ground-truth size for weighting
  predGraphemes: number;
  wallMs: number;       // total pipeline latency for this page
  costUsd?: number;     // if the provider reports it
  error?: string;       // if the run failed, this is the message
}

/** Aggregate report over a set of pages. */
export interface EvalReport {
  config: string;             // 'baseline' | 'preprocessed' | ...
  n: number;
  successful: number;         // pages that returned any text
  failed: number;             // pages that errored (counted as CER=1 in metrics)
  medianCer: number;
  meanCer: number;
  p95Cer: number;
  medianWer: number;
  meanWer: number;
  catastrophicRate: number;   // fraction of pages with CER > 0.30
  medianLatencyMs: number;
  p95LatencyMs: number;
  totalCostUsd: number;
  pages: PageScore[];         // full per-page detail for later analysis
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Roll up per-page scores into a single report. Catastrophic-rate uses
 * 0.30 as the threshold: pages with CER > 30% are visually unreadable
 * and useless as OCR output regardless of the average.
 */
export function summarize(config: string, pages: PageScore[]): EvalReport {
  const successful = pages.filter((p) => !p.error);
  const failed = pages.length - successful.length;

  // Include failed pages as CER=1 so the aggregate reflects real
  // reliability, not just accuracy on the pages that worked.
  const effectiveCers = pages.map((p) => (p.error ? 1 : p.cer));
  const effectiveWers = pages.map((p) => (p.error ? 1 : p.wer));

  const sortedCer = [...effectiveCers].sort((a, b) => a - b);
  const sortedWer = [...effectiveWers].sort((a, b) => a - b);
  const sortedLat = [...pages.map((p) => p.wallMs)].sort((a, b) => a - b);

  return {
    config,
    n: pages.length,
    successful: successful.length,
    failed,
    medianCer: percentile(sortedCer, 0.5),
    meanCer: mean(effectiveCers),
    p95Cer: percentile(sortedCer, 0.95),
    medianWer: percentile(sortedWer, 0.5),
    meanWer: mean(effectiveWers),
    catastrophicRate: effectiveCers.filter((c) => c > 0.3).length / pages.length,
    medianLatencyMs: percentile(sortedLat, 0.5),
    p95LatencyMs: percentile(sortedLat, 0.95),
    totalCostUsd: pages.reduce((sum, p) => sum + (p.costUsd ?? 0), 0),
    pages,
  };
}

/** Render an EvalReport as a human-readable console block. */
export function formatReport(r: EvalReport): string {
  const pct = (v: number) => (v * 100).toFixed(2) + '%';
  const ms = (v: number) => v.toFixed(0) + 'ms';
  return [
    '',
    `───── ${r.config} ─────`,
    `Pages:            ${r.n}  (${r.successful} ok, ${r.failed} failed)`,
    `Median CER:       ${pct(r.medianCer)}      Mean CER: ${pct(r.meanCer)}      P95 CER: ${pct(r.p95Cer)}`,
    `Median WER:       ${pct(r.medianWer)}      Mean WER: ${pct(r.meanWer)}`,
    `Catastrophic:     ${pct(r.catastrophicRate)}   (pages with CER > 30%)`,
    `Median latency:   ${ms(r.medianLatencyMs)}   P95 latency: ${ms(r.p95LatencyMs)}`,
    r.totalCostUsd > 0 ? `Total cost:       $${r.totalCostUsd.toFixed(4)}` : '',
    '',
  ].filter(Boolean).join('\n');
}

/** Emit a CSV row per page for offline analysis. */
export function toCsv(r: EvalReport): string {
  const header = 'config,page,cer,wer,gt_graphemes,pred_graphemes,wall_ms,cost_usd,error';
  const rows = r.pages.map((p) =>
    [
      r.config,
      JSON.stringify(p.page),
      p.cer.toFixed(4),
      p.wer.toFixed(4),
      p.gtGraphemes,
      p.predGraphemes,
      p.wallMs,
      (p.costUsd ?? 0).toFixed(6),
      JSON.stringify(p.error ?? ''),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}
