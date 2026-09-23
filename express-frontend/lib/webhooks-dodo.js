/**
 * Dodo Payments webhook helpers.
 *
 * Two things happen here:
 *   1. verifySignature() — HMAC check against DODO_WEBHOOK_SECRET so we
 *      know the request actually came from Dodo (and not a random POST
 *      by anyone who guessed the URL).
 *   2. resolveEntitlements() — maps the Dodo product_id in the event
 *      payload to the ProofTamil entitlements array we need to grant.
 *
 * We haven't seen a real Dodo payload yet, so parseEvent() below is
 * DEFENSIVE — it tries several common field shapes (Dodo uses Svix
 * under the hood, plus their own top-level fields) and returns
 * whatever it can extract. Every incoming payload is logged in full
 * so we can adjust the parser once the first real event lands.
 */

const crypto = require('node:crypto');

// Product ID → entitlements. Source: your Dodo dashboard as of 2026-09-14.
// Update as you create new products. When a product ID isn't in this
// table, the webhook falls back to granting Full Pro (best guess —
// we know they paid, we just don't know exactly what for).
// 'ai_writer' removed 2026-09-19 with the rest of the AI Content Writer
// feature. Existing override rows may still carry it in their entitlements
// array — the app just doesn't reference it anywhere anymore, so the
// stale value is harmless. New subscriptions get the trimmed set below.
const PRODUCT_ENTITLEMENTS = {
  // ProofTamil LITE Monthly Subscription (INR ₹350/mo)
  'pdt_0NmSZ8Clcj8nUjpvixwq2': {
    is_premium:   true,
    entitlements: ['proofreading', 'export'],
    plan_code:    'PRO_PROOFREAD_LITE',
    plan_label:   'Pro · Proofreading Lite',
  },
  // ProofTamil PRO Monthly Subscription - INR (₹1000/mo)
  'pdt_0NaBiSUS25WJlwcnZquWu': {
    is_premium:   true,
    entitlements: ['proofreading', 'ocr', 'export'],
    plan_code:    'PRO_MONTHLY',
    plan_label:   'Pro',
  },
  // ProofTamil PRO Monthly Subscription ($12/mo USD)
  'pdt_0NZzVU00bGo2E4CcmyLoP': {
    is_premium:   true,
    entitlements: ['proofreading', 'ocr', 'export'],
    plan_code:    'PRO_MONTHLY',
    plan_label:   'Pro',
  },
};

const FULL_PRO_FALLBACK = {
  is_premium:   true,
  entitlements: ['proofreading', 'ocr', 'export'],
  plan_code:    'PRO_MONTHLY',
  plan_label:   'Pro (unmapped product — check product_id)',
};

/**
 * Verify HMAC signature on the raw request body.
 *
 * Dodo uses Svix for webhook delivery; Svix headers:
 *   webhook-id         unique event id
 *   webhook-timestamp  unix seconds
 *   webhook-signature  space-separated signatures, each "v1,<base64>"
 *
 * Signature payload: `${id}.${timestamp}.${rawBody}`
 * Algorithm: HMAC-SHA256, key = base64(secret without "whsec_" prefix)
 *
 * We also accept a simpler `HMAC-SHA256(secret, rawBody)` scheme in
 * case Dodo has a fallback signature format we don't know about.
 * Returns { ok, reason }.
 */
