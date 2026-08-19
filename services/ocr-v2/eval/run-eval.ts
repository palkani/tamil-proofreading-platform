// OCR benchmark harness. Ships nothing to prod — this is a CLI you run
// locally against a directory of image/ground-truth pairs to get the
// number we're trying to beat.
//
// Layout expected:
//
//   data/images/          one image per page  (jpg/png/webp/heic)
//   data/ground-truth/    one .txt per image, same basename
//                         e.g. page-001.jpg → page-001.txt (Tamil UTF-8)
//
// Usage:
//
//   GEMINI_API_KEY=... npx tsx eval/run-eval.ts --config baseline
//   → prints report + writes eval-results/<config>.csv
//
// Flags:
//   --config <name>   which config to run (only "baseline" in phase 0)
//   --data-dir <dir>  root directory containing images/ + ground-truth/
//                     default: ./data
//   --model <id>      override the model ID for this config
//   --limit <n>       cap pages processed (useful for smoke tests)
//   --concurrency <n> max parallel Gemini calls (default 4)
//   --out-dir <dir>   where to write the CSV (default: ./eval-results)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cer, wer, summarize, formatReport, toCsv, PageScore } from '../src/metrics.js';
import { runPipeline, PipelineMode } from '../src/pipeline.js';
import { graphemeCount } from '../src/tamil.js';

interface CliArgs {
  config: string;
  dataDir: string;
  model?: string;
  limit?: number;
  concurrency: number;
  outDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    config: 'baseline',
    dataDir: './data',
    concurrency: 4,
    outDir: './eval-results',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case '--config':      args.config = next; i++; break;
      case '--data-dir':    args.dataDir = next; i++; break;
      case '--model':       args.model = next; i++; break;
      case '--limit':       args.limit = Number(next); i++; break;
      case '--concurrency': args.concurrency = Math.max(1, Number(next)); i++; break;
      case '--out-dir':     args.outDir = next; i++; break;
    }
  }
  return args;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);

/**
 * Pair up images with their ground-truth text files by basename.
 * Warns (but doesn't fail) on images with no ground truth — those get
 * skipped so a partially-labeled dataset can still produce a report on
 * the labeled subset.
 */
async function loadPairs(dataDir: string): Promise<Array<{ image: string; groundTruth: string; page: string }>> {
  const imagesDir = path.join(dataDir, 'images');
  const gtDir = path.join(dataDir, 'ground-truth');
  let imageFiles: string[];
  try {
    imageFiles = await fs.readdir(imagesDir);
  } catch (err) {
    throw new Error(`No images directory at ${imagesDir}. Create data/images/ and drop pages there.`);
  }
  imageFiles = imageFiles.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
  const pairs = [];
  for (const img of imageFiles.sort()) {
    const base = path.basename(img, path.extname(img));
    const gtPath = path.join(gtDir, `${base}.txt`);
    try {
      const gt = await fs.readFile(gtPath, 'utf-8');
      pairs.push({ image: path.join(imagesDir, img), groundTruth: gt, page: img });
    } catch {
      console.warn(`[skip] ${img} — no ground truth at ${gtPath}`);
    }
  }
  return pairs;
}

/**
 * Run N async tasks with a concurrency limit. Preserves input order in
 * the output array. Errors from individual tasks become PageScore.error
 * strings — the run doesn't abort partway through.
 */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
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

async function runMode(mode: PipelineMode, pairs: Array<{ image: string; groundTruth: string; page: string }>, args: CliArgs): Promise<PageScore[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY / AI_INTEGRATIONS_GEMINI_API_KEY) must be set in the environment.');
  }
  const model = args.model || 'gemini-2.5-flash';
  console.log(`[eval] Running ${mode} · model=${model} · pages=${pairs.length} · concurrency=${args.concurrency}`);

  let done = 0;
  return pool(pairs, args.concurrency, async ({ image, groundTruth, page }) => {
    try {
      const r = await runPipeline(image, { mode, model, apiKey });
      const score: PageScore = {
        page,
        cer: cer(r.raw_text, groundTruth),
        wer: wer(r.raw_text, groundTruth),
        gtGraphemes: graphemeCount(groundTruth),
        predGraphemes: graphemeCount(r.raw_text),
        wallMs: r.wallMs,
        costUsd: r.costUsd,
      };
      done++;
      process.stdout.write(`\r[eval] ${done}/${pairs.length}  ${page}  CER ${(score.cer * 100).toFixed(1)}%   `);
      return score;
    } catch (err) {
      done++;
      process.stdout.write(`\r[eval] ${done}/${pairs.length}  ${page}  ERROR ${(err as Error).message.slice(0, 40)}   `);
      return {
        page,
        cer: 1,
        wer: 1,
        gtGraphemes: graphemeCount(groundTruth),
        predGraphemes: 0,
        wallMs: 0,
        error: (err as Error).message,
      };
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(args.dataDir);
  const outDir = path.resolve(args.outDir);
  console.log(`[eval] config=${args.config} data-dir=${dataDir} out-dir=${outDir}`);

  let pairs = await loadPairs(dataDir);
  if (pairs.length === 0) {
    console.error(`[eval] No image/ground-truth pairs found under ${dataDir}. See services/ocr-v2/README.md for the expected layout.`);
    process.exit(2);
  }
  if (args.limit && args.limit > 0) pairs = pairs.slice(0, args.limit);

  let scores: PageScore[];
  switch (args.config) {
    case 'baseline':
      scores = await runMode('baseline', pairs, args);
      break;
    case 'preprocessed':
      scores = await runMode('preprocessed', pairs, args);
      break;
    case 'full':
      scores = await runMode('full', pairs, args);
      break;
    default:
      console.error(`[eval] Unknown config: ${args.config}. Valid: baseline | preprocessed | full.`);
      process.exit(2);
  }
  process.stdout.write('\n');

  const report = summarize(args.config, scores);
  console.log(formatReport(report));

  await fs.mkdir(outDir, { recursive: true });
  const csvPath = path.join(outDir, `${args.config}.csv`);
  await fs.writeFile(csvPath, toCsv(report), 'utf-8');
  console.log(`[eval] Per-page CSV: ${csvPath}`);

  const jsonPath = path.join(outDir, `${args.config}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[eval] Full JSON:    ${jsonPath}`);
}

main().catch((err) => {
  console.error('\n[eval] Fatal:', err);
  process.exit(1);
});
