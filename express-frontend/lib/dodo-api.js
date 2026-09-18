/**
 * Dodo Payments REST API client.
 *
 * Complements lib/webhooks-dodo.js (webhook receiver) with the OPPOSITE
 * direction — we call Dodo to fetch canonical subscription state on
 * demand. Needed for:
 *   1. Nightly reconciliation cron — audits every active override row
 *      against Dodo's authoritative state and repairs drift caused by
 *      missed webhooks (e.g., user 106's Aug 9 renewal drift, 2026-09-18).
 *   2. Admin "Sync from Dodo" button — same repair on a single row,
 *      on demand, without waiting for the next cron run.
 *
 * Config
 * ──────
 * DODO_API_KEY       required; live-mode key from the Dodo dashboard
 * DODO_API_BASE_URL  optional; defaults to https://live.dodopayments.com
 *                    (use https://test.dodopayments.com for sandbox)
 *
 * Design rules
 * ────────────
 * - Never throw. Every function returns { ok, ... } or null so callers
 *   never crash a cron / admin request on a Dodo hiccup.
 * - Short timeouts (5-10 s). Reconciliation happens in background; we
 *   never want a cron run to hang on a single slow API call.
 * - Log every network error with enough detail to debug from Vercel
 *   logs (status, URL, small preview of the response body).
 * - No retries here — the cron itself is a retry mechanism (runs
 *   nightly). Admin button caller can retry manually if needed.
 */

const axios = require('axios');

const DEFAULT_BASE_URL = 'https://live.dodopayments.com';
const DEFAULT_TIMEOUT_MS = 10_000;

function apiKey() {
  return process.env.DODO_API_KEY || '';
}

function baseUrl() {
  return (process.env.DODO_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function isConfigured() {
  return !!apiKey();
}

function authHeaders() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Fetch a single subscription by id.
 * Returns:
 *   { ok: true, subscription: {...normalized...} } on success
 *   { ok: false, error: 'not_configured' | 'not_found' | 'http_<status>' | 'network', detail? }
 */
async function getSubscription(subscriptionId) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  if (!subscriptionId) return { ok: false, error: 'no_subscription_id' };

  const url = `${baseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`;
  try {
    const resp = await axios.get(url, {
      headers: authHeaders(),
      timeout: DEFAULT_TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (resp.status === 404) return { ok: false, error: 'not_found' };
    if (resp.status < 200 || resp.status >= 300) {
      const preview = safePreview(resp.data);
      console.warn('[dodo-api] getSubscription non-2xx', { subscriptionId, status: resp.status, preview });
      return { ok: false, error: 'http_' + resp.status, detail: preview };
    }
    return { ok: true, subscription: normalizeSubscription(resp.data) };
  } catch (err) {
    console.warn('[dodo-api] getSubscription network error', { subscriptionId, err: err.message });
    return { ok: false, error: 'network', detail: err.message };
  }
}

/**
 * Normalise a Dodo subscription response into the exact field names our
 * reconcile logic expects. Dodo occasionally shifts field names across
 * product surfaces, so we accept the top-level object OR one nested under
 * .subscription / .data.
 */
function normalizeSubscription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sub = raw.subscription || raw.data || raw;
  const customer = sub.customer || raw.customer || {};
  return {
    id:                   sub.subscription_id || sub.id || null,
    product_id:           sub.product_id || (sub.product && sub.product.id) || null,
    status:               String(sub.status || '').toLowerCase() || null,
    current_period_end:   toIso(sub.current_period_end || sub.next_billing_at || sub.previous_billing_date_end),
    next_billing_at:      toIso(sub.next_billing_at || sub.current_period_end),
    cancel_at_period_end: typeof sub.cancel_at_period_end === 'boolean' ? sub.cancel_at_period_end : null,
    cancelled_at:         toIso(sub.cancelled_at || sub.canceled_at),
    currency:             (sub.currency || raw.currency || '').toUpperCase() || null,
    amount_cents:         Number(sub.amount || sub.recurring_pre_tax_amount || sub.total_amount) || null,
    customer_id:          customer.id || sub.customer_id || null,
    customer_email:       (customer.email || sub.customer_email || '').toLowerCase() || null,
    // Everything else the caller might want to log
    raw:                  sub,
  };
}

function toIso(v) {
  if (!v) return null;
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  try { return new Date(String(v)).toISOString(); } catch (_) { return null; }
}

function safePreview(data) {
  if (!data) return '';
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    return s.slice(0, 400);
  } catch (_) { return ''; }
}

module.exports = {
  isConfigured,
  getSubscription,
  // Exported for tests
  _normalizeSubscription: normalizeSubscription,
  _toIso: toIso,
};
