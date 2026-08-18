// Horizontal strip cutter. Cuts a preprocessed page image into
// horizontal strips at the gaps between text lines. The transcription
// call is then run once per strip in parallel — each strip gets the
// model's full attention rather than sharing it across the whole page.
//
// This is the SINGLE BIGGEST expected win in phase 2 per the phase-0
// analysis: silently-dropped side content (date boxes, marginal
// notes, dense sub-lines) was the main source of accuracy loss on
// image 1, and strip cutting forces the model to look at each region
// separately.
//
// Algorithm:
//
//   1. Read the preprocessed grayscale image + get its raw pixels.
//   2. Compute the horizontal ink projection (sum of ink weight per row).
//   3. Smooth the projection with a small box filter (~5 rows) to
//      remove single-row noise spikes from ruled paper or ink drift.
//   4. Find contiguous "ink" runs (rows with projection above a
//      threshold) — these are text lines.
//   5. Group consecutive text lines into strips, targeting ~4-5 lines
//      per strip (heuristic: enough content for the model to have
//      context, not so much that attention dilutes).
//   6. Cut the ORIGINAL image at the strip boundaries and return
//      buffers.
//
// Falls back gracefully: if we can't detect any text (blank page,
// pure image content, misfire), returns the whole image as one strip
// so the pipeline still transcribes something.

import sharp from 'sharp';

export interface StripCutOptions {
  /** Target lines per strip. Default 5. */
  linesPerStrip?: number;
  /** Threshold (0..1) of max-ink-per-row above which a row counts as "ink". Default 0.15. */
  inkThreshold?: number;
  /** Smoothing window in rows for the projection. Default 5. */
  smoothingWindow?: number;
  /** Padding around each strip in pixels (safety margin). Default 12. */
  strippadPx?: number;
}

export interface Strip {
  buffer: Buffer;     // PNG bytes of the strip
  index: number;      // 0-based, reading order
  yStart: number;     // pixel row in the original image where this strip starts
  yEnd: number;       // pixel row where it ends
  lineCount: number;  // number of detected text lines in this strip
}

export interface StripCutResult {
  strips: Strip[];
  wallMs: number;
  meta: {
    imageWidth: number;
    imageHeight: number;
    detectedLines: number;
    fallbackUsed: boolean;   // true if we couldn't segment and returned the whole image
  };
}

/**
 * Simple 1D box-filter smoothing. Averages each row's value with its
 * `window` neighbors on each side. Preserves the peaks-and-troughs
 * shape of the projection while killing single-row noise.
 */
function smooth(arr: number[], window: number): number[] {
  if (window <= 0) return arr.slice();
  const n = arr.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -window; k <= window; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        sum += arr[j];
        count++;
      }
    }
    out[i] = sum / count;
  }
  return out;
}

/**
 * Given a smoothed projection and an ink threshold, find contiguous
 * runs of "ink" rows. Each run is one text line. Returns [yStart, yEnd]
 * pairs (inclusive/exclusive).
 */
function findInkRuns(projection: number[], threshold: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let inRun = false;
  let runStart = 0;
  for (let i = 0; i < projection.length; i++) {
    const isInk = projection[i] >= threshold;
    if (isInk && !inRun) {
      inRun = true;
      runStart = i;
    } else if (!isInk && inRun) {
      inRun = false;
      // Require minimum line height (2px) to filter noise
      if (i - runStart >= 2) runs.push([runStart, i]);
    }
  }
  if (inRun && projection.length - runStart >= 2) {
    runs.push([runStart, projection.length]);
  }
  return runs;
}

/**
 * Group consecutive text lines into strips, targeting `linesPerStrip`
 * lines per strip. Returns [yStart, yEnd] pairs (with padding) that
 * cover each strip's row range in the original image.
 */
