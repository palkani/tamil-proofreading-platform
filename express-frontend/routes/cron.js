/**
 * Scheduled cron endpoints — invoked by Vercel Cron (see vercel.json).
 *
 * Auth: Vercel Cron includes an Authorization: Bearer <CRON_SECRET>
 * header on every invocation when the secret is configured. External
 * traffic is rejected with 401 unless that header matches, so nobody
 * can trigger a reminder blast by hitting the URL.
 *
 * All endpoints:
 *   - respond fast (Vercel Cron has a 60s serverless timeout)
 *   - are idempotent (repeated runs = no double-send, guarded by
 *     last_reminder_sent_at + email de-dup within a run)
 *   - never throw; wrap failures in { ok: false } so the cron doesn't
 *     stop retrying
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const templates = require('../lib/email/templates/subscription-lifecycle');
const { sendEmail } = require('../lib/email/send');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
function supabaseHeaders(extra) {
  return Object.assign({ 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, extra || {});
}

// -------------- shared auth ------------------------------------------
function requireCronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) {
    // In dev / when secret isn't set, allow but log loudly so it's
    // obvious the endpoint is unprotected. Set CRON_SECRET in Vercel
    // BEFORE relying on this in production.
    console.warn('[cron] ⚠️  CRON_SECRET is not set — endpoint is open. Set it in Vercel env to require authentication.');
    return next();
  }
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────
// GET/POST /api/cron/renewal-reminders
//
// Runs daily. Scans admin_user_entitlement_overrides for subscriptions
// where:
//   is_premium = TRUE
//   auto_renew = TRUE (or NULL — defaults to true)
//   cancelled_at IS NULL
//   expires_at (or next_renewal_at) is 2-3 days from now
//   last_reminder_sent_at is NULL OR older than 5 days
//
// Sends the T-3 renewal-reminder email + stamps last_reminder_sent_at.
// The 5-day cooldown makes the cron safely runnable multiple times
// per day without spamming customers.
// ─────────────────────────────────────────────────────────────────────
router.all('/renewal-reminders', requireCronAuth, async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString();   // T+2 days
  const windowEnd   = new Date(now.getTime() + 4 * 24 * 3600 * 1000).toISOString();   // T+4 days
  const reminderCutoff = new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString(); // last reminder > 5 days ago

  try {
    // PostgREST query builder — filter as URL params.
    // Note the `or` clause syntax: `or=(a.is.null,a.lt.value)`
    const filter =
      `is_premium=eq.true` +
      `&cancelled_at=is.null` +
      `&expires_at=gte.${encodeURIComponent(windowStart)}` +
      `&expires_at=lte.${encodeURIComponent(windowEnd)}` +
      `&or=(auto_renew.is.null,auto_renew.eq.true)` +
      `&or=(last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${encodeURIComponent(reminderCutoff)})`;

    const listUrl = `${SUPABASE_URL}/rest/v1/admin_user_entitlement_overrides?${filter}` +
      `&select=email,plan_label,plan_code,expires_at,next_renewal_at,currency,amount_cents,auto_renew,last_reminder_sent_at&limit=500`;

    const listResp = await axios.get(listUrl, { headers: supabaseHeaders(), timeout: 10000 });
    const rows = Array.isArray(listResp.data) ? listResp.data : [];

    let sent = 0, failed = 0, skipped = 0;
    const seen = new Set();

    for (const row of rows) {
      const email = String(row.email || '').toLowerCase().trim();
      if (!email || seen.has(email)) { skipped++; continue; }
      seen.add(email);

      const renewalAt = row.next_renewal_at || row.expires_at;
      const daysUntil = Math.max(0, Math.ceil((new Date(renewalAt).getTime() - now.getTime()) / 86400000));

      const { subject, html } = templates.renewalReminder({
        email,
        plan_label:      row.plan_label,
        currency:        row.currency,
        amount_cents:    row.amount_cents,
        next_renewal_at: renewalAt,
        days_until:      daysUntil,
      });

      const result = await sendEmail({ to: email, subject, html });
      if (result.ok) {
        sent++;
        // Stamp last_reminder_sent_at so the cooldown holds.
        await axios.patch(
          `${SUPABASE_URL}/rest/v1/admin_user_entitlement_overrides?email=eq.${encodeURIComponent(email)}`,
          { last_reminder_sent_at: now.toISOString() },
          { headers: supabaseHeaders({ Prefer: 'return=minimal' }), timeout: 5000 }
        ).catch((err) => console.warn('[cron/renewal-reminders] stamp failed for', email, err.message));
        console.log('[cron/renewal-reminders] sent to', email, '· days_until=', daysUntil, '· transport=', result.transport);
      } else {
        failed++;
        console.warn('[cron/renewal-reminders] send failed for', email, '· error=', result.error);
      }
    }

    return res.json({ ok: true, candidates: rows.length, sent, failed, skipped });
  } catch (err) {
    console.error('[cron/renewal-reminders] fatal error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET/POST /api/cron/dodo-reconcile
//
// Nightly reconciliation: for every override row that carries a Dodo
// subscription_id, fetch canonical state from Dodo's API and repair drift.
//
// Why this exists: webhooks can miss (Dodo timeout, event name we don't
// yet bucket, transient DB write failure). Missing even one renewal event
// means expires_at silently drifts and the customer loses access despite
// still being charged (see user 106 Aug 9 renewal, 2026-09-18). This cron
// audits the whole active pool nightly so no drift outlives a single day.
//
// Safety rails:
//   - Never DEMOTES a paying user on API failure. If Dodo returns 5xx or
//     the API key is missing, we skip the row and log — never revoke.
//   - Never SHORTENS expires_at. If Dodo's period-end is earlier than
//     ours, we noop (impossible in practice but defensive).
//   - Never OVERWRITES plan_code with a fallback. Unmapped product_id
//     leaves the existing plan alone.
//   - Runs in parallel batches of 5 to stay within Vercel's 300s window
//     while covering ~500 rows per run.
// ─────────────────────────────────────────────────────────────────────
const dodoApi = require('../lib/dodo-api');
const { reconcile } = require('../lib/dodo-reconcile');
const overridesDb = require('../lib/user-entitlement-overrides-db');

const RECONCILE_MAX_ROWS       = 500;
const RECONCILE_CONCURRENCY    = 5;

router.all('/dodo-reconcile', requireCronAuth, async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
  }
  if (!dodoApi.isConfigured()) {
    console.warn('[cron/dodo-reconcile] DODO_API_KEY not set — cannot reconcile');
    return res.status(500).json({ ok: false, error: 'dodo_api_not_configured' });
  }

  const startedAt = Date.now();
  const stats = {
    fetched:        0,
    checked:        0,
    extended:       0,
    granted:        0,
    soft_cancelled: 0,
    hard_expired:   0,
    past_due:       0,
    noop:           0,
    dodo_errors:    0,
    write_errors:   0,
  };
  const changes = [];   // human-readable log for the response body

  try {
    // Fetch every override that has a Dodo subscription id — the pool
    // of rows we CAN reconcile. Prefer is_premium=true or a recent row
    // (past-due / cancelled but within grace period) so we don't burn
    // API calls on ancient dead subs.
    const filter =
      `dodo_subscription_id=not.is.null` +
      `&order=granted_at.desc` +
      `&limit=${RECONCILE_MAX_ROWS}`;
    const listUrl =
      `${SUPABASE_URL}/rest/v1/admin_user_entitlement_overrides?${filter}` +
      `&select=email,is_premium,expires_at,plan_code,plan_label,entitlements,` +
      `auto_renew,payment_status,dodo_customer_id,dodo_subscription_id,cancelled_at,granted_at`;

    const listResp = await axios.get(listUrl, { headers: supabaseHeaders(), timeout: 10_000 });
    const rows = Array.isArray(listResp.data) ? listResp.data : [];
    stats.fetched = rows.length;

    // Process in parallel batches of RECONCILE_CONCURRENCY so we cover
    // the whole set within Vercel's 300s function timeout. Each Dodo
    // call is ~500ms-2s; 500 rows / 5 concurrent × ~2s ≈ 200s worst case.
    for (let i = 0; i < rows.length; i += RECONCILE_CONCURRENCY) {
      const batch = rows.slice(i, i + RECONCILE_CONCURRENCY);
      await Promise.all(batch.map(async (row) => {
        stats.checked += 1;
        try {
          const dodoResp = await dodoApi.getSubscription(row.dodo_subscription_id);
          if (!dodoResp.ok) {
            stats.dodo_errors += 1;
            console.warn('[cron/dodo-reconcile] dodo fetch failed', {
              email: row.email, subscription_id: row.dodo_subscription_id, error: dodoResp.error,
            });
            return;
          }
          const decision = reconcile(row, dodoResp.subscription);
          if (decision.action === 'noop') {
            stats.noop += 1;
            return;
          }
          if (!decision.patch) {
            stats.noop += 1;
            return;
          }
          const writeResult = await overridesDb.upsertOverride(decision.patch);
          if (writeResult && writeResult.error) {
            stats.write_errors += 1;
            console.error('[cron/dodo-reconcile] upsert failed', {
              email: row.email, action: decision.action, error: writeResult.error, detail: writeResult.detail,
            });
            return;
          }
          // Tally per-action bucket
          if      (decision.action === 'extend')          stats.extended       += 1;
          else if (decision.action === 'grant')           stats.granted        += 1;
          else if (decision.action === 'soft_cancel')     stats.soft_cancelled += 1;
          else if (decision.action === 'hard_expire')     stats.hard_expired   += 1;
          else if (decision.action === 'noop_past_due')   stats.past_due       += 1;
          console.log('[cron/dodo-reconcile] ✅ ' + decision.action, {
            email: row.email, changes: decision.changes,
          });
          changes.push({ email: row.email, action: decision.action, changes: decision.changes });
        } catch (err) {
          stats.dodo_errors += 1;
          console.warn('[cron/dodo-reconcile] row threw', { email: row.email, err: err.message });
        }
      }));
    }
  } catch (err) {
    console.error('[cron/dodo-reconcile] fatal error:', err.message);
    return res.status(500).json({ ok: false, error: err.message, stats });
  }

  const durationMs = Date.now() - startedAt;
  console.log('[cron/dodo-reconcile] complete', { durationMs, ...stats });
  return res.json({ ok: true, duration_ms: durationMs, stats, changes: changes.slice(0, 50) });
});

// GET /api/cron/health — trivial sanity ping.
router.get('/health', requireCronAuth, (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    supabase_configured: !!(SUPABASE_URL && SUPABASE_KEY),
    cron_secret_set:     !!process.env.CRON_SECRET,
    dodo_api_configured: dodoApi.isConfigured(),
  });
});

module.exports = router;
