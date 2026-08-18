// Baseline transcriber — a single Gemini vision call on the whole image,
// no preprocessing, no strip cutting, no consensus. This is deliberately
// dumb so the phase-0 baseline number reflects what the previous OCR
// pipeline shipped before we took the feature down. Every later phase
// (preprocessing, tiling, N-pass consensus, lexicon repair) has to beat
// this to justify its cost.
//
// Providers are pluggable but only Gemini is wired today (our existing
// key rotator + billing account, cheapest per token). Adding Claude /
// GPT-4o is a follow-up when we know they buy something over the baseline.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface TranscribeOptions {
  /** Model ID, e.g. "gemini-2.5-flash". */
  model: string;
  /** Provider API key. If unset the call throws with a clear message. */
  apiKey: string;
  /** Request timeout in milliseconds. Default 60_000. */
  timeoutMs?: number;
}

export interface TranscribeResult {
  text: string;
  wallMs: number;
  costUsd: number;   // best-effort estimate; 0 if we can't derive it
  raw?: unknown;     // raw provider response for debugging
}

/**
 * Read a local image file and return { mimeType, base64 } for provider
 * upload. Only formats real users upload: jpg, jpeg, png, webp, heic.
 * (HEIC is common from iPhone photos of handwritten notes.)
 */
async function readImage(imagePath: string): Promise<{ mimeType: string; data: string }> {
  const buf = await readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase().replace('.', '');
  const mimeType =
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'heic' ? 'image/heic' :
    'application/octet-stream';
  return { mimeType, data: buf.toString('base64') };
}

/**
 * Baseline transcription prompt. Deliberately plain — no JSON schema, no
 * block structure. This matches what "single-pass vision LLM" typically
 * produces without extra scaffolding. Later phases layer on the
 * structured-output prompt from the plan doc.
 *
 * We DO explicitly instruct:
 *   - Preserve English/Tanglish/numbers verbatim (do not transliterate)
 *   - Emit ⟨?⟩ for illegible text (don't hallucinate)
 * because these are baseline defensive asks — omitting them makes the
 * baseline artificially worse and skews later comparisons.
 */
const BASELINE_PROMPT = `You are transcribing handwritten Tamil text from an image.

Return the text exactly as written, preserving line breaks and paragraph structure.

Rules:
1. Output Tamil in Tamil Unicode (do NOT transliterate).
2. Preserve English words, Tanglish, numbers, dates, URLs, and formulae verbatim in their original script — do NOT translate or transliterate them.
3. If any portion is illegible, output ⟨?⟩ for that word instead of guessing.
4. Do not add commentary, translations, or explanations. Return only the transcribed text.
5. Preserve line breaks; use a blank line between paragraphs.`;

/**
 * Baseline: single Gemini vision call, no preprocessing. Returns
 * transcribed text + wall-clock + best-effort cost estimate.
 *
 * Cost calc uses published rates (as of writing): gemini-2.5-flash at
 * $0.075/1M input + $0.30/1M output tokens. Image tokens are counted
 * against input. We don't have exact token counts unless the response
 * usage metadata includes them; falls back to 0 if unavailable.
 */
export async function transcribeBaseline(
  imagePath: string,
  opts: TranscribeOptions
): Promise<TranscribeResult> {
  if (!opts.apiKey) {
    throw new Error('transcribeBaseline: GEMINI_API_KEY (or opts.apiKey) is required');
  }
  const image = await readImage(imagePath);
  const model = opts.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: BASELINE_PROMPT },
          {
            inline_data: {
              mime_type: image.mimeType,
              data: image.data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      // Determinism — comparing runs needs low variance.
      temperature: 0,
      // Handwriting output is usually short; cap so we don't wait forever
      // on a hallucination loop. 8k tokens ≈ 20 pages of dense Tamil.
      maxOutputTokens: 8192,
    },
  };

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const wallMs = Date.now() - started;

  if (!response.ok) {
    const err = await response.text().catch(() => '(no body)');
    throw new Error(`Gemini ${response.status}: ${err.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Best-effort cost — gemini-2.5-flash pricing per Google's public
  // rate card. Wrong-by-a-factor at worst; still useful for relative
  // comparison across pipeline variants.
  const inTokens = payload.usageMetadata?.promptTokenCount ?? 0;
  const outTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;
  const costUsd = (inTokens * 0.075 + outTokens * 0.30) / 1_000_000;

  return { text, wallMs, costUsd, raw: payload };
}
