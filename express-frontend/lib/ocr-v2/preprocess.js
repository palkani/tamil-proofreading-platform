// Image preprocessing before OCR — CommonJS for Express runtime.
// See services/ocr-v2/src/preprocess.ts for design notes.
//
// Pipeline: EXIF-orient → long-edge cap (2200px) → grayscale
// → deskew (rotation-search ±3° pick highest ink-projection variance)
// → normalize + gamma 1.1 → sharpen → PNG output.
//
// Runs on Vercel serverless. Sharp is preinstalled in the express
// project. Typical latency: 200-500ms per page.

const sharp = require('sharp');
const { readFile } = require('node:fs/promises');

/** Horizontal ink-projection variance — higher = more aligned. */
async function projectionVariance(buffer) {
  const { data, info } = await sharp(buffer).grayscale().raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rowSums = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) sum += 255 - data[base + x];
    rowSums[y] = sum;
  }
  const mean = rowSums.reduce((a, b) => a + b, 0) / height;
  let variance = 0;
  for (const s of rowSums) variance += (s - mean) * (s - mean);
  return variance / height;
}

async function findDeskewAngle(buffer, rangeDeg, stepDeg) {
  const small = await sharp(buffer).resize({ width: 400, withoutEnlargement: true }).toBuffer();
  let bestAngle = 0, bestScore = -Infinity;
  for (let deg = -rangeDeg; deg <= rangeDeg; deg += stepDeg) {
    let rotated;
    if (deg === 0) rotated = small;
    else rotated = await sharp(small)
      .rotate(deg, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    const score = await projectionVariance(rotated);
    if (score > bestScore) { bestScore = score; bestAngle = deg; }
  }
  return bestAngle;
}

/**
 * Preprocess an image (file path or Buffer) for OCR. Returns
 * { buffer, mimeType, wallMs, meta }. Pure — no source mutation.
 */
async function preprocessImage(input, opts = {}) {
  const started = Date.now();
  const maxLongEdge = opts.maxLongEdge || 2200;
  const deskewRange = opts.deskewRangeDeg || 3;
  const deskewStep = opts.deskewStepDeg || 0.5;

  const src = typeof input === 'string' ? await readFile(input) : input;

  let img = sharp(src, { failOn: 'none' }).rotate();
  const meta1 = await img.metadata();

  const w0 = meta1.width || 0;
  const h0 = meta1.height || 0;
  if (Math.max(w0, h0) > maxLongEdge) {
    if (w0 >= h0) img = img.resize({ width: maxLongEdge, withoutEnlargement: true });
    else          img = img.resize({ height: maxLongEdge, withoutEnlargement: true });
  }
  let workingBuf = await img.toBuffer();

  let deskewDeg = 0;
  if (!opts.skipDeskew) {
    deskewDeg = await findDeskewAngle(workingBuf, deskewRange, deskewStep);
    if (Math.abs(deskewDeg) > 0.01) {
      workingBuf = await sharp(workingBuf)
        .rotate(deskewDeg, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toBuffer();
    }
  }

  const { data, info } = await sharp(workingBuf)
    .grayscale()
    .normalize()
    .gamma(1.1)
    .sharpen({ sigma: 0.8 })
    .png({ compressionLevel: 6 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: 'image/png',
    wallMs: Date.now() - started,
    meta: {
      originalWidth: w0,
      originalHeight: h0,
      finalWidth: info.width,
      finalHeight: info.height,
      deskewDeg,
    },
  };
}

module.exports = { preprocessImage };
