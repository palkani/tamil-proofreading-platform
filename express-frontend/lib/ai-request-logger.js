/**
 * Express → Go bridge for AI-request observability.
 *
 * The Go backend owns the ai_requests table and the admin dashboard.
 * Every Gemini call made in the Go proofreading path already logs
 * directly via observability.AILogger. This module extends that
 * coverage to Gemini calls made from Express (the workspace live
 * proofreader, the homepage demo, translate, analyze, rewrite, the
 * AI content writer) by POSTing one log entry per call to
 * /api/v1/internal/ai-log, which then feeds the same AILogger.
 *
 * After this ships, the admin dashboard becomes the single source of
 * truth for Gemini spend — no more blind spots like the 2026-09 abuse
 * incident where ~$200 was burned entirely through Express-layer calls
 * that never appeared in the dashboard's per-user attribution.
 *
 * Reliability posture:
 *   - Fire-and-forget: never awaited on the response path.
 *   - Never throws: an observability failure must not affect the user.
 *   - Short timeout (3s): won't tie up a Node worker if the backend is
 *     slow. A dropped log is better than a slow response.
 *   - Silent no-op when EXPRESS_INTERNAL_TOKEN is unset (dev / preview).
 */

const axios = require('axios');

// Resolve the backend URL. BACKEND_URL is normalized to end in /api/v1
// in routes/{auth,api,index}.js — that suffix is what handlers expect
// when they append bare paths like /submit or /auth/login. Here we do
// the same, then append /internal/ai-log.
const RESOLVED_BACKEND_URL = (() => {
  const raw = (process.env.BACKEND_URL || 'https://api.prooftamil.com').replace(/\/+$/, '');
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
})();

const AI_LOG_ENDPOINT = `${RESOLVED_BACKEND_URL}/internal/ai-log`;
const INTERNAL_TOKEN = String(process.env.EXPRESS_INTERNAL_TOKEN || '').trim();

// Bound the volume we log at once — a single request can't produce
// thousands of Gemini calls, but we still want a safety cap so a bug
// somewhere upstream can't turn this into a DDOS of our own backend.
const MAX_TOKENS_PER_ENTRY = 10_000_000;

/**
 * POST one row to /api/v1/internal/ai-log. Returns quickly; the caller
 * should not await unless it wants to sequence logs (usually a mistake).
 *
 * @param {object} entry
 * @param {string} [entry.request_id]
 * @param {string} entry.email          The signed-in user's email; empty for anon calls.
 * @param {string} entry.model          e.g. "gemini-2.5-flash"
 * @param {string} [entry.model_version]
 * @param {string} entry.status         One of the observability.AIStatus* values.
 * @param {boolean} [entry.cache_hit]
 * @param {number} entry.input_tokens
 * @param {number} entry.output_tokens
 * @param {number} [entry.total_tokens]
 * @param {number} entry.latency_ms
 * @param {string} [entry.error_type]
 * @param {string} [entry.country_code]
 */
async function logAIRequest(entry) {
  // If the shared secret isn't configured, don't attempt the call. This
  // is the expected state in dev / preview and any misconfigured
  // deployment; the backend would 401 anyway. Log once for triage.
  if (!INTERNAL_TOKEN) {
    if (!logAIRequest._warnedMissingToken) {
      console.warn('[AI-LOG] EXPRESS_INTERNAL_TOKEN not set — Gemini calls made from Express will NOT appear in the admin dashboard.');
      logAIRequest._warnedMissingToken = true;
    }
    return;
  }

  // Clamp obviously-broken values so a single bad row can't blow out
  // the cost totals in the admin dashboard.
  const safe = {
    request_id: String(entry.request_id || ''),
    email: String(entry.email || ''),
    provider: 'gemini',
    model: String(entry.model || 'gemini-2.5-flash'),
    model_version: String(entry.model_version || ''),
    status: String(entry.status || 'ok'),
    cache_hit: !!entry.cache_hit,
    input_tokens: Math.max(0, Math.min(MAX_TOKENS_PER_ENTRY, Number(entry.input_tokens) || 0)),
    output_tokens: Math.max(0, Math.min(MAX_TOKENS_PER_ENTRY, Number(entry.output_tokens) || 0)),
    total_tokens: Math.max(0, Math.min(MAX_TOKENS_PER_ENTRY, Number(entry.total_tokens) || 0)),
    latency_ms: Math.max(0, Math.floor(Number(entry.latency_ms) || 0)),
    error_type: String(entry.error_type || ''),
    country_code: String(entry.country_code || '').toUpperCase().slice(0, 2),
  };

  try {
    await axios.post(AI_LOG_ENDPOINT, safe, {
      headers: {
        'Content-Type': 'application/json',
        'X-Job-Secret': INTERNAL_TOKEN,
      },
      timeout: 3000,
      validateStatus: () => true,
    });
  } catch (err) {
    // Never throw — observability must not break the response path.
    // Log to Cloud Run so operators can spot a broken bridge during
    // rollout; downgrade to debug once we trust the pipe.
    console.warn('[AI-LOG] POST /internal/ai-log failed:', err.message);
  }
}

module.exports = { logAIRequest };
