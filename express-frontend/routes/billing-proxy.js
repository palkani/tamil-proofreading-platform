/**
 * Express-side proxy for /api/v1/billing/me and /api/v1/billing/usage/today.
 *
 * Why this exists
 * ───────────────
 * Backend GET /api/v1/billing/me and GET /api/v1/billing/usage/today are
 * the two endpoints every frontend surface consults to decide whether
 * a user is Pro. They live in the Go backend, which has no visibility
 * into the Supabase admin_user_entitlement_overrides table where
 * Lite grants and admin comps live.
 *
 * Tier 1 of the entitlement audit fixed each affected surface one at
 * a time (workspace pill, DOCX gate, OCR middleware, AI writer quota,
 * /pro-access, /billing/success, /account/export) by consulting the
 * merged view case-by-case. This proxy is Tier 2 — it moves the merge
 * into a SINGLE spot so any NEW surface that fetches /billing/me from
 * the client automatically sees the correct merged view without needing
 * its own workaround.
 *
 * vercel.json routes /api/v1/billing/me and /api/v1/billing/usage/today
 * to this Express handler; everything else under /api/v1/* still goes
 * straight to the Go backend via the next-priority rewrite.
 *
 * Contract
 * ────────
 * Response shape MUST match the raw backend responses byte-for-byte
 * apart from the override overlay, so no existing client needs a
 * change. Override overlays:
 *   /billing/me     → billing.is_premium, .entitlements, .plan_code
 *                      REPLACED from override when present.
 *   /usage/today    → is_pro REPLACED from override.is_premium; other
 *                      fields (credits, subscription_end_date, provider)
 *                      preserved from backend, since they're accurate
 *                      for the free-tier counter and, for override-only
 *                      users, would be irrelevant to a client that
 *                      already saw is_pro:true.
 *
 * Resilience
 * ──────────
 * Backend + override lookups run in parallel with a hard 5s timeout.
 * If the backend fails but the override exists, we synthesize a minimal
 * response so override-only Lite users survive a Cloud Run cold start
 * without a false demotion. If both fail, we 502 — never fabricate Pro
 * out of thin air.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const { findOverrideByEmail } = require('../lib/user-entitlement-overrides-db');

function backendBaseUrl() {
  return (
    process.env.BACKEND_URL || 'https://api.prooftamil.com'
  ).replace(/\/$/, '');
}

/**
 * Fetch backend + Supabase override in parallel. Returns
 *   { backendResp, override }
 * where either may be null on individual failure. The caller decides
 * how to combine them.
 *
 * Auth: accepts either the access_token cookie or an Authorization
 * Bearer header (mirrors middleware/auth.js's own precedence), so an
 * API client that uses one or the other continues to work.
 */
async function fetchBothInParallel(req, backendPath) {
  const cookieToken = req.cookies && req.cookies.access_token;
  const bearerHeader = req.headers.authorization && String(req.headers.authorization).startsWith('Bearer ')
    ? req.headers.authorization
    : null;
  const forwardAuth = bearerHeader || (cookieToken ? `Bearer ${cookieToken}` : null);
  const email = String((req.user && req.user.email) || '').toLowerCase().trim();
  const base = backendBaseUrl();

  const [backendResp, override] = await Promise.all([
    base
      ? axios
          .get(base + backendPath, {
            headers: forwardAuth ? { Authorization: forwardAuth } : {},
            timeout: 5000,
            validateStatus: () => true,
          })
          .catch((err) => {
            console.warn(`[billing-proxy] backend ${backendPath} error:`, err.message);
            return null;
          })
      : Promise.resolve(null),
    // Override lookup only for authenticated users — never leak Supabase
    // data for an anonymous request. If the user isn't authenticated the
    // backend will 401 this call anyway; we want that 401 forwarded
    // rather than a synthetic 502 or an override-fabricated 200.
    forwardAuth && email
      ? findOverrideByEmail(email).catch(() => null)
      : Promise.resolve(null),
  ]);

  return { backendResp, override };
}

// ─────────────────────────────────────────────────────────────────
// GET /api/v1/billing/me
// ─────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const { backendResp, override } = await fetchBothInParallel(req, '/api/v1/billing/me');

  if (backendResp) {
    // Preserve backend's status and content-type verbatim so existing
    // clients see identical wire behavior.
    res.status(backendResp.status);
    if (backendResp.headers['content-type']) {
      res.type(backendResp.headers['content-type']);
    }

    // Overlay override on 200 responses that carry a billing shape.
    if (
      backendResp.status === 200 &&
      backendResp.data &&
      backendResp.data.billing &&
      override
    ) {
      const merged = {
        ...backendResp.data,
        billing: {
          ...backendResp.data.billing,
          is_premium: override.is_premium,
          entitlements: override.entitlements,
          ...(override.plan_code ? { plan_code: override.plan_code } : {}),
        },
      };
      return res.send(merged);
    }

    return res.send(backendResp.data);
  }

  // Backend unreachable. If override exists, synthesize a minimal
  // response so override-only Lite users survive a backend outage.
  if (override) {
    return res.status(200).json({
      success: true,
      billing: {
        is_premium:   override.is_premium,
        entitlements: override.entitlements,
        plan_code:    override.plan_code || null,
      },
    });
  }

  // Nothing usable from either source. Return 503 (NOT 502) because
  // client-side retry logic in workspace.js explicitly retries on 503
  // (backend cold-start signal). Returning 502 would swallow that retry.
  return res.status(503).json({ status: 'starting', error: 'backend_unavailable' });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/v1/billing/usage/today
// Response may be a single object OR an array; both are handled.
// ─────────────────────────────────────────────────────────────────
router.get('/usage/today', async (req, res) => {
  const { backendResp, override } = await fetchBothInParallel(req, '/api/v1/billing/usage/today');

  if (backendResp) {
    res.status(backendResp.status);
    if (backendResp.headers['content-type']) {
      res.type(backendResp.headers['content-type']);
    }

    // Overlay is_pro only when override says premium AND backend says
    // free. Never demote a backend Pro user based on override — if
    // there's a conflict we err on the side of granting access.
    // (If the override says NOT premium — e.g. after a refund revoke —
    // we DO propagate that, because the refund path deliberately writes
    // is_premium:false to mark the entitlement revoked.)
    if (
      backendResp.status === 200 &&
      override &&
      backendResp.data
    ) {
      const overlayIsPro = override.is_premium;
      const overlay = (row) => ({
        ...row,
        is_pro: overlayIsPro,
      });
      if (Array.isArray(backendResp.data)) {
        return res.send(backendResp.data.map(overlay));
      }
      if (typeof backendResp.data === 'object' && backendResp.data !== null) {
        return res.send(overlay(backendResp.data));
      }
    }

    return res.send(backendResp.data);
  }

  // Backend unreachable — synthesize a minimal shape from the override
  // so client code (which expects an array) doesn't crash.
  if (override) {
    return res.status(200).json([
      {
        is_pro:                override.is_premium,
        credits_used:          0,
        credits_limit:         0,
        credits_remaining:     0,
        is_exhausted:          false,
        subscription_end_date: override.expires_at || null,
        raw_provider_status:   'active',
        user_tier:             override.is_premium ? 'pro' : 'free',
        subscription_status:   override.is_premium ? 'active' : 'inactive',
      },
    ]);
  }

  // Same 503 / status:starting shape as /me for consistency with the
  // client's cold-start retry logic.
  return res.status(503).json({ status: 'starting', error: 'backend_unavailable' });
});

module.exports = router;
