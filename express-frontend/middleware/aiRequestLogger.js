/**
 * Per-route Gemini observability middleware.
 *
 * Wraps a Gemini-calling route so that ONE ai_requests row is written
 * per HTTP request via the Express → Go bridge (lib/ai-request-logger).
 * The row lands in the same table used by direct Go-side logging, so
 * the admin dashboard's per-user attribution and cost totals cover
 * every Gemini call — no more gap where Express-layer calls (the
 * workspace live proofreader, the homepage demo, the AI content
 * writer) were silently outside the ledger.
 *
 * How handlers cooperate with this middleware
 * ───────────────────────────────────────────
 * The middleware installs `req.aiUsage = { inputTokens, outputTokens,
 * calls, cacheHit }` before the handler runs. After every Gemini
 * response the handler adds this snippet (already applied to
 * /corrections and /gemini/analyze, extend to any new route):
 *
 *   const u = response.data?.usageMetadata;
 *   if (u) {
 *     req.aiUsage.inputTokens  += Number(u.promptTokenCount     || 0);
 *     req.aiUsage.outputTokens += Number(u.candidatesTokenCount || 0);
 *     req.aiUsage.calls        += 1;
 *   }
 *
 * The middleware reads req.aiUsage in res.on('finish') and posts the
 * cumulative totals to /api/v1/internal/ai-log — Gemini itself supplies
 * exact token counts on every generateContent response, so the cost
 * calculated Go-side is exact, not an estimate.
 *
 * Requests that never reach a Gemini call (auth 401, quota 429 before
 * the call, early client 400) are NOT logged — the goal is to track
 * spend, not to fill the table with rejections.
 */

const { logAIRequest } = require('../lib/ai-request-logger');

/**
 * @param {object} opts
 * @param {string} opts.model  Canonical model name for the cost table;
 *                              e.g. "gemini-2.5-flash". Matches the
 *                              switch in observability/ai_logger.go.
 */
function aiRequestLogger(opts = {}) {
  const model = opts.model || 'gemini-2.5-flash';

  return (req, res, next) => {
    const start = Date.now();

    // Reuse an inbound request id if the platform stamped one, otherwise
    // synthesize a short id so failures can still be correlated in the
    // admin "recent failures" panel.
    const requestId = String(
      req.headers['x-request-id'] ||
      req.headers['x-vercel-id'] ||
      `express-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    ).slice(0, 64);

    // Handler updates these after each Gemini response. Initialised so
    // handlers can `+=` without null checks.
    req.aiUsage = {
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      cacheHit: false,
    };

    res.on('finish', () => {
      const latencyMs = Date.now() - start;

      // Auth failures (401/403) or explicit rate-limit rejections that
      // fired BEFORE the handler reached a Gemini call are not spend
      // and belong nowhere in the ledger. The `calls` counter is the
      // authoritative "we actually called Gemini" signal.
      if (req.aiUsage.calls === 0 && !req.aiUsage.cacheHit) return;

      let status;
      if (res.statusCode === 429)                              status = 'rate_limited';
      else if (res.statusCode === 408 || res.statusCode === 504) status = 'timeout';
      else if (res.statusCode >= 500)                          status = 'api_error';
      else if (res.statusCode >= 400)                          status = 'invalid_response';
      else if (req.aiUsage.cacheHit && req.aiUsage.calls === 0) status = 'cache_hit';
      else                                                     status = 'ok';

      const email = String(
        req.authUser?.email || req.user?.email || ''
      ).toLowerCase().trim();

      logAIRequest({
        request_id: requestId,
        email,
        model,
        status,
        cache_hit: req.aiUsage.cacheHit,
        input_tokens: req.aiUsage.inputTokens,
        output_tokens: req.aiUsage.outputTokens,
        total_tokens: req.aiUsage.inputTokens + req.aiUsage.outputTokens,
        latency_ms: latencyMs,
        country_code: String(req.headers['x-vercel-ip-country'] || '').toUpperCase(),
      });
    });

    next();
  };
}

module.exports = aiRequestLogger;