function groupLinesIntoStrips(
  runs: Array<[number, number]>,
  linesPerStrip: number,
  imageHeight: number,
  padPx: number
): Array<{ yStart: number; yEnd: number; lineCount: number }> {
  if (runs.length === 0) return [];
  const strips: Array<{ yStart: number; yEnd: number; lineCount: number }> = [];
  for (let i = 0; i < runs.length; i += linesPerStrip) {
    const group = runs.slice(i, i + linesPerStrip);
    if (group.length === 0) continue;
    const firstStart = group[0][0];
    const lastEnd = group[group.length - 1][1];
    strips.push({
      yStart: Math.max(0, firstStart - padPx),
      yEnd:   Math.min(imageHeight, lastEnd + padPx),
      lineCount: group.length,
    });
  }
  return strips;
}

/**
 * Cut a preprocessed grayscale (or color) image into horizontal strips
 * at the detected text-line gaps. Input can be a file path or a
 * pre-loaded buffer.
 */
export async function cutIntoStrips(
  input: string | Buffer,
  opts: StripCutOptions = {}
): Promise<StripCutResult> {
  const started = Date.now();
  const linesPerStrip = opts.linesPerStrip ?? 5;
  const inkThreshold = opts.inkThreshold ?? 0.15;
  const smoothingWindow = opts.smoothingWindow ?? 5;
  const padPx = opts.strippadPx ?? 12;

  // Load original for cropping.
  const srcBuf = typeof input === 'string'
    ? await (async () => { const { promises: fs } = await import('node:fs'); return fs.readFile(input); })()
    : input;

  const src = sharp(srcBuf, { failOn: 'none' });
  const meta = await src.metadata();
  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;

  // Compute projection on a grayscale copy — SEPARATE from the buffer
  // we'll use for actual cropping, so the original color/format is
  // preserved in the output strips.
  const { data: grayPixels, info: grayInfo } = await sharp(srcBuf, { failOn: 'none' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rowSums = new Array<number>(grayInfo.height).fill(0);
  let maxRowSum = 0;
  for (let y = 0; y < grayInfo.height; y++) {
    let sum = 0;
    const base = y * grayInfo.width;
    for (let x = 0; x < grayInfo.width; x++) {
      sum += 255 - grayPixels[base + x];
    }
    rowSums[y] = sum;
    if (sum > maxRowSum) maxRowSum = sum;
  }

  // Smooth then threshold. inkThreshold is a fraction of max row sum
  // so the same value works across pages of different sizes.
  const smoothed = smooth(rowSums, smoothingWindow);
  const absThreshold = maxRowSum * inkThreshold;
  const runs = findInkRuns(smoothed, absThreshold);

  // Fallback: no ink detected (blank page, or the ink density is too
  // uniform to segment). Return the whole image as one strip so the
  // pipeline still produces output.
  if (runs.length === 0 || imageHeight === 0 || imageWidth === 0) {
    const wholeBuf = await sharp(srcBuf, { failOn: 'none' }).png().toBuffer();
    return {
      strips: [{
        buffer: wholeBuf,
        index: 0,
        yStart: 0,
        yEnd: imageHeight,
        lineCount: 0,
      }],
      wallMs: Date.now() - started,
      meta: {
        imageWidth,
        imageHeight,
        detectedLines: 0,
        fallbackUsed: true,
      },
    };
  }

  const stripDefs = groupLinesIntoStrips(runs, linesPerStrip, imageHeight, padPx);

  // Now actually extract each strip from the original image.
  const strips: Strip[] = [];
  for (let i = 0; i < stripDefs.length; i++) {
    const def = stripDefs[i];
    const height = def.yEnd - def.yStart;
    if (height <= 0) continue;
    const stripBuf = await sharp(srcBuf, { failOn: 'none' })
      .extract({ left: 0, top: def.yStart, width: imageWidth, height })
      .png()
      .toBuffer();
    strips.push({
      buffer: stripBuf,
      index: i,
      yStart: def.yStart,
      yEnd: def.yEnd,
      lineCount: def.lineCount,
    });
  }

  return {
    strips,
    wallMs: Date.now() - started,
    meta: {
      imageWidth,
      imageHeight,
      detectedLines: runs.length,
      fallbackUsed: false,
    },
  };
}
