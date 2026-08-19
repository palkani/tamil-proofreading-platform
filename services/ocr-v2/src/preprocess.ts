// Image preprocessing for OCR. Runs BEFORE the transcription call.
//
// What each stage does and why (measured impact from the phase-0 tests):
//
//   1. EXIF-based auto-orient — phone photos land in landscape when
//      they're really portrait until the EXIF orientation is applied.
//      Cheap, always correct.
//
//   2. Long-edge cap (2200px) — Gemini and other vision models tile
//      and downsample internally. Sending a 4K photo doesn't help;
//      it just costs more tokens and more downsampling. Cap keeps
//      us in the model's sweet spot.
//
//   3. Grayscale — Tamil handwriting is (almost) always monochrome
//      ink on paper. Color channels add noise without adding signal.
//      Also halves the byte count.
//
//   4. Deskew — rotate through candidate angles (±3° in 0.5° steps)
//      and pick the one whose horizontal ink projection is most
//      peaked (highest variance = clearest line separations = best
//      alignment). A 3° tilt on ruled paper measurably hurts strip
//      cutting downstream, so this is a big win.
//
//   5. Contrast normalization + gentle gamma — recovers faint pencil
//      strokes and evens out shadow gradients from phone photos.
//
//   6. Sharpen — subtle edge enhancement. Especially useful for
//      ambiguous vowel-signs on cursive handwriting.
//
// Deliberately NOT included (would help but risky at v1):
//   - Line-removal filter (Hough transform for ruled paper) — can
//     accidentally erase parts of Tamil letters. Would need per-page
//     tuning. Deferred to a later phase.
//   - Adaptive binarization — Gemini vision handles grayscale well;
//     binarizing loses information the model can use.
//   - Perspective correction — the ~5° skew our deskew handles
//     covers most phone photos. Serious perspective distortion is
//     rare enough to defer.

import sharp from 'sharp';
import { promises as fs } from 'node:fs';

export interface PreprocessOptions {
  /** Max long-edge in pixels. Default 2200. */
  maxLongEdge?: number;
  /** Search range for deskew, in degrees. Default 3. */
  deskewRangeDeg?: number;
  /** Step size for deskew search, in degrees. Default 0.5. */
  deskewStepDeg?: number;
  /** Skip deskew (faster; use only if you know the image is already square). */
  skipDeskew?: boolean;
}

export interface PreprocessResult {
  buffer: Buffer;              // preprocessed PNG bytes ready to send to a vision API
  mimeType: 'image/png';
  wallMs: number;
  meta: {
    originalWidth: number;
    originalHeight: number;
    finalWidth: number;
    finalHeight: number;
    deskewDeg: number;         // rotation angle applied (0 if skipped)
  };
}

/**
 * Compute the horizontal ink projection of a grayscale image — sum of
 * (255 - pixel) across each row. Text lines produce peaks; the gaps
 * between them are troughs. A well-aligned image has sharp peaks and
 * flat troughs; a tilted image smears both together.
 *
 * We use VARIANCE of the projection as the "how well aligned is this?"
 * score — higher variance = clearer separation. This is more robust
 * than peak-counting because it handles pages of varying line density.
 */
async function projectionVariance(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const rowSums = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) {
      sum += 255 - data[base + x];   // ink weight (dark = high)
    }
    rowSums[y] = sum;
  }
  // Variance of row sums — higher = more "peaky" = better aligned
  const mean = rowSums.reduce((a, b) => a + b, 0) / height;
  let variance = 0;
  for (const s of rowSums) variance += (s - mean) * (s - mean);
  return variance / height;
}

/**
 * Search for the best deskew angle in a bounded range. We try angles
 * on a DOWNSAMPLED copy (400px long edge) so the projection loop is
 * cheap — the winning angle applies to the full-res image at the end.
 */
async function findDeskewAngle(
  buffer: Buffer,
  rangeDeg: number,
  stepDeg: number
): Promise<number> {
  // Downsample for the search. Deskew accuracy is dominated by the
  // model's resolution ceiling, not our search precision.
  const small = await sharp(buffer)
    .resize({ width: 400, withoutEnlargement: true })
    .toBuffer();

  let bestAngle = 0;
  let bestScore = -Infinity;

  for (let deg = -rangeDeg; deg <= rangeDeg; deg += stepDeg) {
    let rotated: Buffer;
    if (deg === 0) {
      rotated = small;
    } else {
      rotated = await sharp(small)
        .rotate(deg, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toBuffer();
    }
    const score = await projectionVariance(rotated);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }
  return bestAngle;
}

/**
 * Preprocess an image file for OCR. Reads from disk, returns a buffer
 * ready to feed to the transcription API. Idempotent + pure — no
 * side effects on the source file.
 */
export async function preprocessImage(
  imagePath: string,
  opts: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const started = Date.now();
  const maxLongEdge = opts.maxLongEdge ?? 2200;
  const deskewRange = opts.deskewRangeDeg ?? 3;
  const deskewStep = opts.deskewStepDeg ?? 0.5;

  const src = await fs.readFile(imagePath);

  // Stage 1: rotate per EXIF orientation, then throw away EXIF (we
  // don't want vision models seeing camera metadata as a hint).
  let img = sharp(src, { failOn: 'none' }).rotate();
  const meta1 = await img.metadata();

  // Stage 2: cap long edge. Do this BEFORE deskew so the deskew
  // search operates on a smaller image (faster) and the final rotate
  // doesn't upscale post-crop artifacts.
  const w0 = meta1.width ?? 0;
  const h0 = meta1.height ?? 0;
  if (Math.max(w0, h0) > maxLongEdge) {
    if (w0 >= h0) {
      img = img.resize({ width: maxLongEdge, withoutEnlargement: true });
    } else {
      img = img.resize({ height: maxLongEdge, withoutEnlargement: true });
    }
  }
  let workingBuf = await img.toBuffer();

  // Stage 3: find deskew angle on a downsampled copy, then apply to
  // the full working image.
  let deskewDeg = 0;
  if (!opts.skipDeskew) {
    deskewDeg = await findDeskewAngle(workingBuf, deskewRange, deskewStep);
    if (Math.abs(deskewDeg) > 0.01) {
      workingBuf = await sharp(workingBuf)
        .rotate(deskewDeg, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toBuffer();
    }
  }

  // Stage 4: grayscale + contrast normalize + gentle gamma + sharpen.
  //   - .normalize() stretches the histogram to full 0-255 range,
  //     recovering faint pencil.
  //   - .gamma(1.1) darkens midtones slightly without crushing shadows.
  //   - .sharpen() bumps edge contrast on strokes.
  const finalPipeline = sharp(workingBuf)
    .grayscale()
    .normalize()
    .gamma(1.1)
    .sharpen({ sigma: 0.8 })
    .png({ compressionLevel: 6 });   // moderate compression — balance size vs decode time

  const { data, info } = await finalPipeline.toBuffer({ resolveWithObject: true });

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

/**
 * Convenience: preprocess and write to a new file. Used by the eval
 * harness so we can eyeball what the model actually sees.
 */
export async function preprocessToFile(
  imagePath: string,
  outPath: string,
  opts: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const result = await preprocessImage(imagePath, opts);
  await fs.writeFile(outPath, result.buffer);
  return result;
}
