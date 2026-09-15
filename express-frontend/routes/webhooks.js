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
const {
  upsertOverride,
  isEventProcessed,
  markEventProcessed,
  findFullSubscriptionByEmail,
} = require('../lib/user-entitlement-overrides-db');
const lifecycleEmails = require('../lib/email/templates/subscription-lifecycle');
const { sendEmail } = require('../lib/email/send');

/**
 * Fire-and-forget email helper — we always 200 the webhook regardless
 * of whether the email sent, because Dodo shouldn't retry the whole
 * event just because Resend is briefly down. Failures are logged.
 */
async function safeSendLifecycleEmail(template, email, opts) {
  try {
    const { subject, html } = template(Object.assign({ email }, opts));
    const result = await sendEmail({ to: email, subject, html });
    console.log('[DODO-WEBHOOK] email', { to: email, subject, ok: result.ok, transport: result.transport });
  } catch (err) {
    console.warn('[DODO-WEBHOOK] email send threw:', err.message);
  }
}

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
    auto_renew:          event.auto_renew,
    amount_cents:        event.amount_cents,
    currency:            event.currency,
    mode:                event.mode,
  });

  // --- 4. Idempotency check ------------------------------------------
  // Dodo retries any event until we 200. That means the same event id
  // can arrive twice if a previous 200 was lost in transit. Skip if
  // we've already fully processed it — upsertOverride is idempotent
  // for the primary grant/revoke, but re-issuing a renewal on the
  // same event would extend expires_at by another cycle (double-credit).
  const svixEventId = headers['webhook-id'] || headers['svix-id'] || event.id;
  if (svixEventId && await isEventProcessed(svixEventId)) {
    console.log('[DODO-WEBHOOK] duplicate event — skipping', { event_id: svixEventId, type: event.type });
    return res.status(200).send('ok');
  }

  // --- 5. Route by lifecycle bucket ---------------------------------
  const bucket = bucketize(event.type);
  if (bucket === 'noop') {
    console.log('[DODO-WEBHOOK] no-op event type:', event.type);
    if (svixEventId) await markEventProcessed(svixEventId, { eventType: event.type, outcome: 'noop' });
    return res.status(200).send('ok');
  }

  if (!event.email) {
    // We can't grant an entitlement without knowing WHO paid. Log the
    // full payload so we can adjust parseEvent() once we see it.
    console.warn('[DODO-WEBHOOK] no email extractable from payload — dumping raw for adjustment', {
      raw: event.raw,
    });
    if (svixEventId) await markEventProcessed(svixEventId, { eventType: event.type, outcome: 'error', detail: { reason: 'no_email' } });
    return res.status(200).send('ok');   // 200 so Dodo doesn't retry — we own the fix, not them
  }

  const ents = resolveEntitlements(event.product_id);

  if (bucket === 'activate') {
    // BEFORE upsert: check whether this is a first-time activation or
    // a recurring renewal — determines welcome-vs-renewal-success email.
    // Uses payment_status pre-upsert: absent-or-not-active = first-time.
    const existing = await findFullSubscriptionByEmail(event.email);
    const isFirstActivation = !existing || existing.payment_status !== 'active' || !existing.is_premium;

    // Extend expires_at to whatever Dodo says the next billing date is,
    // else default to 32 days out so premium never lapses even if we
    // miss a renewal event.
    const expiresAt = event.current_period_end || new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();
    const result = await upsertOverride({
      email:                event.email,
      is_premium:           true,
      entitlements:         ents.entitlements,
      plan_code:            ents.plan_code,
      plan_label:           ents.plan_label,
      expires_at:           expiresAt,
      next_renewal_at:      expiresAt,          // for auto-renew: this is when Dodo will charge again
      payment_status:       'active',
      auto_renew:           event.auto_renew !== false,
      dodo_customer_id:     event.customer_id || undefined,
      dodo_subscription_id: event.subscription_id || undefined,
      currency:             event.currency || undefined,
      amount_cents:         event.amount_cents || undefined,
      // Clear any previous cancellation flag — subscription is active again
      cancelled_at:         null,
      granted_by_email:     'dodo-webhook',
      notes:                `Dodo ${event.type} · event ${svixEventId || '<no-id>'} · product ${event.product_id || '<no-product>'} · mode ${event.mode || 'unknown'}`,
    });
    if (result.ok) {
      console.log('[DODO-WEBHOOK] ✅ ' + (isFirstActivation ? 'first-time granted' : 'renewed'), { email: event.email, plan: ents.plan_label, expires_at: expiresAt });
      // Fire the appropriate lifecycle email (fire-and-forget).
      safeSendLifecycleEmail(
        isFirstActivation ? lifecycleEmails.welcome : lifecycleEmails.renewalSuccess,
        event.email,
        {
          plan_label:      ents.plan_label,
          entitlements:    ents.entitlements,
          expires_at:      expiresAt,
          next_renewal_at: expiresAt,
          currency:        event.currency,
          amount_cents:    event.amount_cents,
        }
      );
      if (svixEventId) await markEventProcessed(svixEventId, { eventType: event.type, outcome: isFirstActivation ? 'welcomed' : 'renewed', detail: { email: event.email, plan: ents.plan_code } });
    } else {
      console.error('[DODO-WEBHOOK] ❌ grant failed', { email: event.email, error: result.error, detail: result.detail });
      // Do NOT mark processed on DB failure — let Dodo retry so we get another chance.
    }
    return res.status(200).send('ok');
  }

  if (bucket === 'payment_failed') {
    // Dunning: DON'T revoke premium. Dodo will retry the charge; we
    // just flag payment_status and let the customer know via email.
    const result = await upsertOverride({
      email:                event.email,
      payment_status:       'past_due',
      dodo_customer_id:     event.customer_id || undefined,
      dodo_subscription_id: event.subscription_id || undefined,
      notes:                `Dodo ${event.type} · event ${svixEventId || '<no-id>'}`,
    });
    if (result.ok) {
      console.log('[DODO-WEBHOOK] ⚠️  payment failed — grace period active', { email: event.email });
    }
    safeSendLifecycleEmail(lifecycleEmails.paymentFailed, event.email, {
      plan_label:       resolveEntitlements(event.product_id).plan_label,
      currency:         event.currency,
      amount_cents:     event.amount_cents,
      retry_at:         event.current_period_end,   // Dodo's own retry schedule
      grace_expires_at: null,                       // no hard grace date yet — Dodo controls retry window
    });
    if (svixEventId) await markEventProcessed(svixEventId, { eventType: event.type, outcome: 'payment_failed' });
    return res.status(200).send('ok');
  }

  if (bucket === 'deactivate') {
    // IMPORTANT: for cancellation, DO NOT set expires_at to NOW. Customer
    // paid through the current period and expects access until it ends.
    // We flag cancelled_at + payment_status='cancelled' + auto_renew=false
    // and leave expires_at ALONE. The middleware will still honor the
    // override until expires_at passes naturally.
    //
    // For explicit "expired" or "failed" events (as opposed to
    // "cancelled" which is a soft flag), the semantics differ — those
    // DO cut premium right now.
    const isSoftCancel = /cancel(?:led|ed)?$/i.test(event.type || '');
    const patch = {
      email:                event.email,
      auto_renew:           false,
      payment_status:       isSoftCancel ? 'cancelled' : 'expired',
      cancelled_at:         new Date().toISOString(),
      dodo_customer_id:     event.customer_id || undefined,
      dodo_subscription_id: event.subscription_id || undefined,
      notes:                `Dodo ${event.type} · event ${svixEventId || '<no-id>'} · product ${event.product_id || '<no-product>'}`,
    };
    // Hard-expire only for non-cancel deactivation events (expired/failed/paused).
    if (!isSoftCancel) {
      patch.is_premium = false;
      patch.expires_at = new Date().toISOString();
    }
    const result = await upsertOverride(patch);
    if (result.ok) {
      console.log('[DODO-WEBHOOK] 🚫 ' + (isSoftCancel ? 'cancellation flagged (premium stays until expires_at)' : 'hard-expired'), { email: event.email, reason: event.type });
      // Only send cancellation email on soft cancel — hard expiration
      // usually follows a series of already-sent dunning emails, and a
      // "cancelled" email on hard expiration reads like whiplash.
      if (isSoftCancel) {
        // Need to know the current expires_at to tell the customer
        // when their access ends. Re-fetch since our patch didn't set it.
        const current = await findFullSubscriptionByEmail(event.email);
        safeSendLifecycleEmail(lifecycleEmails.cancellation, event.email, {
          plan_label:  ents.plan_label,
          expires_at:  current && current.expires_at,
        });
      }
      if (svixEventId) await markEventProcessed(svixEventId, { eventType: event.type, outcome: isSoftCancel ? 'cancelled' : 'revoked' });
    } else {
      console.error('[DODO-WEBHOOK] ❌ deactivate failed', { email: event.email, error: result.error });
    }
    return res.status(200).send('ok');
  }

  if (bucket === 'refund') {
    // Only refund.succeeded actually revokes — refund.created is a
    // pending refund that may still fail, and refund.failed means the
    // money didn't come back. In both non-succeeded cases we log and
    // 200 without touching the entitlement.
    //
    // Kept the email side of "your refund is complete" for a follow-up:
    // Dodo already sends its own refund confirmation, and doubling up on
    // that is user-hostile. If we ever want a ProofTamil-branded note
    // we can add it here in a targeted way.
    const isSucceeded = /^refund\.(?:succeeded|completed|processed)$/i.test(event.type || '');
    if (!isSucceeded) {
      console.log('[DODO-WEBHOOK] refund event received (not succeeded — no revoke)', {
        type: event.type, email: event.email,
      });
      if (svixEventId) await markEventProcessed(svixEventId, { eventType: event.type, outcome: 'refund_ignored' });
      return res.status(200).send('ok');
    }

    // Refund succeeded — revoke premium immediately. Same shape as
    // the hard-expire path in the deactivate bucket: is_premium=false,
    // expires_at=now, plus payment_status='refunded' and cancelled_at
    // so support can distinguish "refunded" from "cancelled voluntarily"
    // in the row.
    const nowIso = new Date().toISOString();
    const result = await upsertOverride({
      email:                event.email,
      is_premium:           false,
      expires_at:           nowIso,
      payment_status:       'refunded',
      cancelled_at:         nowIso,
      auto_renew:           false,
      dodo_customer_id:     event.customer_id || undefined,
      dodo_subscription_id: event.subscription_id || undefined,
      notes:                `Dodo ${event.type} · event ${svixEventId || '<no-id>'}${event.amount_cents ? ` · amount ${event.amount_cents} ${event.currency || ''}` : ''}`.trim(),
    });
    if (result.ok) {
      console.log('[DODO-WEBHOOK] 💸 refund succeeded — premium revoked', { email: event.email, type: event.type });
      if (svixEventId) await markEventProcessed(svixEventId, { eventType: event.type, outcome: 'refunded' });
    } else {
      // Don't mark processed on write failure — let Dodo retry so we
      // eventually catch up. Same pattern as the activate bucket.
      console.error('[DODO-WEBHOOK] ❌ refund revoke write failed', { email: event.email, error: result.error });
    }
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
