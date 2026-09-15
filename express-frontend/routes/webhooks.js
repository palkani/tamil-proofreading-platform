/**
 * External webhook receivers.
 *
 * Mounted at /api/webhooks/* in create-app.js — BEFORE express.json()
 * so req.body is the raw Buffer we need for HMAC signature verification.
 *
 * Currently ships one endpoint:
 *   POST /api/webhooks/dodo   — Dodo Payments subscription lifecycle
 *
 * Design rules for webhook receivers:
 *   1. Always 200 as fast as possible so Dodo doesn't retry a request
 *      we've already processed (Dodo's timeout is short, ~10s).
 *   2. Verify HMAC signature before trusting anything in the body.
 *   3. Idempotent — same event delivered twice must not double-grant.
 *   4. Log EVERY event fully so we can iterate on parsing later.
 *   5. Never throw. All failure paths log and still 200 back (except
 *      401 for signature failure — that's the ONE case we WANT Dodo
 *      to know about so it stops retrying with the wrong secret).
 */

const express = require('express');
const router = express.Router();

const {
  verifySignature,
  parseEvent,
  resolveEntitlements,
  bucketize,
} = require('../lib/webhooks-dodo');
const { upsertOverride } = require('../lib/user-entitlement-overrides-db');

// express.raw preserves the request body as a Buffer — required for
// HMAC verification (JSON.stringify(parsed) wouldn't byte-match the
// bytes Dodo signed). Cap at 1 MB — Dodo payloads are typically <5 KB.
router.post('/dodo', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const rawBody = req.body;   // Buffer, thanks to express.raw
  const headers = req.headers || {};

  // --- 1. Log first, verify second, act third -----------------------
  // Log the shape of every incoming request BEFORE verification so we
  // can debug signature/parsing failures using Vercel logs.
  const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : String(rawBody || '');
  const bodyPreview = bodyText.slice(0, 2000);
  const seenHeaders = Object.keys(headers).filter((h) =>
    h.startsWith('dodo') || h.startsWith('webhook') || h.startsWith('svix') || h.startsWith('x-dodo')
  );
  console.log('[DODO-WEBHOOK] received', {
    ip:              req.headers['x-forwarded-for'] || req.ip,
    bodyBytes:       rawBody ? rawBody.length : 0,
    seenHeaders,
    bodyPreview,
  });

  // --- 2. Verify signature ------------------------------------------
  const secret = process.env.DODO_WEBHOOK_SECRET || '';
  const verify = verifySignature({ rawBody, headers, secret });
  if (!verify.ok) {
    console.warn('[DODO-WEBHOOK] signature verification FAILED', {
      reason:            verify.reason,
      secretConfigured:  !!secret,
      headerNames:       seenHeaders,
    });
    // If the secret isn't set at all we accept the event but log loudly
    // — this lets you TEST the endpoint from Dodo's dashboard "Send Test
    // Event" button before wiring the secret. In production you must
    // set DODO_WEBHOOK_SECRET; otherwise any random POST to this URL
    // would grant Pro to anyone.
    if (secret) {
      return res.status(401).send('signature verification failed');
    }
    console.warn('[DODO-WEBHOOK] ⚠️  proceeding without signature verification (DODO_WEBHOOK_SECRET is not set)');
  } else {
    console.log('[DODO-WEBHOOK] signature verified', { scheme: verify.scheme });
  }

  // --- 3. Parse ------------------------------------------------------
  const event = parseEvent(bodyText);
  if (event.parseError) {
    console.warn('[DODO-WEBHOOK] payload parse error', { parseError: event.parseError });
    return res.status(200).send('ok');   // still 200 — no point in retrying an unparseable event
  }
  console.log('[DODO-WEBHOOK] parsed', {
    type:                event.type,
    id:                  event.id,
    email:               event.email,
    product_id:          event.product_id,
    subscription_id:     event.subscription_id,
    current_period_end:  event.current_period_end,
    subscription_status: event.subscription_status,
    mode:                event.mode,
  });

  // --- 4. Route by lifecycle bucket ---------------------------------
  const bucket = bucketize(event.type);
  if (bucket === 'noop') {
    console.log('[DODO-WEBHOOK] no-op event type:', event.type);
    return res.status(200).send('ok');
  }

  if (!event.email) {
    // We can't grant an entitlement without knowing WHO paid. Log the
    // full payload so we can adjust parseEvent() once we see it.
    console.warn('[DODO-WEBHOOK] no email extractable from payload — dumping raw for adjustment', {
      raw: event.raw,
    });
    return res.status(200).send('ok');   // 200 so Dodo doesn't retry — we own the fix, not them
  }

  const ents = resolveEntitlements(event.product_id);

  if (bucket === 'activate') {
    // Extend expires_at to whatever Dodo says the next billing date is,
    // else default to 32 days out so premium never lapses even if we
    // miss a renewal event.
    const expiresAt = event.current_period_end || new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();
    const result = await upsertOverride({
      email:            event.email,
      is_premium:       true,
      entitlements:     ents.entitlements,
      plan_code:        ents.plan_code,
      plan_label:       ents.plan_label,
      expires_at:       expiresAt,
      granted_by_email: 'dodo-webhook',
      notes:            `Dodo ${event.type} · event ${event.id || '<no-id>'} · product ${event.product_id || '<no-product>'} · mode ${event.mode || 'unknown'}`,
    });
    if (result.ok) {
      console.log('[DODO-WEBHOOK] ✅ granted', { email: event.email, plan: ents.plan_label, expires_at: expiresAt });
    } else {
      console.error('[DODO-WEBHOOK] ❌ grant failed', { email: event.email, error: result.error, detail: result.detail });
    }
    return res.status(200).send('ok');
  }

  if (bucket === 'deactivate') {
    // Revoke: set expires_at to now so hasFeature() sees them as expired
    // immediately, but leave the row so audit trail is preserved.
    const result = await upsertOverride({
      email:            event.email,
      is_premium:       false,
      entitlements:     [],
      plan_code:        ents.plan_code,
      plan_label:       ents.plan_label + ' · cancelled',
      expires_at:       new Date().toISOString(),
      granted_by_email: 'dodo-webhook',
      notes:            `Dodo ${event.type} · event ${event.id || '<no-id>'} · product ${event.product_id || '<no-product>'}`,
    });
    if (result.ok) {
      console.log('[DODO-WEBHOOK] 🚫 revoked', { email: event.email, reason: event.type });
    } else {
      console.error('[DODO-WEBHOOK] ❌ revoke failed', { email: event.email, error: result.error });
    }
    return res.status(200).send('ok');
  }

  if (bucket === 'refund') {
    // Currently just logs — full refund handling (revoke immediately +
    // send email) is a follow-up. We 200 back so Dodo doesn't retry.
    console.log('[DODO-WEBHOOK] refund event received (no automatic action yet)', {
      type: event.type, email: event.email,
    });
    return res.status(200).send('ok');
  }

  return res.status(200).send('ok');
});

// GET on the same path returns a friendly message so you can eyeball
// the endpoint in a browser without triggering a 404 investigation.
router.get('/dodo', (req, res) => {
  res.status(200).type('text/plain').send(
    'ProofTamil Dodo webhook receiver — POST only. Configure Dodo dashboard to POST payment.* and subscription.* events here.'
  );
});

module.exports = router;