function verifySignature({ rawBody, headers, secret }) {
  if (!secret) return { ok: false, reason: 'secret_not_configured' };
  if (!rawBody) return { ok: false, reason: 'empty_body' };

  const webhookId        = headers['webhook-id'] || headers['svix-id'];
  const webhookTimestamp = headers['webhook-timestamp'] || headers['svix-timestamp'];
  const webhookSignature = headers['webhook-signature'] || headers['svix-signature'];

  // --- Try Svix-style verification first (Dodo's default) -----------
  if (webhookId && webhookTimestamp && webhookSignature) {
    const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : String(rawBody);
    const signedPayload = `${webhookId}.${webhookTimestamp}.${bodyText}`;
    const secretBytes = secret.startsWith('whsec_')
      ? Buffer.from(secret.slice(6), 'base64')
      : Buffer.from(secret, 'utf-8');
    const expected = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64');
    // Multiple v1 signatures may be listed space-separated; any match is OK.
    const provided = String(webhookSignature).split(' ')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('v1,'))
      .map((s) => s.slice(3));
    if (provided.some((sig) => timingSafeEqual(sig, expected))) {
      return { ok: true, scheme: 'svix' };
    }
    return { ok: false, reason: 'svix_signature_mismatch' };
  }

  // --- Fallback: simple HMAC of raw body against a hex header -------
  const rawSig = headers['dodo-signature'] || headers['x-dodo-signature'];
  if (rawSig) {
    const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf-8');
    const expected = crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');
    if (timingSafeEqual(String(rawSig), expected)) {
      return { ok: true, scheme: 'raw-hex' };
    }
    return { ok: false, reason: 'raw_signature_mismatch' };
  }

  return { ok: false, reason: 'no_signature_headers_found' };
}

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Try to extract the fields we need from a Dodo event payload.
 * Defensive because we haven't seen the actual JSON yet — dips into
 * several candidate paths and returns whatever it can find.
 *
 * Returns:
 *   { type, id, email, product_id, current_period_end, subscription_status,
 *     mode: 'live' | 'test', raw: full event }
 */
function parseEvent(bodyText) {
  let raw;
  try {
    raw = JSON.parse(bodyText);
  } catch (_) {
    return { type: null, id: null, email: null, product_id: null, raw: null, parseError: 'invalid_json' };
  }
  const data = raw.data || raw.payload || raw;
  const subscription = data.subscription || data;
  // Invoice-shaped events (invoice.paid, invoice.payment_succeeded) —
  // Dodo (and Stripe-style processors) nest identifiers under data.invoice.
  // Previously ignored; that's why the Aug 9 renewal for user 106 went
  // through as a noop and their expires_at never extended.
  const invoice      = data.invoice || {};
  const invoiceSub   = invoice.subscription || {};
  const invoiceCust  = invoice.customer || {};
  const customer     = data.customer || subscription.customer || invoiceCust || raw.customer || {};
  const payment      = data.payment || data;

  return {
    type:                raw.type || raw.event || raw.event_type || null,
    id:                  raw.id || raw.event_id || raw.webhook_id || null,
    email:               (customer.email || data.customer_email || data.email ||
                          subscription.customer_email || invoice.customer_email ||
                          invoiceCust.email || '').toLowerCase() || null,
    product_id:          data.product_id || subscription.product_id ||
                          (data.product && data.product.id) ||
                          (subscription.product && subscription.product.id) ||
                          invoice.product_id ||
                          (invoiceSub && invoiceSub.product_id) ||
                          (invoice.line_items && invoice.line_items[0] && invoice.line_items[0].product_id) ||
                          null,
    subscription_id:     subscription.id || data.subscription_id ||
                          invoice.subscription_id || invoiceSub.id ||
                          null,
    customer_id:         customer.id || data.customer_id || subscription.customer_id ||
                          invoice.customer_id || invoiceCust.id || null,
    current_period_end:  toIsoOrNull(
                          subscription.current_period_end || data.current_period_end ||
                          subscription.next_billing_at || data.next_billing_at ||
                          invoice.period_end || invoice.next_billing_at ||
                          invoiceSub.current_period_end || invoiceSub.next_billing_at
                        ),
    // Amount in the smallest currency unit (paise for INR, cents for USD)
    amount_cents:        Number(payment.amount || subscription.amount || data.amount ||
                                invoice.amount || invoice.amount_paid || invoice.total) || null,
    currency:            (payment.currency || subscription.currency || data.currency ||
                          invoice.currency || '').toUpperCase() || null,
    auto_renew:          typeof subscription.cancel_at_period_end !== 'undefined'
                           ? !subscription.cancel_at_period_end
                           : (typeof subscription.auto_renew !== 'undefined' ? !!subscription.auto_renew : true),
    subscription_status: subscription.status || data.status || invoiceSub.status || null,
    mode:                raw.livemode === false ? 'test' : (raw.mode || (raw.livemode === true ? 'live' : null)),
    // Passthrough of any metadata we attached at checkout-session creation.
    // Reading customer_metadata (Dodo's key) with metadata as fallback.
    metadata:            data.metadata || subscription.metadata || raw.metadata || {},
    raw,
  };
}

