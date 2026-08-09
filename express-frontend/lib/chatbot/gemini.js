const { GoogleGenAI } = require('@google/genai');

const {
  CHAT_MODEL_ID,
  EMBED_BATCH_SIZE,
  EMBED_MAX_RETRIES,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  MAX_OUTPUT_TOKENS,
} = require('./config');

/** Server-side Gemini client. GOOGLE_GENAI_API_KEY never leaves the server. */

let cached = null;

function getGenAI() {
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY missing. Required for the chatbot.');

  cached = new GoogleGenAI({ apiKey });
  return cached;
}

/* ------------------------------------------------------------------ retries */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(error) {
  if (!error) return false;
  if (typeof error.status === 'number') return RETRYABLE_STATUS.has(error.status);

  const message = String(error.message || error);
  return /\b(429|500|502|503|504)\b|rate limit|quota|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    message,
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(label, fn) {
  let lastError;

  for (let attempt = 0; attempt <= EMBED_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === EMBED_MAX_RETRIES || !isRetryable(error)) break;

      // Full jitter: a fixed backoff would make every batch in a parallel
      // ingest retry in lockstep and re-trigger the 429.
      const ceiling = Math.min(1000 * 2 ** attempt, 30000);
      await sleep(Math.random() * ceiling);
    }
  }

  throw new Error(
    `${label} failed after ${EMBED_MAX_RETRIES + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/* --------------------------------------------------------------- embeddings */

/**
 * L2-normalise so cosine similarity is a plain dot product.
 *
 * gemini-embedding-001 returns UNNORMALISED vectors when truncated below 3072
 * dims, which silently skews similarity. Doing it here makes every model
 * behave identically.
 */
function normalize(vector) {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;

  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return vector;

  return vector.map((value) => value / magnitude);
}

async function embedChunk(texts, taskType) {
  const response = await withRetry(`embedContent(${texts.length} texts)`, () =>
    getGenAI().models.embedContent({
      model: EMBEDDING_MODEL_ID,
      contents: texts,
      config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
    }),
  );

  const embeddings = response.embeddings || [];
  if (embeddings.length !== texts.length) {
    throw new Error(
      `Embedding count mismatch: sent ${texts.length}, received ${embeddings.length}. ` +
        `Check that EMBEDDING_MODEL_ID="${EMBEDDING_MODEL_ID}" is available to your API key.`,
    );
  }

  return embeddings.map((embedding, index) => {
    const values = embedding.values;
    if (!values || !values.length) {
      throw new Error(`Embedding ${index} came back empty from ${EMBEDDING_MODEL_ID}.`);
    }
    if (values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: got ${values.length}, expected ${EMBEDDING_DIMENSIONS}. ` +
          `schema.sql declares vector(${EMBEDDING_DIMENSIONS}) — the two must agree.`,
      );
    }
    return normalize(values);
  });
}

/** Embed a single string. Used for the live query on every chat turn. */
async function embedText(text, taskType) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('embedText called with empty text.');

  const [embedding] = await embedChunk([trimmed], taskType);
  return embedding;
}

/**
 * Embed many strings, batched. Sequential rather than parallel: ingestion is a
 * background job where staying under the rate limit matters more than
 * wall-clock, and serial batches make the 429 backoff actually effective.
 */
async function embedBatch(texts, taskType, onProgress) {
  const results = [];

  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    results.push(...(await embedChunk(batch, taskType)));
    if (onProgress) onProgress(Math.min(start + EMBED_BATCH_SIZE, texts.length), texts.length);
  }

  return results;
}

/* --------------------------------------------------------------- generation */

/**
 * Stream a reply. Returns an async iterable of text deltas so the route can
 * forward them straight into its NDJSON response without buffering.
 */
async function streamChat(systemInstruction, history) {
  const stream = await getGenAI().models.generateContentStream({
    model: CHAT_MODEL_ID,
    contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    config: {
      systemInstruction,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Low but non-zero: grounded support answers should be near-deterministic
      // while still reading like prose rather than a lookup table.
      temperature: 0.3,
    },
  });

  async function* deltas() {
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  }

  return deltas();
}

module.exports = { getGenAI, embedText, embedBatch, streamChat };
