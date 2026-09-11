/**
 * Supabase-backed store for admin-generated promo codes.
 *
 * Runs alongside the static registry in lib/promo-codes.js — the
 * async lookup helper here is consulted FIRST (DB wins on collision),
 * and static registry entries are the fallback for the built-in
 * PROOFPROLITE / OCRPROLITE / PROOFTAMIL-LITE codes.
 *
 * Failure posture — codes DB down should NOT block payments
 * ─────────────────────────────────────────────────────────
 * Every function here returns null / [] / false on Supabase error
 * instead of throwing, so a Supabase blip degrades to the static
 * registry rather than a 500 on the pricing page. The admin console
 * WILL surface an error toast — admins can act on the outage — but
 * anonymous / normal users are unaffected.
 *
 * Schema: see db/migrations/admin_promo_codes.sql
 */

const axios = require('axios');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

function supabaseHeaders(extra) {
  return Object.assign(
    {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    extra || {}
  );
}

function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Uppercase + trim a raw code string. Matches the primary key format
 * in the admin_promo_codes table so a lookup is a direct PK hit.
 */
function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

/**
 * Look up a code (case-insensitive). Returns the row shape our
 * frontend expects (matches the static registry entry shape) or null.
 * Filters out revoked / expired codes here so the caller doesn't
 * have to re-check.
 */
async function findCode(rawCode) {
  if (!isConfigured()) return null;
  const code = normalizeCode(rawCode);
  if (!code) return null;
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/admin_promo_codes` +
      `?code=eq.${encodeURIComponent(code)}` +
      `&select=code,label,price_cents,currency,plan_code,billing_interval,entitlements,checkout_url,recurring_terms,target_email,single_use,redeemed_at,revoked_at,expires_at`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 3000 });
    const row = Array.isArray(resp.data) && resp.data[0];
    if (!row) return null;
    // Filter out non-usable states so callers see either a usable
    // code or nothing. Distinguishing between "revoked" / "expired" /
    // "already used" happens in the /validate endpoint via a separate
    // status probe if we want customer-friendly copy — for now the
    // caller just gets code_not_found which is fine (admin can tell
    // the customer why via the audit log).
    if (row.revoked_at) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    if (row.single_use && row.redeemed_at) return null;
    // Reshape to match the static registry entry shape (plus a source
    // marker so callers/UI can tell they're on a DB code).
    return {
      plan_code:        row.plan_code,
      label:            row.label,
      price_cents:      Number(row.price_cents) || 0,
      display_price:    formatDisplayPrice(row.price_cents, row.currency),
      currency:         row.currency,
      billing_interval: row.billing_interval,
      entitlements:     Array.isArray(row.entitlements) ? row.entitlements : [],
      recurring_terms:  row.recurring_terms || '',
      checkout_url:     row.checkout_url,
      target_email:     row.target_email || null,
      single_use:       !!row.single_use,
      source:           'admin_db',
    };
  } catch (err) {
    console.error('[promo-codes-db] findCode error:', err.message);
    return null;
  }
}

function formatDisplayPrice(cents, currency) {
  const n = Number(cents) || 0;
  if (currency === 'INR') return String(Math.round(n / 100));
  return (n / 100).toFixed(2);
}

/**
 * Atomically mark the code as redeemed and append to the audit log.
 * Returns the redeemed row on success, null on any failure (already
 * used, revoked, expired, email mismatch, DB down).
 *
 * The RPC uses a single UPDATE ... WHERE guard so two concurrent
 * clicks can't both mark the same single-use code redeemed.
 */
async function redeem(rawCode, userEmail, meta) {
  if (!isConfigured()) return null;
  const code = normalizeCode(rawCode);
  const email = String(userEmail || '').trim().toLowerCase();
  if (!code || !email) return null;
  try {
    const resp = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/redeem_admin_promo_code`,
      {
        p_code: code,
        p_user_email: email,
        p_ip: (meta && meta.ip) || null,
        p_user_agent: (meta && meta.userAgent) || null,
      },
      { headers: supabaseHeaders({ Prefer: 'return=representation' }), timeout: 3000 }
    );
    const row = Array.isArray(resp.data) && resp.data[0];
    return row || null;
  } catch (err) {
    console.error('[promo-codes-db] redeem error:', err.message);
    return null;
  }
}

/**
 * Admin: list all codes, newest first. Returns [] on error so the
 * admin page renders instead of 500ing.
 */
