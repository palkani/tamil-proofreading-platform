/**
 * Central tunables for the ProofTamil chatbot.
 *
 * Every value is env-overridable so behaviour can be tuned in production
 * without a redeploy. Nothing secret lives here — this module is safe to import
 * from anywhere. Secrets are read only inside `gemini.ts` / `supabaseAdmin.ts`,
 * both of which are `server-only`.
 */

function num(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/* ------------------------------------------------------------------ models */

/**
 * Flash-tier chat model. `gemini-3.6-flash` balances latency against the
 * bilingual quality this bot needs — Tamil replies degrade noticeably on the
 * -lite tiers, which is the whole product here.
 */
export const CHAT_MODEL_ID = process.env.CHAT_MODEL_ID ?? 'gemini-3.6-flash';

/**
 * `gemini-embedding-001` is the GA embedding model. `gemini-embedding-2` is
 * newer and auto-normalises truncated vectors, but is preview-tier; switch via
 * env once it is GA in your project.
 *
 * IMPORTANT: changing this means re-running `npm run ingest` from scratch.
 * Vectors from two different models are not comparable, and mixing them
 * silently degrades retrieval rather than erroring.
 */
export const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID ?? 'gemini-embedding-001';

/**
 * Both embedding models emit 3072 dimensions by default and support
 * Matryoshka truncation to 768/1536/3072. 768 is the sweet spot: it keeps
 * retrieval quality, cuts storage 4x, and stays under pgvector's 2000-dim
 * ceiling for HNSW/IVFFlat indexes (3072 cannot be indexed at all).
 *
 * MUST match the `vector(N)` dimension in schema.sql.
 */
export const EMBEDDING_DIMENSIONS = num(process.env.EMBEDDING_DIMENSIONS, 768);

/* --------------------------------------------------------------- retrieval */

export const RAG_TOP_K = num(process.env.RAG_TOP_K, 6);

/**
 * Cosine similarity floor for a chunk to be considered relevant. Below this the
 * chunk is dropped rather than fed to the model — an empty context is what
 * makes the bot say "I'm not sure" instead of confabulating, which is the
 * behaviour we actually want for pricing questions.
 */
export const RAG_MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.35);

/** Hard cap on context handed to the model, to bound both cost and latency. */
export const RAG_MAX_CONTEXT_CHARS = num(process.env.RAG_MAX_CONTEXT_CHARS, 12_000);

/* ---------------------------------------------------------------- ingestion */

export const CHUNK_TARGET_TOKENS = num(process.env.CHUNK_TARGET_TOKENS, 700);
export const CHUNK_OVERLAP_RATIO = Number(process.env.CHUNK_OVERLAP_RATIO ?? 0.15);
export const CHUNK_MIN_CHARS = num(process.env.CHUNK_MIN_CHARS, 120);

/** Gemini's embed endpoint accepts batches; 32 keeps us well inside limits. */
export const EMBED_BATCH_SIZE = num(process.env.EMBED_BATCH_SIZE, 32);
export const EMBED_MAX_RETRIES = num(process.env.EMBED_MAX_RETRIES, 5);

export const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://www.prooftamil.com';
export const SITEMAP_URL = process.env.SITEMAP_URL ?? `${SITE_ORIGIN}/sitemap.xml`;

/* ------------------------------------------------------------------ limits */

export const MAX_MESSAGE_CHARS = num(process.env.MAX_MESSAGE_CHARS, 2_000);
/** Turns of history retained. Older turns are trimmed oldest-first. */
export const MAX_HISTORY_MESSAGES = num(process.env.MAX_HISTORY_MESSAGES, 12);
export const MAX_OUTPUT_TOKENS = num(process.env.MAX_OUTPUT_TOKENS, 1_024);

/* -------------------------------------------------------------- rate limits */

export const RATE_LIMIT_IP_CAPACITY = num(process.env.RATE_LIMIT_IP_CAPACITY, 30);
export const RATE_LIMIT_IP_WINDOW_MS = num(process.env.RATE_LIMIT_IP_WINDOW_MS, 60_000);
export const RATE_LIMIT_SESSION_CAPACITY = num(process.env.RATE_LIMIT_SESSION_CAPACITY, 15);
export const RATE_LIMIT_SESSION_WINDOW_MS = num(process.env.RATE_LIMIT_SESSION_WINDOW_MS, 60_000);

/* ------------------------------------------------------------------- leads */

export const LEAD_NOTIFY_TO = process.env.LEAD_NOTIFY_TO ?? 'contact@prooftamil.com';
