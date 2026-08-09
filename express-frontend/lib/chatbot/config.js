/**
 * Central tunables for the ProofTamil chatbot.
 *
 * Every value is env-overridable so behaviour can be tuned in production
 * without a redeploy. Nothing secret lives here.
 */

function num(raw, fallback) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/* ------------------------------------------------------------------ models */

/**
 * Flash-tier chat model. The -lite variants are cheaper but noticeably weaker
 * in Tamil, which is the whole product here.
 */
const CHAT_MODEL_ID = process.env.CHAT_MODEL_ID || 'gemini-3.6-flash';

/**
 * IMPORTANT: changing this requires re-running ingestion with --force.
 * Vectors from two different models are not comparable, and mixing them
 * degrades retrieval silently rather than erroring.
 */
const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID || 'gemini-embedding-001';

/**
 * Both embedding models emit 3072 dimensions by default and support
 * Matryoshka truncation. 768 keeps retrieval quality, cuts storage 4x, and
 * stays under pgvector's 2000-dim ceiling for HNSW indexes.
 *
 * MUST match the vector(N) dimension in schema.sql.
 */
const EMBEDDING_DIMENSIONS = num(process.env.EMBEDDING_DIMENSIONS, 768);

/* --------------------------------------------------------------- retrieval */

const RAG_TOP_K = num(process.env.RAG_TOP_K, 6);

/**
 * Cosine similarity floor. Below this a chunk is dropped rather than fed to
 * the model — an empty context is what makes the bot say "I'm not sure"
 * instead of confabulating, which is the behaviour we want for pricing.
 */
const RAG_MIN_SCORE = Number(process.env.RAG_MIN_SCORE || 0.35);
const RAG_MAX_CONTEXT_CHARS = num(process.env.RAG_MAX_CONTEXT_CHARS, 12000);

/* ---------------------------------------------------------------- ingestion */

const CHUNK_TARGET_TOKENS = num(process.env.CHUNK_TARGET_TOKENS, 700);
const CHUNK_OVERLAP_RATIO = Number(process.env.CHUNK_OVERLAP_RATIO || 0.15);
const CHUNK_MIN_CHARS = num(process.env.CHUNK_MIN_CHARS, 120);
const EMBED_BATCH_SIZE = num(process.env.EMBED_BATCH_SIZE, 32);
const EMBED_MAX_RETRIES = num(process.env.EMBED_MAX_RETRIES, 5);

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://www.prooftamil.com';
const SITEMAP_URL = process.env.SITEMAP_URL || `${SITE_ORIGIN}/sitemap.xml`;

/* ------------------------------------------------------------------ limits */

const MAX_MESSAGE_CHARS = num(process.env.MAX_MESSAGE_CHARS, 2000);
const MAX_HISTORY_MESSAGES = num(process.env.MAX_HISTORY_MESSAGES, 12);
const MAX_OUTPUT_TOKENS = num(process.env.MAX_OUTPUT_TOKENS, 1024);

/* -------------------------------------------------------------- rate limits */

const RATE_LIMIT_IP_CAPACITY = num(process.env.RATE_LIMIT_IP_CAPACITY, 30);
const RATE_LIMIT_IP_WINDOW_MS = num(process.env.RATE_LIMIT_IP_WINDOW_MS, 60000);
const RATE_LIMIT_SESSION_CAPACITY = num(process.env.RATE_LIMIT_SESSION_CAPACITY, 15);
const RATE_LIMIT_SESSION_WINDOW_MS = num(process.env.RATE_LIMIT_SESSION_WINDOW_MS, 60000);

/* ------------------------------------------------------------------- leads */

const LEAD_NOTIFY_TO =
  process.env.LEAD_NOTIFY_TO || process.env.CONTACT_TO_EMAIL || 'contact@prooftamil.com';

module.exports = {
  CHAT_MODEL_ID,
  EMBEDDING_MODEL_ID,
  EMBEDDING_DIMENSIONS,
  RAG_TOP_K,
  RAG_MIN_SCORE,
  RAG_MAX_CONTEXT_CHARS,
  CHUNK_TARGET_TOKENS,
  CHUNK_OVERLAP_RATIO,
  CHUNK_MIN_CHARS,
  EMBED_BATCH_SIZE,
  EMBED_MAX_RETRIES,
  SITE_ORIGIN,
  SITEMAP_URL,
  MAX_MESSAGE_CHARS,
  MAX_HISTORY_MESSAGES,
  MAX_OUTPUT_TOKENS,
  RATE_LIMIT_IP_CAPACITY,
  RATE_LIMIT_IP_WINDOW_MS,
  RATE_LIMIT_SESSION_CAPACITY,
  RATE_LIMIT_SESSION_WINDOW_MS,
  LEAD_NOTIFY_TO,
};
