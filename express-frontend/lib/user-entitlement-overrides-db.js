/**
 * Supabase-backed per-user entitlement overrides.
 *
 * Middleware/attachEntitlements.js calls findOverrideByEmail() after
 * loading billing from the Go backend. If a non-expired override exists,
 * the returned shape REPLACES billing.entitlements / is_premium /
 * plan_code — override wins.
 *
 * Failure posture: DB down → returns null. Middleware treats absence of
 * an override as "no override" (falls back to real billing). Safe to
 * ship the middleware change without a live overrides table; the
 * lookup just returns null every time.
 *
 * Schema: db/migrations/admin_user_entitlement_overrides.sql
 */

const axios = require('axios');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

/**
 * Look up an override for the given email. Returns null if:
 *   - Supabase not configured
 *   - no row
 *   - row exists but expires_at has passed
 *   - request errored (fail-quiet)
 *
 * Returned shape mirrors what the middleware will apply to res.locals.billing:
 *   { is_premium, entitlements, plan_code, plan_label }
 */
async function findOverrideByEmail(email) {
  if (!isConfigured()) return null;
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/admin_user_entitlement_overrides` +
      `?email=eq.${encodeURIComponent(key)}` +
      `&select=email,is_premium,entitlements,plan_code,plan_label,expires_at`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 3000 });
    const row = Array.isArray(resp.data) && resp.data[0];
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    return {
      is_premium:   row.is_premium !== false,
      entitlements: Array.isArray(row.entitlements) ? row.entitlements : [],
      plan_code:    row.plan_code || null,
      plan_label:   row.plan_label || null,
    };
  } catch (err) {
    console.warn('[user-entitlement-overrides-db] findOverrideByEmail error:', err.message);
    return null;
  }
}

/**
 * UPSERT a per-user entitlement override — used by the Dodo webhook
 * receiver when it activates / extends a subscription. Idempotent by
 * email (Supabase's PostgREST Prefer: resolution=merge-duplicates
 * merges on the PK conflict).
 */
async function upsertOverride({
  email, is_premium, entitlements, plan_code, plan_label,
  expires_at, granted_by_email, notes,
  // subscription-lifecycle fields (all optional — omitted keys are not
  // touched on upsert; this is IMPORTANT because separate flows update
  // different subsets of columns and we don't want a webhook to overwrite
  // an admin-set field, or vice versa).
  auto_renew, payment_status, cancelled_at,
  dodo_customer_id, dodo_subscription_id,
  currency, amount_cents, next_renewal_at,
}) {
  if (!isConfigured()) return { error: 'db_not_configured' };
  const key = String(email || '').trim().toLowerCase();
  if (!key) return { error: 'email_required' };

  // Only include fields that were EXPLICITLY passed. Undefined = don't
  // touch. Null = clear the column.
  const row = { email: key };
  if (is_premium           !== undefined) row.is_premium           = is_premium !== false;
  if (entitlements         !== undefined) row.entitlements         = Array.isArray(entitlements) ? entitlements : [];
  if (plan_code            !== undefined) row.plan_code            = plan_code || null;
  if (plan_label           !== undefined) row.plan_label           = plan_label || null;
  if (expires_at           !== undefined) row.expires_at           = expires_at || null;
  if (granted_by_email     !== undefined) row.granted_by_email     = String(granted_by_email || 'dodo-webhook').toLowerCase();
  if (notes                !== undefined) row.notes                = notes || null;
  if (auto_renew           !== undefined) row.auto_renew           = auto_renew !== false;
  if (payment_status       !== undefined) row.payment_status       = payment_status || 'active';
  if (cancelled_at         !== undefined) row.cancelled_at         = cancelled_at || null;
  if (dodo_customer_id     !== undefined) row.dodo_customer_id     = dodo_customer_id || null;
  if (dodo_subscription_id !== undefined) row.dodo_subscription_id = dodo_subscription_id || null;
  if (currency             !== undefined) row.currency             = currency || null;
  if (amount_cents         !== undefined) row.amount_cents         = amount_cents === null ? null : parseInt(amount_cents, 10) || 0;
  if (next_renewal_at      !== undefined) row.next_renewal_at      = next_renewal_at || null;

  // Ensure the merge-upsert has ENOUGH fields to be a valid row when the
  // email PK conflicts. If this is the first ever insert for this email,
  // granted_by_email must be present (NOT NULL) — set a default when omitted.
  if (!row.granted_by_email) row.granted_by_email = 'dodo-webhook';

  try {
    const resp = await axios.post(
      `${SUPABASE_URL}/rest/v1/admin_user_entitlement_overrides`,
      row,
      {
        headers: {
          ...supabaseHeaders(),
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        timeout: 5000,
      }
    );
    return { ok: true, row: Array.isArray(resp.data) ? resp.data[0] : resp.data };
  } catch (err) {
    console.error('[user-entitlement-overrides-db] upsertOverride error:', err.message);
    return { error: 'db_error', detail: err.message };
  }
}

/**
 * Fetch the FULL subscription state for a user — powers the /account
 * subscription card. Returns null when there's no row, expired, etc.,
 * so the caller can render a "no active subscription" empty state.
 *
 * Distinct from findOverrideByEmail() which returns only the fields
 * the middleware needs for entitlement decisions.
 */
async function findFullSubscriptionByEmail(email) {
  if (!isConfigured()) return null;
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/admin_user_entitlement_overrides` +
      `?email=eq.${encodeURIComponent(key)}` +
      `&select=email,is_premium,entitlements,plan_code,plan_label,expires_at,` +
      `next_renewal_at,cancelled_at,auto_renew,payment_status,currency,amount_cents,` +
      `dodo_customer_id,dodo_subscription_id,granted_at,granted_by_email,notes`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 3000 });
    const row = Array.isArray(resp.data) && resp.data[0];
    if (!row) return null;
    return row;   // caller decides how to display expired / cancelled state
  } catch (err) {
    console.warn('[user-entitlement-overrides-db] findFullSubscriptionByEmail error:', err.message);
    return null;
  }
}