async function listAll({ limit = 200 } = {}) {
  if (!isConfigured()) return [];
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/admin_promo_codes` +
      `?select=*&order=created_at.desc&limit=${limit}`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 5000 });
    return Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    console.error('[promo-codes-db] listAll error:', err.message);
    return [];
  }
}

/**
 * Admin: create a new code. Payload matches the schema columns
 * (except `code` which is computed if missing). Returns the created
 * row on success, or { error } on validation / DB failure so the
 * admin form can surface a useful message.
 */
async function createCode(payload) {
  if (!isConfigured()) return { error: 'db_not_configured' };

  const row = {
    code:             normalizeCode(payload.code) || generateCode(),
    label:            String(payload.label || '').trim().slice(0, 120),
    price_cents:      Math.max(0, Math.round(Number(payload.price_cents) || 0)),
    currency:         String(payload.currency || 'INR').trim().toUpperCase().slice(0, 3),
    plan_code:        String(payload.plan_code || 'PRO_LITE').trim().toUpperCase().slice(0, 60),
    billing_interval: String(payload.billing_interval || 'month').trim().toLowerCase(),
    entitlements:     Array.isArray(payload.entitlements) ? payload.entitlements : [],
    checkout_url:     String(payload.checkout_url || '').trim(),
    recurring_terms:  String(payload.recurring_terms || '').trim() || null,
    target_email:     payload.target_email ? String(payload.target_email).trim().toLowerCase() : null,
    single_use:       payload.single_use !== false,
    expires_at:       payload.expires_at || null,
    created_by_email: String(payload.created_by_email || '').trim().toLowerCase(),
    notes:            payload.notes ? String(payload.notes).slice(0, 500) : null,
  };
  if (!row.label)               return { error: 'label_required' };
  if (!row.checkout_url)        return { error: 'checkout_url_required' };
  if (!row.created_by_email)    return { error: 'admin_email_required' };
  if (!row.checkout_url.startsWith('https://checkout.dodopayments.com/')) {
    return { error: 'checkout_url_must_be_dodo' };
  }

  try {
    const resp = await axios.post(
      `${SUPABASE_URL}/rest/v1/admin_promo_codes`,
      row,
      { headers: supabaseHeaders({ Prefer: 'return=representation' }), timeout: 5000 }
    );
    return Array.isArray(resp.data) ? resp.data[0] : resp.data;
  } catch (err) {
    console.error('[promo-codes-db] createCode error:', err.message);
    // Supabase returns 409 on PRIMARY KEY conflict — surface a
    // clean error the form can render.
    if (err.response && err.response.status === 409) {
      return { error: 'code_already_exists' };
    }
    return { error: 'db_error', detail: err.message };
  }
}

/**
 * Admin: mark a code revoked (soft delete — history preserved so the
 * audit log stays intact). Returns { ok:true } / { error:... }.
 */
async function revokeCode(rawCode, actorEmail) {
  if (!isConfigured()) return { error: 'db_not_configured' };
  const code = normalizeCode(rawCode);
  if (!code) return { error: 'code_required' };
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/admin_promo_codes?code=eq.${encodeURIComponent(code)}`,
      { revoked_at: new Date().toISOString(), notes: `[revoked by ${actorEmail || 'unknown'}]` },
      { headers: supabaseHeaders({ Prefer: 'return=minimal' }), timeout: 5000 }
    );
    return { ok: true };
  } catch (err) {
    console.error('[promo-codes-db] revokeCode error:', err.message);
    return { error: 'db_error', detail: err.message };
  }
}

/**
 * Admin: clear the redeemed_at flag so a single-use code can be
 * handed out again. Doesn't touch the redemption audit log.
 */
async function resetRedemption(rawCode) {
  if (!isConfigured()) return { error: 'db_not_configured' };
  const code = normalizeCode(rawCode);
  if (!code) return { error: 'code_required' };
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/admin_promo_codes?code=eq.${encodeURIComponent(code)}`,
      { redeemed_at: null, redeemed_by_email: null },
      { headers: supabaseHeaders({ Prefer: 'return=minimal' }), timeout: 5000 }
    );
    return { ok: true };
  } catch (err) {
    console.error('[promo-codes-db] resetRedemption error:', err.message);
    return { error: 'db_error', detail: err.message };
  }
}

/**
 * Generate a memorable 12-char alphanumeric code. Excludes lookalikes
 * (0/O, 1/I/L) so admins reading a code aloud to a customer don't get
 * tripped up. Format: XXXX-XXXX-XXXX for readability.
 */
function generateCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  let out = '';
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) out += '-';
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

module.exports = {
  findCode,
  redeem,
  listAll,
  createCode,
  revokeCode,
  resetRedemption,
  generateCode,
  normalizeCode,
  isConfigured,
};
