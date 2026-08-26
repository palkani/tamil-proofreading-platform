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

const { transcribeBaseline, transcribeBuffer, transcribeDocumentBuffer } = require('./transcribe');
const { preprocessImage } = require('./preprocess');
const { cutIntoStrips } = require('./strip-cut');

// Concurrency-limited fan-out. Per-item errors DO NOT reject the whole
// batch — they land in results[idx] as { __error: err }. Fail-fast was
// biting us because any one transient Gemini rate-limit or 500 on a
// single strip killed the whole 6-strip transcription and forced the
// user to retry the entire page. Now the caller sees which strips
// failed and decides whether to keep going or hard-fail.
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { __error: err };
      }
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

  // preprocessed + full + document all start with the sharp-clean.
  const pre = await preprocessImage(input);

  // Document mode — for land records, patta/chitta, deeds on stamp
  // paper, VAO reports, and other structured official documents.
  // Skips strip-cutting (which mangles tables + multi-column layouts)
  // and sends the whole preprocessed image to Gemini in a single call
  // with the form-aware prompt (documentPrompt.js). Returns fields[]
  // in addition to raw_text. Opt-in via ?mode=document on the API.
  // Existing 'full' mode is UNTOUCHED.
  if (opts.mode === 'document') {
    const r = await transcribeDocumentBuffer(pre.buffer, {
      model: opts.model, apiKey: opts.apiKey, mimeType: pre.mimeType,
      timeoutMs: opts.timeoutMs,
    });
    return {
      raw_text: r.raw_text,
      suggestions: r.suggestions,   // always [] for document mode
      fields: r.fields,             // NEW — key-value pairs extracted from the form
      wallMs: Date.now() - started,
      costUsd: r.costUsd,
      mode: 'document',
      stages: { preprocessMs: pre.wallMs, transcribeMs: r.wallMs },
      meta: { deskewDeg: pre.meta.deskewDeg, fieldCount: r.fields.length },
    };
  }

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
  // First pass — parallel transcribe.
  let stripResults = await pool(
    cut.strips,
    opts.concurrency || 6,
    (strip) => transcribeBuffer(strip.buffer, {
      model: opts.model, apiKey: opts.apiKey, mimeType: 'image/png',
      timeoutMs: opts.timeoutMs,
    })
  );

  // Retry any strip that errored, once, sequentially. Transient Gemini
  // 429s / 500s / connection resets clear on a re-request in the vast
  // majority of cases; retrying only the failed strips (rather than
  // making the user re-upload the whole page) is much cheaper on wall
  // clock and on their monthly quota.
  const failedIdx = stripResults
    .map((r, i) => (r && r.__error) ? i : -1)
    .filter((i) => i >= 0);
  const retriedIdx = [];
  for (const i of failedIdx) {
    try {
      stripResults[i] = await transcribeBuffer(cut.strips[i].buffer, {
        model: opts.model, apiKey: opts.apiKey, mimeType: 'image/png',
        timeoutMs: opts.timeoutMs,
      });
      retriedIdx.push(i);
    } catch (err) {
      // Keep the original error record; we'll surface it as a warning
      // rather than failing the whole pipeline.
      stripResults[i] = { __error: err };
    }
  }
  const transcribeMs = Date.now() - stripStarted;

  // Only hard-fail if EVERY strip errored — otherwise the user gets
  // useful text for the strips that worked plus a warning listing the
  // ones that didn't. Failing on ANY error (the old behaviour) was
  // biting users on multi-strip pages where any single transient
  // Gemini error killed the whole run.
  const stillErrored = stripResults.filter((r) => r && r.__error);
  if (stillErrored.length === stripResults.length && stripResults.length > 0) {
    const first = stillErrored[0].__error;
    throw new Error('All strips failed to transcribe: ' + (first && first.message ? first.message : 'unknown error'));
  }

  const okResults = stripResults.map((r) => (r && !r.__error) ? r : { raw_text: '', suggestions: [] });
  const raw_text = okResults.map((r) => (r.raw_text || '').trim()).filter(Boolean).join('\n\n');
  const suggestions = mergeSuggestions(okResults.map((r) => r.suggestions || []));
  const costUsd = okResults.reduce((sum, r) => sum + (r.costUsd || 0), 0);

  return {
    raw_text, suggestions,
    wallMs: Date.now() - started, costUsd, mode: 'full',
    stages: {
      preprocessMs: pre.wallMs,
      stripCutMs: cut.wallMs,
      stripCount: cut.strips.length,
      transcribeMs,
      perStripMs: okResults.map((r) => r.wallMs || null),
    },
    meta: {
      deskewDeg: pre.meta.deskewDeg,
      detectedLines: cut.meta.detectedLines,
      fallbackUsed: cut.meta.fallbackUsed,
      failedStripCount: stillErrored.length,
      retriedStripCount: retriedIdx.length,
      partial: stillErrored.length > 0,
    },
  };
}

module.exports = { runPipeline };
