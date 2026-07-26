/**
 * v2 proofreading adapter.
 *
 * Serves /api/corrections from the ProofTamil v2 cascade (reached through the API
 * gateway), translating the v2 response into this endpoint's { success, corrections }
 * shape.
 *
 * FLAG-GATED by the PROOFREAD_V2_BASE env var:
 *   - unset  → disabled; the existing v1 Gemini path runs unchanged.
 *   - set    → corrections are served from v2 (e.g. https://api.prooftamil.com).
 *
 * SAFETY: any failure here returns null, and the caller falls back to the v1 path.
 * So enabling v2 can never make corrections worse than they are today — a v2 outage
 * degrades to the current behaviour instead of erroring.
 */
const axios = require('axios');

// v1's client renders spelling | grammar | punctuation. v2's richer taxonomy
// (sandhi / agreement / style) collapses to grammar; spelling maps straight through.
function mapType(v2Type) {
  return v2Type === 'spelling' ? 'spelling' : 'grammar';
}

/**
 * Fetch corrections for `text` from the v2 api and return them in v1 shape, or null
 * if v2 is unavailable or returned nothing usable (→ caller falls back to v1).
 *
 * @param {string} text  plain text to proofread
 * @param {string} base  v2 base URL, e.g. https://api.prooftamil.com
 * @returns {Promise<{success: boolean, corrections: Array}|null>}
 */
async function getV2Corrections(text, base) {
  const url = String(base).replace(/\/+$/, '') + '/api/v1/proofread';
  const started = Date.now();

  const resp = await axios.post(
    url,
    { text },
    {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
      // Handle non-2xx ourselves (return null → fall back) rather than throwing.
      validateStatus: () => true,
    },
  );

  const ms = Date.now() - started;

  // OBSERVABILITY: one line per request so the canary is visible in Vercel logs.
  // Grep `[v2]` to watch it — every request logs either an ok (with latency) or the
  // exact reason it fell back to v1. (Thrown network/timeout errors are logged by
  // the caller's catch.)
  if (resp.status !== 200) {
    console.warn(`[v2] proofread FALLBACK: non-200 (${resp.status}) in ${ms}ms`);
    return null;
  }
  if (!resp.data || !Array.isArray(resp.data.suggestions)) {
    console.warn(`[v2] proofread FALLBACK: unexpected response shape in ${ms}ms`);
    return null;
  }

  const corrections = resp.data.suggestions
    .filter((s) => s && s.original && s.suggestion)
    .map((s) => ({
      blockId: '',
      originalText: s.original,
      correction: s.suggestion,
      reason: s.explanation || '',
      type: mapType(s.type),
    }));

  console.log(`[v2] proofread OK: ${corrections.length} correction(s) in ${ms}ms`);

  // `engine` lets callers/UI see which path served the response (visible in the
  // Network tab); v1's client ignores unknown fields.
  return { success: true, corrections, engine: 'v2' };
}

module.exports = { getV2Corrections };