function toIsoOrNull(v) {
  if (!v) return null;
  // Dodo may send unix seconds, unix millis, or ISO. Normalize to ISO.
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  try { return new Date(String(v)).toISOString(); } catch (_) { return null; }
}

function resolveEntitlements(productId) {
  if (productId && PRODUCT_ENTITLEMENTS[productId]) return PRODUCT_ENTITLEMENTS[productId];
  return FULL_PRO_FALLBACK;
}

/**
 * Which lifecycle bucket does this event fall into? Any active-payment
 * event grants; cancellation / expiration revokes; anything else is a
 * no-op we still 200 back.
 *
 * Payment-processor terminology varies between providers (and between
 * Dodo's own event naming across product surfaces), so we accept every
 * shape that plausibly signals "a valid charge just landed for this
 * subscription." Missing even one of these causes a silent renewal
 * miss — the customer keeps getting charged by Dodo but our
 * entitlement expires_at never extends. Seen in production 2026-09-18
 * (user 106 Aug 9 renewal): their Dodo invoice for £10.67 was PAID
 * but the corresponding webhook was bucketed as 'noop' because we
 * only listened for payment.succeeded and not invoice.paid.
 */
function bucketize(eventType) {
  const t = String(eventType || '').toLowerCase();

  // ---- Activate: any signal that a valid payment just happened ----
  if (t.startsWith('payment.succeeded')                  ||
      t.startsWith('payment.processed')                  ||
      t.startsWith('payment.captured')                   ||
      t.startsWith('payment.completed')                  ||
      t.startsWith('charge.succeeded')                   ||
      // Invoice-shaped renewals (Dodo/Stripe-style processors)
      t.startsWith('invoice.paid')                       ||
      t.startsWith('invoice.payment_succeeded')          ||
      t.startsWith('invoice.payment_captured')           ||
      t.startsWith('invoice.settled')                    ||
      // Subscription lifecycle
      t.startsWith('subscription.active')                ||
      t.startsWith('subscription.created')               ||
      t.startsWith('subscription.renewed')               ||
      t.startsWith('subscription.renewal_succeeded')     ||
      t.startsWith('subscription.charged')               ||
      t.startsWith('subscription.billing_cycle')         ||  // billing_cycle_started, billing_cycle_completed
      t.startsWith('subscription.updated')               ||
      t.startsWith('subscription.resumed')) {
    return 'activate';
  }

  // Payment failures = grace period, NOT immediate revocation. Kept
  // in its own bucket so the route can email the customer to update
  // their card while premium remains active during Dodo's retry
  // window. Only subscription.failed / expired / cancelled actually
  // deactivate.
  if (t.startsWith('payment.failed')            ||
      t.startsWith('charge.failed')             ||
      t.startsWith('invoice.payment_failed')    ||
      t.startsWith('invoice.uncollectible')) {
    return 'payment_failed';
  }
  if (t.startsWith('subscription.cancelled') ||
      t.startsWith('subscription.canceled')  ||
      t.startsWith('subscription.expired')   ||
      t.startsWith('subscription.on_hold')   ||
      t.startsWith('subscription.paused')    ||
      t.startsWith('subscription.failed')) {
    return 'deactivate';
  }
  if (t.startsWith('refund.')) return 'refund';
  return 'noop';
}

module.exports = {
  verifySignature,
  parseEvent,
  resolveEntitlements,
  bucketize,
  PRODUCT_ENTITLEMENTS,
};
