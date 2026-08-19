// Full-pipeline orchestrator: image → preprocess → strip-cut →
// parallel transcribe → reassemble raw_text + merge suggestions.
//
// Three modes exposed to callers:
//
//   baseline      — single Gemini call on the raw image (existing v1)
//   preprocessed  — sharp-clean the image first, single Gemini call
//   full          — preprocess + strip-cut + parallel-transcribe + merge
//
// The full pipeline's expected win is that dense pages get the model's
// full attention per strip rather than sharing it across the whole
// image. Latency goes up ~1.5× (parallel calls) but cost stays flat
// (same total tokens across strips as one big image).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { transcribeBaseline, transcribeBuffer, TranscribeResult } from './transcribe.js';
import { preprocessImage } from './preprocess.js';
import { cutIntoStrips } from './strip-cut.js';
import { OcrSuggestion } from './prompt.js';

export type PipelineMode = 'baseline' | 'preprocessed' | 'full';

export interface PipelineOptions {
  mode: PipelineMode;
  model: string;
  apiKey: string;
  /** For 'full' mode: how many strips to transcribe in parallel.
   *  Default 6 — most real pages produce 4-6 strips, so 6 lets them
   *  all fire simultaneously and finish in a single Gemini round-trip
   *  rather than serialized batches. Well under Gemini's paid-tier
   *  rate limit (300 req/min). */
  concurrency?: number;
  /** For 'full' mode: target lines per strip. Default 5. */
  linesPerStrip?: number;
  /** Optional timeout per Gemini call (ms). Default 60_000. */
  timeoutMs?: number;
}

export interface PipelineResult {
  raw_text: string;
  suggestions: OcrSuggestion[];
  wallMs: number;
  costUsd: number;
  mode: PipelineMode;
  stages: {
    preprocessMs?: number;
    stripCutMs?: number;
    stripCount?: number;
    transcribeMs: number;
    perStripMs?: number[];       // for full mode
  };
  meta?: {
    deskewDeg?: number;
    detectedLines?: number;
    fallbackUsed?: boolean;
  };
}

/**
 * Simple concurrency limiter — never more than `limit` in flight.
 * Preserves input order in the output array.
 */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Merge suggestions from multiple strips into a single deduplicated
 * list. Two suggestions on the same raw_word from different strips
 * are kept as-is (each strip is a different reading of a different
 * region), but exact-duplicate cards (same raw + same suggested) are
 * collapsed.
 */
function mergeSuggestions(perStrip: OcrSuggestion[][]): OcrSuggestion[] {
  const seen = new Set<string>();
  const out: OcrSuggestion[] = [];
  for (const strip of perStrip) {
    for (const s of strip) {
      const key = s.raw_word + '||' + s.suggested_word;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/**
 * Full pipeline entry point. Reads from disk, dispatches based on
 * mode, returns a unified PipelineResult.
 */
export async function runPipeline(
  imagePath: string,
  opts: PipelineOptions
): Promise<PipelineResult> {
  const started = Date.now();

  if (opts.mode === 'baseline') {
    const r = await transcribeBaseline(imagePath, {
      model: opts.model, apiKey: opts.apiKey, timeoutMs: opts.timeoutMs,
    });
    return {
      raw_text: r.raw_text,
      suggestions: r.suggestions,
      wallMs: Date.now() - started,
      costUsd: r.costUsd,
      mode: 'baseline',
      stages: { transcribeMs: r.wallMs },
    };
  }

  // Both 'preprocessed' and 'full' start with the same sharp-clean.
  const pre = await preprocessImage(imagePath);

  if (opts.mode === 'preprocessed') {
    const r = await transcribeBuffer(pre.buffer, {
      model: opts.model, apiKey: opts.apiKey, mimeType: pre.mimeType,
      timeoutMs: opts.timeoutMs,
    });
    return {
      raw_text: r.raw_text,
      suggestions: r.suggestions,
      wallMs: Date.now() - started,
      costUsd: r.costUsd,
      mode: 'preprocessed',
      stages: {
        preprocessMs: pre.wallMs,
        transcribeMs: r.wallMs,
      },
      meta: { deskewDeg: pre.meta.deskewDeg },
    };
  }

  // ── full pipeline ─────────────────────────────────────────
  const cut = await cutIntoStrips(pre.buffer, {
    linesPerStrip: opts.linesPerStrip ?? 5,
  });

  // Transcribe each strip in parallel, capped at concurrency.
  const stripStarted = Date.now();
  const stripResults = await pool(
    cut.strips,
    opts.concurrency ?? 6,
    async (strip): Promise<TranscribeResult> =>
      transcribeBuffer(strip.buffer, {
        model: opts.model, apiKey: opts.apiKey, mimeType: 'image/png',
        timeoutMs: opts.timeoutMs,
      })
  );
  const transcribeMs = Date.now() - stripStarted;

  // Reassemble raw_text in strip (reading) order, join with double
  // newlines so strip boundaries stay visible in the output. Merge
  // suggestions across strips with dedup.
  const raw_text = stripResults.map((r) => r.raw_text.trim()).filter(Boolean).join('\n\n');
  const suggestions = mergeSuggestions(stripResults.map((r) => r.suggestions || []));
  const costUsd = stripResults.reduce((sum, r) => sum + (r.costUsd || 0), 0);

  return {
    raw_text,
    suggestions,
    wallMs: Date.now() - started,
    costUsd,
    mode: 'full',
    stages: {
      preprocessMs: pre.wallMs,
      stripCutMs: cut.wallMs,
      stripCount: cut.strips.length,
      transcribeMs,
      perStripMs: stripResults.map((r) => r.wallMs),
    },
    meta: {
      deskewDeg: pre.meta.deskewDeg,
      detectedLines: cut.meta.detectedLines,
      fallbackUsed: cut.meta.fallbackUsed,
    },
  };
}

/**
 * Convenience: run pipeline and also write intermediate artifacts
 * (preprocessed image, individual strip images) to a temp directory
 * for eyeballing. Returns the pipeline result + the directory path.
 * Used by eval + debug harness only — not by the demo server.
 */
export async function runPipelineWithArtifacts(
  imagePath: string,
  opts: PipelineOptions
): Promise<{ result: PipelineResult; artifactsDir: string }> {
  const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-v2-artifacts-'));
  // Piggyback on runPipeline; we write artifacts by re-doing the
  // cheap preprocess/strip stages (Gemini calls are the only expensive
  // part, and we don't want to double them).
  const result = await runPipeline(imagePath, opts);

  if (opts.mode !== 'baseline') {
    const pre = await preprocessImage(imagePath);
    await fs.writeFile(path.join(artifactsDir, 'preprocessed.png'), pre.buffer);
    if (opts.mode === 'full') {
      const cut = await cutIntoStrips(pre.buffer, {
        linesPerStrip: opts.linesPerStrip ?? 5,
      });
      for (const strip of cut.strips) {
        await fs.writeFile(
          path.join(artifactsDir, `strip-${String(strip.index).padStart(2, '0')}.png`),
          strip.buffer
        );
      }
    }
  }
  return { result, artifactsDir };
}
