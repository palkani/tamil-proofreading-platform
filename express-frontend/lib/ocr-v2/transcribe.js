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
 */
async function runGemini(image, opts) {
  const model = opts.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: TRANSCRIPTION_PROMPT },
        { inline_data: { mime_type: image.mimeType, data: image.data } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 16384,
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

module.exports = { transcribeBaseline, transcribeBuffer };
