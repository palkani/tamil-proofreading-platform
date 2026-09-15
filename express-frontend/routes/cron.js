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

// GET /api/cron/health — trivial sanity ping.
router.get('/health', requireCronAuth, (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    supabase_configured: !!(SUPABASE_URL && SUPABASE_KEY),
    cron_secret_set:     !!process.env.CRON_SECRET,
  });
});

module.exports = router;