/**
 * List all overrides — powers the /admin/users table's per-row plan
 * badge so admins see Express-side grants that the Go backend's user
 * list doesn't know about. Returns an empty array on any error so the
 * admin page renders regardless.
 */
async function listAllOverrides({ limit = 1000 } = {}) {
  if (!isConfigured()) return [];
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/admin_user_entitlement_overrides` +
      `?select=email,is_premium,entitlements,plan_code,plan_label,expires_at,` +
      `next_renewal_at,cancelled_at,auto_renew,payment_status,` +
      `granted_at,granted_by_email,notes` +
      `&order=granted_at.desc&limit=${limit}`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 3000 });
    return Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    console.warn('[user-entitlement-overrides-db] listAllOverrides error:', err.message);
    return [];
  }
}

/**
 * Idempotency check for webhook processing. Returns true if this
 * event id has already been processed; caller should skip it.
 */
async function isEventProcessed(eventId) {
  if (!isConfigured() || !eventId) return false;
  try {
    const url = `${SUPABASE_URL}/rest/v1/processed_webhook_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id&limit=1`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 3000 });
    return Array.isArray(resp.data) && resp.data.length > 0;
  } catch (err) {
    // Fail-quiet: on lookup error we treat as "not processed" and let
    // the event through. Worst case: a double-processed event, which
    // upsertOverride handles idempotently anyway.
    console.warn('[user-entitlement-overrides-db] isEventProcessed error:', err.message);
    return false;
  }
}

async function markEventProcessed(eventId, { eventType, outcome, detail } = {}) {
  if (!isConfigured() || !eventId) return;
  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/processed_webhook_events`,
      { event_id: eventId, event_type: eventType || null, outcome: outcome || null, detail: detail || null },
      { headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' }, timeout: 3000 }
    );
  } catch (err) {
    console.warn('[user-entitlement-overrides-db] markEventProcessed error:', err.message);
  }
}

module.exports = {
  findOverrideByEmail,
  findFullSubscriptionByEmail,
  listAllOverrides,
  upsertOverride,
  isEventProcessed,
  markEventProcessed,
  isConfigured,
};
