// Gemini vision transcription — CommonJS version for Express runtime.
// See services/ocr-v2/src/transcribe.ts for design notes.
//
// Exposes two entry points:
//   transcribeBaseline(imagePath, opts)  — file input, single Gemini call
//   transcribeBuffer(buffer, opts)       — buffer input, used by pipeline
//     for individual strip transcription (no filesystem round-trip)
//
// Both flow through runGemini() so the request shape, JSON parsing,
// error handling, and cost calc stay in one place.

const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { TRANSCRIPTION_PROMPT } = require('./prompt');
const { DOCUMENT_PROMPT } = require('./documentPrompt');

async function readImage(imagePath) {
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

function sniffMime(buf) {
  if (buf.length >= 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}

/**
 * Parse Gemini's response — belt-and-braces even though we request
 * responseMimeType: application/json. Handles occasional markdown
 * fences + partial JSON when the model hits maxOutputTokens.
 */
function parseOcrResponse(text) {
  if (!text || !text.trim()) return { raw_text: '', suggestions: [] };
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  if (cleaned.charCodeAt(0) === 0xFEFF) cleaned = cleaned.slice(1);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Truncated JSON — try to salvage partial raw_text so the user
    // still sees something rather than a total failure.
    console.warn('[ocr-v2/transcribe] JSON parse failed, likely truncated. length:', text.length, 'last 200:', text.slice(-200));
    const rawMatch = cleaned.match(/"raw_text"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (rawMatch) {
      const partial = rawMatch[1]
        .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return { raw_text: partial + '\n\n[⚠️ Response was truncated — try again]', suggestions: [] };
    }
    return { raw_text: text, suggestions: [] };
  }
  const obj = parsed && typeof parsed === 'object' ? parsed : {};
  const raw_text = typeof obj.raw_text === 'string' ? obj.raw_text : '';
  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({
          raw_word: String(s.raw_word || ''),
          suggested_word: String(s.suggested_word || ''),
          reason: String(s.reason || ''),
          confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0,
          context_before: s.context_before ? String(s.context_before) : undefined,
          context_after: s.context_after ? String(s.context_after) : undefined,
        }))
        .filter((s) => s.raw_word && s.suggested_word)
    : [];
  return { raw_text, suggestions };
}

/**
 * Actual Gemini call. Shared by both file-input and buffer-input paths.
 *
 * opts.prompt         optional — defaults to TRANSCRIPTION_PROMPT (prose)
 * opts.maxTokens      optional — defaults to 16384 (prose). Document
 *                     mode passes 24576 because forms + tables + full
 *                     fields[] extraction can be denser than prose.
 * opts.parser         optional — defaults to parseOcrResponse. Document
 *                     mode passes parseDocumentResponse.
 */
async function runGemini(image, opts) {
  const model = opts.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: opts.prompt || TRANSCRIPTION_PROMPT },
        { inline_data: { mime_type: image.mimeType, data: image.data } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: opts.maxTokens || 16384,
      responseMimeType: 'application/json',
    },
  };

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 60_000);

  let response;
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

  const payload = await response.json();
  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const { raw_text, suggestions } = parseOcrResponse(rawText);

  const inTokens = payload.usageMetadata?.promptTokenCount || 0;
  const outTokens = payload.usageMetadata?.candidatesTokenCount || 0;
  const costUsd = (inTokens * 0.075 + outTokens * 0.30) / 1_000_000;

  return { raw_text, suggestions, wallMs, costUsd, raw: payload };
}

async function transcribeBaseline(imagePath, opts) {
  if (!opts.apiKey) throw new Error('transcribeBaseline: apiKey required');
  const image = await readImage(imagePath);
  return runGemini(image, opts);
}

async function transcribeBuffer(imageBuffer, opts) {
  if (!opts.apiKey) throw new Error('transcribeBuffer: apiKey required');
  const mimeType = opts.mimeType || sniffMime(imageBuffer);
  return runGemini({ mimeType, data: imageBuffer.toString('base64') }, opts);
}

/**
 * Parse the document-mode Gemini response — different shape than
 * prose transcription: no `suggestions[]` (typo-flagging doesn't
 * apply to forms) and instead a `fields[]` of extracted labeled
 * values with confidence. Salvage logic matches parseOcrResponse:
 * if the JSON is truncated we still recover partial raw_text.
 */
function parseDocumentResponse(text) {
  if (!text || !text.trim()) return { raw_text: '', fields: [], suggestions: [] };
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  if (cleaned.charCodeAt(0) === 0xFEFF) cleaned = cleaned.slice(1);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn('[ocr-v2/transcribe] Document JSON parse failed, likely truncated. length:', text.length, 'last 200:', text.slice(-200));
    const rawMatch = cleaned.match(/"raw_text"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (rawMatch) {
      const partial = rawMatch[1]
        .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return { raw_text: partial + '\n\n[⚠️ Response was truncated — try again]', fields: [], suggestions: [] };
    }
    return { raw_text: text, fields: [], suggestions: [] };
  }
  const obj = parsed && typeof parsed === 'object' ? parsed : {};
  const raw_text = typeof obj.raw_text === 'string' ? obj.raw_text : '';
  const fields = Array.isArray(obj.fields)
    ? obj.fields
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          label: String(f.label || '').slice(0, 200),
          value: String(f.value || '').slice(0, 500),
          confidence: (['high', 'medium', 'low'].includes(String(f.confidence)))
            ? String(f.confidence) : 'medium',
          hint: f.hint ? String(f.hint).slice(0, 100) : '',
        }))
        .filter((f) => f.label && f.value)
    : [];
  // Suggestions always [] for document mode (form fields aren't typos).
  // Keeping the field in the payload preserves the shape existing UI
  // code assumes so the raw-text panel + copy button behave the same.
  return { raw_text, fields, suggestions: [] };
}

/**
 * Whole-page document transcription — used by pipeline mode='document'.
 * Skips strip-cutting (bad idea for forms/tables), sends the full
 * preprocessed image in a single call with the form-aware prompt +
 * a higher output-token cap, and parses the fields[]-shape response.
 */
async function transcribeDocumentBuffer(imageBuffer, opts) {
  if (!opts.apiKey) throw new Error('transcribeDocumentBuffer: apiKey required');
  const mimeType = opts.mimeType || sniffMime(imageBuffer);
  // Merge over runGemini defaults: swap prompt to DOCUMENT_PROMPT and
  // bump the output-token budget. Everything else (model, timeout,
  // temperature) inherits from the caller.
  const result = await runGemini(
    { mimeType, data: imageBuffer.toString('base64') },
    { ...opts, prompt: DOCUMENT_PROMPT, maxTokens: 24576 }
  );
  // runGemini returned via parseOcrResponse (prose shape); re-parse
  // the raw payload text via the document parser to get fields[].
  const docParsed = parseDocumentResponse(
    result.raw?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  );
  return {
    raw_text: docParsed.raw_text,
    fields: docParsed.fields,
    suggestions: docParsed.suggestions,
    wallMs: result.wallMs,
    costUsd: result.costUsd,
    raw: result.raw,
  };
}

module.exports = { transcribeBaseline, transcribeBuffer, transcribeDocumentBuffer };
