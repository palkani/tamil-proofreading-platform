const { GoogleGenAI } = require('@google/genai');

const {
  CHAT_MODEL_ID,
  EMBED_BATCH_SIZE,
  EMBED_MAX_RETRIES,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  MAX_OUTPUT_TOKENS,
} = require('./config');

const { keyRotator } = require('../../utils/gemini-key-rotator');

/**
 * Server-side Gemini client. Keys never leave the server.
 *
 * Keys come from the app's existing rotator (utils/gemini-key-rotator.js), so
 * the chatbot uses the same GEMINI_API_KEY_1..N already configured in Vercel
 * as the rest of the site — no chatbot-specific key to add. The rotator also
 * falls back to AI_INTEGRATIONS_GEMINI_API_KEY, then GOOGLE_GENAI_API_KEY.
 *
 * Rotation matters here: these are free-tier keys with low RPM, and RAG
 * ingestion fires ~170 embedding calls in a burst. Spreading them across keys
 * and cooling down a key that 429s is the difference between an ingest that
 * completes and one that spends minutes in backoff.
 */

// One SDK client per key. Rebuilding it per request would be wasteful, but a
// single cached client cannot rotate — so cache by key instead.
const clients = new Map();

function clientFor(apiKey) {
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clients.set(apiKey, client);
  }
  return client;
}

/** @returns {{ client: GoogleGenAI, index: number }} */
function leaseClient() {
  const lease = keyRotator.getNextKey();
  if (!lease) {
    throw new Error(
      'No Gemini API key configured. Set GEMINI_API_KEY_1 (and optionally _2, _3) ' +
        'or GOOGLE_GENAI_API_KEY.',
    );
  }
  return { client: clientFor(lease.key), index: lease.index };
}

/** Exposed for the health check and for tests. */
function getKeyStatus() {
  return keyRotator.getStatus();
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

function isRateLimit(error) {
  if (!error) return false;
  if (error.status === 429) return true;
  return /\b429\b|rate limit|quota|RESOURCE_EXHAUSTED/i.test(String(error.message || error));
}

/**
 * Retry with key rotation.
 *
 * A fresh key is leased per attempt, so a 429 moves to the next key rather
 * than sleeping on the exhausted one. Only when every key is cooling down does
 * the backoff actually cost wall-clock.
 */
async function withRetry(label, fn) {
  let lastError;

  for (let attempt = 0; attempt <= EMBED_MAX_RETRIES; attempt++) {
    const lease = leaseClient();

    try {
      return await fn(lease.client);
    } catch (error) {
      lastError = error;

      // Take the exhausted key out of rotation for its cooldown so sibling
      // calls in the same ingest do not immediately pick it again.
      if (isRateLimit(error)) keyRotator.markRateLimited(lease.index);

      if (attempt === EMBED_MAX_RETRIES || !isRetryable(error)) break;

      // Full jitter: a fixed backoff would make every batch in a parallel
      // ingest retry in lockstep and re-trigger the 429. Skipped when another
      // key is free, since rotating is instant.
      if (keyRotator.getAvailableKeyCount() === 0) {
        const ceiling = Math.min(1000 * 2 ** attempt, 30000);
        await sleep(Math.random() * ceiling);
      }
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
  const response = await withRetry(`embedContent(${texts.length} texts)`, (client) =>
    client.models.embedContent({
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
  const stream = await withRetry('generateContentStream', (client) =>
    client.models.generateContentStream({
      model: CHAT_MODEL_ID,
      contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      config: {
        systemInstruction,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Low but non-zero: grounded support answers should be near-deterministic
        // while still reading like prose rather than a lookup table.
        temperature: 0.3,
      },
    }),
  );

  async function* deltas() {
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  }

  return deltas();
}

module.exports = { leaseClient, getKeyStatus, embedText, embedBatch, streamChat };
