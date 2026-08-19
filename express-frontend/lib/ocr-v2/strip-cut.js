// Horizontal strip cutter — CommonJS for Express runtime.
// See services/ocr-v2/src/strip-cut.ts for design notes.
//
// Detects text-line gaps via horizontal ink projection, cuts the
// image into ~4-line strips with 24px padding. The transcription
// call fans out per-strip so each region gets Gemini's full attention.

const sharp = require('sharp');

function smooth(arr, window) {
  if (window <= 0) return arr.slice();
  const n = arr.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0, count = 0;
    for (let k = -window; k <= window; k++) {
      const j = i + k;
      if (j >= 0 && j < n) { sum += arr[j]; count++; }
    }
    out[i] = sum / count;
  }
  return out;
}

function findInkRuns(projection, threshold) {
  const runs = [];
  let inRun = false, runStart = 0;
  for (let i = 0; i < projection.length; i++) {
    const isInk = projection[i] >= threshold;
    if (isInk && !inRun) { inRun = true; runStart = i; }
    else if (!isInk && inRun) {
      inRun = false;
      if (i - runStart >= 2) runs.push([runStart, i]);
    }
  }
  if (inRun && projection.length - runStart >= 2) runs.push([runStart, projection.length]);
  return runs;
}

function groupLinesIntoStrips(runs, linesPerStrip, imageHeight, padPx) {
  if (runs.length === 0) return [];
  const strips = [];
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
 * Cut an image (file path or Buffer) into horizontal strips at detected
 * text-line gaps. Falls back to whole-image if no lines detected.
 */
async function cutIntoStrips(input, opts = {}) {
  const started = Date.now();
  const linesPerStrip = opts.linesPerStrip || 4;
  const inkThreshold = opts.inkThreshold || 0.15;
  const smoothingWindow = opts.smoothingWindow || 5;
  const padPx = opts.strippadPx || 24;

  const srcBuf = typeof input === 'string'
    ? await require('node:fs/promises').readFile(input)
    : input;

  const meta = await sharp(srcBuf, { failOn: 'none' }).metadata();
  const imageWidth = meta.width || 0;
  const imageHeight = meta.height || 0;

  const { data: grayPixels, info: grayInfo } = await sharp(srcBuf, { failOn: 'none' })
    .grayscale().raw().toBuffer({ resolveWithObject: true });

  const rowSums = new Array(grayInfo.height).fill(0);
  let maxRowSum = 0;
  for (let y = 0; y < grayInfo.height; y++) {
    let sum = 0;
    const base = y * grayInfo.width;
    for (let x = 0; x < grayInfo.width; x++) sum += 255 - grayPixels[base + x];
    rowSums[y] = sum;
    if (sum > maxRowSum) maxRowSum = sum;
  }

  const smoothed = smooth(rowSums, smoothingWindow);
  const absThreshold = maxRowSum * inkThreshold;
  const runs = findInkRuns(smoothed, absThreshold);

  if (runs.length === 0 || imageHeight === 0 || imageWidth === 0) {
    const wholeBuf = await sharp(srcBuf, { failOn: 'none' }).png().toBuffer();
    return {
      strips: [{ buffer: wholeBuf, index: 0, yStart: 0, yEnd: imageHeight, lineCount: 0 }],
      wallMs: Date.now() - started,
      meta: { imageWidth, imageHeight, detectedLines: 0, fallbackUsed: true },
    };
  }

  const stripDefs = groupLinesIntoStrips(runs, linesPerStrip, imageHeight, padPx);

  const strips = [];
  for (let i = 0; i < stripDefs.length; i++) {
    const def = stripDefs[i];
    const height = def.yEnd - def.yStart;
    if (height <= 0) continue;
    const stripBuf = await sharp(srcBuf, { failOn: 'none' })
      .extract({ left: 0, top: def.yStart, width: imageWidth, height })
      .png().toBuffer();
    strips.push({ buffer: stripBuf, index: i, yStart: def.yStart, yEnd: def.yEnd, lineCount: def.lineCount });
  }

  return {
    strips,
    wallMs: Date.now() - started,
    meta: { imageWidth, imageHeight, detectedLines: runs.length, fallbackUsed: false },
  };
}

module.exports = { cutIntoStrips };
