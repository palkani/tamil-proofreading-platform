import 'server-only';

import { GoogleGenAI } from '@google/genai';

import {
  CHAT_MODEL_ID,
  EMBED_BATCH_SIZE,
  EMBED_MAX_RETRIES,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  MAX_OUTPUT_TOKENS,
} from './config';

/**
 * Server-side Gemini client.
 *
 * `server-only` guarantees GOOGLE_GENAI_API_KEY can never be pulled into a
 * client bundle: importing this from a client component fails the build.
 */

let cached: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY missing. Required for the chatbot.');
  }

  cached = new GoogleGenAI({ apiKey });
  return cached;
}

/**
 * Retrieval embeddings are asymmetric: the query and the document must be
 * embedded with different task types or recall drops measurably.
 */
export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/* ------------------------------------------------------------------ retries */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { status?: number }).status;
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status);

  // The SDK surfaces some transport failures as bare messages with the code
  // embedded, so fall back to sniffing rather than giving up on a retry.
  const message = String((error as Error).message ?? error);
  return /\b(429|500|502|503|504)\b|rate limit|quota|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    message,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= EMBED_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === EMBED_MAX_RETRIES || !isRetryable(error)) break;

      // Exponential backoff with full jitter — a fixed backoff would make every
      // batch in a parallel ingest retry in lockstep and re-trigger the 429.
      const ceiling = Math.min(1_000 * 2 ** attempt, 30_000);
      await sleep(Math.random() * ceiling);
    }
  }

  throw new Error(`${label} failed after ${EMBED_MAX_RETRIES + 1} attempts: ${describe(lastError)}`);
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/* --------------------------------------------------------------- embeddings */

/**
 * L2-normalise so cosine similarity is a plain dot product.
 *
 * `gemini-embedding-001` returns UNNORMALISED vectors when truncated below
 * 3072 dims, which silently skews similarity scores. `gemini-embedding-2`
 * normalises for you. Doing it here makes both models behave identically.
 */
function normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;

  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return vector;

  return vector.map((value) => value / magnitude);
}

async function embedChunk(texts: string[], taskType: EmbedTaskType): Promise<number[][]> {
  const response = await withRetry(`embedContent(${texts.length} texts)`, () =>
    getGenAI().models.embedContent({
      model: EMBEDDING_MODEL_ID,
      contents: texts,
      config: {
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    }),
  );

  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(
      `Embedding count mismatch: sent ${texts.length}, received ${embeddings.length}. ` +
        `Check that EMBEDDING_MODEL_ID="${EMBEDDING_MODEL_ID}" is available to your API key.`,
    );
  }

  return embeddings.map((embedding, index) => {
    const values = embedding.values;
    if (!values?.length) {
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
export async function embedText(text: string, taskType: EmbedTaskType): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('embedText called with empty text.');

  const [embedding] = await embedChunk([trimmed], taskType);
  return embedding;
}

/**
 * Embed many strings, batched. Batches run sequentially rather than in
 * parallel: ingestion is a background job where staying under the rate limit
 * matters more than wall-clock, and serial batches make the 429 backoff
 * actually effective.
 */
export async function embedBatch(
  texts: string[],
  taskType: EmbedTaskType,
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const results: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    results.push(...(await embedChunk(batch, taskType)));
    onProgress?.(Math.min(start + EMBED_BATCH_SIZE, texts.length), texts.length);
  }

  return results;
}

/* --------------------------------------------------------------- generation */

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * Stream a reply. Returns an async iterable of text deltas so the API route can
 * forward them straight into its NDJSON response without buffering.
 */
export async function streamChat(
  systemInstruction: string,
  history: ChatTurn[],
): Promise<AsyncGenerator<string>> {
  const stream = await getGenAI().models.generateContentStream({
    model: CHAT_MODEL_ID,
    contents: history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    config: {
      systemInstruction,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Low but non-zero: grounded support answers should be near-deterministic,
      // while still reading like prose rather than a lookup table.
      temperature: 0.3,
    },
  });

  async function* deltas(): AsyncGenerator<string> {
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  return deltas();
}
