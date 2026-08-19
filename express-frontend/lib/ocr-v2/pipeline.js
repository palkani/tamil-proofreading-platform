// Full pipeline orchestrator — CommonJS for Express runtime.
// See services/ocr-v2/src/pipeline.ts for design notes.
//
// Modes:
//   baseline      — single Gemini call on raw image
//   preprocessed  — sharp-clean + single Gemini call
//   full          — preprocess + strip-cut + parallel transcribe + merge
//
// Prod default: 'full' (best accuracy). Latency budget on Vercel Pro:
// ~15-20s for a typical page (well within the 60s serverless timeout).

const { transcribeBaseline, transcribeBuffer } = require('./transcribe');
const { preprocessImage } = require('./preprocess');
const { cutIntoStrips } = require('./strip-cut');

async function pool(items, limit, fn) {
  const results = new Array(items.length);
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

/** Merge suggestions from multiple strips, dedup on raw+suggested. */
function mergeSuggestions(perStrip) {
  const seen = new Set(), out = [];
  for (const strip of perStrip) {
    for (const s of strip || []) {
      const key = s.raw_word + '||' + s.suggested_word;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/**
 * runPipeline(imagePathOrBuffer, { mode, model, apiKey, ... }) →
 *   { raw_text, suggestions[], wallMs, costUsd, mode, stages, meta }
 *
 * Input can be a file path (string) or a Buffer.
 */
async function runPipeline(input, opts) {
  const started = Date.now();

  if (opts.mode === 'baseline') {
    // Baseline needs a file path. If we got a buffer, write to tmp.
    let imagePath;
    let cleanup = null;
    if (typeof input === 'string') imagePath = input;
    else {
      const fs = require('node:fs/promises');
      const path = require('node:path');
      const os = require('node:os');
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-v2-'));
      imagePath = path.join(tmpDir, 'upload.png');
      await fs.writeFile(imagePath, input);
      cleanup = () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    try {
      const r = await transcribeBaseline(imagePath, {
        model: opts.model, apiKey: opts.apiKey, timeoutMs: opts.timeoutMs,
      });
      return {
        raw_text: r.raw_text, suggestions: r.suggestions,
        wallMs: Date.now() - started, costUsd: r.costUsd, mode: 'baseline',
        stages: { transcribeMs: r.wallMs },
      };
    } finally {
      if (cleanup) cleanup();
    }
  }

  // preprocessed + full both start with the sharp-clean.
  const pre = await preprocessImage(input);

  if (opts.mode === 'preprocessed') {
    const r = await transcribeBuffer(pre.buffer, {
      model: opts.model, apiKey: opts.apiKey, mimeType: pre.mimeType,
      timeoutMs: opts.timeoutMs,
    });
    return {
      raw_text: r.raw_text, suggestions: r.suggestions,
      wallMs: Date.now() - started, costUsd: r.costUsd, mode: 'preprocessed',
      stages: { preprocessMs: pre.wallMs, transcribeMs: r.wallMs },
      meta: { deskewDeg: pre.meta.deskewDeg },
    };
  }

  // ── full pipeline ──
  const cut = await cutIntoStrips(pre.buffer, { linesPerStrip: opts.linesPerStrip || 4 });

  const stripStarted = Date.now();
  const stripResults = await pool(
    cut.strips,
    opts.concurrency || 6,
    (strip) => transcribeBuffer(strip.buffer, {
      model: opts.model, apiKey: opts.apiKey, mimeType: 'image/png',
      timeoutMs: opts.timeoutMs,
    })
  );
  const transcribeMs = Date.now() - stripStarted;

  const raw_text = stripResults.map((r) => (r.raw_text || '').trim()).filter(Boolean).join('\n\n');
  const suggestions = mergeSuggestions(stripResults.map((r) => r.suggestions || []));
  const costUsd = stripResults.reduce((sum, r) => sum + (r.costUsd || 0), 0);

  return {
    raw_text, suggestions,
    wallMs: Date.now() - started, costUsd, mode: 'full',
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

module.exports = { runPipeline };
