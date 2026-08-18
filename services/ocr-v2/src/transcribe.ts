// Baseline transcriber — single Gemini vision call, whole image, no
// preprocessing. Returns { raw_text, suggestions[] } via structured
// JSON output.
//
// Design notes:
//
// - responseMimeType: "application/json" is Gemini's own JSON-mode
//   toggle. Guarantees valid JSON output — no markdown fences, no
//   preamble. If the model can't satisfy the schema it errors instead
//   of returning garbage, which is what we want at the OCR boundary.
//
// - The prompt lives in ./prompt.ts so the schema and instructions
//   are colocated and version-controlled together. Every subsequent
//   phase (preprocess+strips, 2-pass consensus, layout blocks) reuses
//   this prompt; only the pipeline around it changes.
//
// - The response shape (OcrResponse from prompt.ts) is deliberately
//   flat and extensible: raw_text as a string, suggestions as an
//   array of records. Phase-2 layout work adds a `blocks` array
//   alongside these; phase-3 multi-provider adds a `passes` metadata
//   field. Existing consumers keep working.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TRANSCRIPTION_PROMPT, OcrResponse, OcrSuggestion } from './prompt.js';

export interface TranscribeOptions {
  model: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface TranscribeResult {
  raw_text: string;
  suggestions: OcrSuggestion[];
  wallMs: number;
  costUsd: number;
  raw?: unknown;   // full provider payload for debugging
}

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
 * Parse the model response. Belt-and-braces even though we request
 * JSON mode — some models occasionally still wrap in ```json fences
 * on the first token or emit a stray leading BOM.
 */
function parseOcrResponse(text: string): OcrResponse {
  if (!text || !text.trim()) {
    return { raw_text: '', suggestions: [] };
  }
  let cleaned = text.trim();
  // Strip markdown fences if the model got clever
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Strip UTF-8 BOM
  if (cleaned.charCodeAt(0) === 0xFEFF) cleaned = cleaned.slice(1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // If parsing fails, treat the whole response as raw_text and
    // return no suggestions. Better than throwing — the user still
    // sees the transcription in the UI.
    return { raw_text: text, suggestions: [] };
  }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const raw_text = typeof obj.raw_text === 'string' ? obj.raw_text : '';
  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map<OcrSuggestion>((s) => ({
          raw_word: String(s.raw_word ?? ''),
          suggested_word: String(s.suggested_word ?? ''),
          reason: String(s.reason ?? ''),
          confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0,
          context_before: s.context_before ? String(s.context_before) : undefined,
          context_after: s.context_after ? String(s.context_after) : undefined,
        }))
        .filter((s) => s.raw_word && s.suggested_word)
    : [];
  return { raw_text, suggestions };
}

/**
 * Baseline: single Gemini vision call, structured JSON output.
 * Returns raw_text + suggestions + wall clock + best-effort cost.
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
          { text: TRANSCRIPTION_PROMPT },
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
      temperature: 0,           // determinism — reruns should agree
      maxOutputTokens: 8192,    // ~20 pages of dense Tamil; plenty of room for JSON + suggestions
      responseMimeType: 'application/json',
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

  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const { raw_text, suggestions } = parseOcrResponse(rawText);

  const inTokens = payload.usageMetadata?.promptTokenCount ?? 0;
  const outTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;
  const costUsd = (inTokens * 0.075 + outTokens * 0.30) / 1_000_000;

  return { raw_text, suggestions, wallMs, costUsd, raw: payload };
}
