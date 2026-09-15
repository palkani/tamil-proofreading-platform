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
}) {
  if (!isConfigured()) return { error: 'db_not_configured' };
  const key = String(email || '').trim().toLowerCase();
  if (!key) return { error: 'email_required' };

  const row = {
    email:            key,
    is_premium:       is_premium !== false,
    entitlements:     Array.isArray(entitlements) ? entitlements : [],
    plan_code:        plan_code || null,
    plan_label:       plan_label || null,
    expires_at:       expires_at || null,
    granted_by_email: String(granted_by_email || 'dodo-webhook').toLowerCase(),
    notes:            notes || null,
  };

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

module.exports = { findOverrideByEmail, upsertOverride, isConfigured };
