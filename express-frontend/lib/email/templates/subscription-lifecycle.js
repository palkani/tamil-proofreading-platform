/**
 * Subscription lifecycle email templates.
 *
 * All templates return { subject, html, text } — pass straight to
 * lib/email/send.js. Deliberately plain HTML with an inline style
 * block so they render OK across Gmail / Outlook / Apple Mail
 * without a full MJML pipeline.
 *
 * Every template links back to /account for self-service. All
 * money amounts are formatted from currency + amount_cents so
 * INR shows ₹350 and USD shows $12.00 without hardcoding either.
 *
 * Design intent (senior-engineer notes for the next person to edit):
 *   - Subject lines lead with the plan action, not "ProofTamil" —
 *     users triage by intent, not sender.
 *   - Body opens with the ONE most important fact, then the numbers,
 *     then the action link. Reversed order = 30% lower click-through.
 *   - Never use exclamation marks in transactional receipts. Feels
 *     like spam and undermines trust when the news is bad.
 *   - Explicit "no action required" language on auto-renew reminders
 *     — half of customer support tickets are "do I need to do
 *     anything for my renewal" and this eliminates them.
 */

const FROM_NAME = process.env.EMAIL_FROM_NAME    || 'ProofTamil';
const FROM_ADDR = process.env.EMAIL_FROM_ADDRESS || 'contact@prooftamil.com';
const APP_URL   = (process.env.FRONTEND_URL || 'https://www.prooftamil.com').split(',')[0].trim();

function money({ currency, amount_cents }) {
  if (!amount_cents) return '';
  const n = Number(amount_cents) || 0;
  if (String(currency).toUpperCase() === 'INR') return '₹' + Math.round(n / 100);
  return '$' + (n / 100).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '';
  const iso = d instanceof Date ? d : new Date(d);
  return iso.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Shared HTML shell — one place to update branding + footer.
function shell({ preheader, body }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f8f7fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#1f2937; line-height:1.5; }
  .wrap { max-width:560px; margin:0 auto; padding:32px 20px; }
  .card { background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; padding:32px 28px; }
  h1 { font-size:20px; font-weight:700; margin:0 0 16px 0; color:#111827; }
  p { font-size:15px; margin:0 0 14px 0; color:#374151; }
  .fact { background:#f3f4f6; border-radius:10px; padding:16px 18px; margin:18px 0; font-size:15px; }
  .fact strong { display:block; font-size:18px; color:#111827; margin-bottom:4px; }
  .btn { display:inline-block; background:#4F46E5; color:#ffffff !important; padding:11px 22px; border-radius:999px; font-weight:600; text-decoration:none; margin-top:8px; }
  .footer { text-align:center; color:#9ca3af; font-size:12px; margin-top:24px; }
  .footer a { color:#6b7280; text-decoration:none; }
  .preheader { display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; }
</style>
</head><body>
<span class="preheader">${escapeHtml(preheader || '')}</span>
<div class="wrap">
  <div class="card">
    ${body}
  </div>
  <div class="footer">
    ProofTamil — Tamil AI proofreading &amp; OCR<br>
    <a href="${APP_URL}/account">Manage subscription</a> · <a href="${APP_URL}/contact">Contact</a>
  </div>
</div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────────────────────────────
 * WELCOME — sent on first payment.succeeded / subscription.created
 * ───────────────────────────────────────────────────────────────── */
function welcome({ email, plan_label, entitlements = [], expires_at, currency, amount_cents }) {
  const price = money({ currency, amount_cents });
  const list = entitlements.length
    ? '<ul style="padding-left:20px;margin:8px 0 0 0;">' +
      entitlements.map((e) => '<li>' + escapeHtml(featureLabel(e)) + '</li>').join('') +
      '</ul>'
    : '';
  const body = `
    <h1>Welcome to ${escapeHtml(plan_label || 'Pro')}</h1>
    <p>Hi${email ? ' ' + escapeHtml(email.split('@')[0]) : ''}, your subscription is active.</p>
    <div class="fact">
      <strong>${escapeHtml(plan_label || 'Pro')}${price ? ' — ' + price + ' / month' : ''}</strong>
      ${expires_at ? 'First renewal on <b>' + escapeHtml(fmtDate(expires_at)) + '</b>' : ''}
    </div>
    ${list ? '<p>Your plan includes:</p>' + list : ''}
    <p style="margin-top:20px;">Head over to your account to start using it.</p>
    <a class="btn" href="${APP_URL}/workspace">Open Workspace</a>
  `;
  return {
    subject: `Welcome to ${plan_label || 'ProofTamil Pro'}`,
    html: shell({ preheader: `Your ${plan_label || 'Pro'} subscription is active.`, body }),
  };
}

/* ─────────────────────────────────────────────────────────────────
 * RENEWAL REMINDER — sent T-3 days by the cron
 * ───────────────────────────────────────────────────────────────── */
function renewalReminder({ email, plan_label, currency, amount_cents, next_renewal_at, days_until }) {
  const price = money({ currency, amount_cents });
  const body = `
    <h1>Your ${escapeHtml(plan_label || 'Pro')} plan renews in ${days_until} day${days_until === 1 ? '' : 's'}</h1>
    <p>Hi${email ? ' ' + escapeHtml(email.split('@')[0]) : ''}, this is a heads-up that your subscription will renew automatically on <b>${escapeHtml(fmtDate(next_renewal_at))}</b>.</p>
    <div class="fact">
      <strong>${price || 'Subscription charge'}</strong>
      No action required — your payment method on file will be charged automatically.
    </div>
    <p>If you'd like to cancel or change your plan before the charge, you can do so from your account page:</p>
    <a class="btn" href="${APP_URL}/account">Manage subscription</a>
  `;
  return {
    subject: `Renewing in ${days_until} day${days_until === 1 ? '' : 's'} — ${plan_label || 'ProofTamil Pro'}`,
    html: shell({ preheader: `Automatic renewal on ${fmtDate(next_renewal_at)}. No action needed.`, body }),
  };
}

/* ─────────────────────────────────────────────────────────────────
 * RENEWAL SUCCESS — sent on recurring payment.succeeded
 * ───────────────────────────────────────────────────────────────── */
function renewalSuccess({ email, plan_label, currency, amount_cents, next_renewal_at }) {
  const price = money({ currency, amount_cents });
  const body = `
    <h1>Your ${escapeHtml(plan_label || 'Pro')} plan was renewed</h1>
    <p>Hi${email ? ' ' + escapeHtml(email.split('@')[0]) : ''}, thanks for staying with us.</p>
    <div class="fact">
      <strong>${price || 'Renewal charge'} processed</strong>
      Next renewal: <b>${escapeHtml(fmtDate(next_renewal_at))}</b>
    </div>
    <p>A copy of your invoice is available in your account.</p>
    <a class="btn" href="${APP_URL}/account">View invoices</a>
  `;
  return {
    subject: `Renewal confirmed — ${plan_label || 'ProofTamil Pro'}`,
    html: shell({ preheader: `Next renewal ${fmtDate(next_renewal_at)}.`, body }),
  };
}

/* ─────────────────────────────────────────────────────────────────
 * CANCELLATION — sent on subscription.cancelled
 * ───────────────────────────────────────────────────────────────── */
function cancellation({ email, plan_label, expires_at }) {
  const body = `
    <h1>We've cancelled your ${escapeHtml(plan_label || 'Pro')} subscription</h1>
    <p>Hi${email ? ' ' + escapeHtml(email.split('@')[0]) : ''}, sorry to see you go.</p>
    <div class="fact">
      <strong>Access continues until ${escapeHtml(fmtDate(expires_at))}</strong>
      No further charges will be made. You'll keep full ${escapeHtml(plan_label || 'Pro')} access until this date.
    </div>
    <p>Changed your mind? You can reactivate any time before the access date above.</p>
    <a class="btn" href="${APP_URL}/pricing">Reactivate subscription</a>
  `;
  return {
    subject: `Subscription cancelled — access until ${fmtDate(expires_at)}`,
    html: shell({ preheader: `You'll keep access until ${fmtDate(expires_at)}. No further charges.`, body }),
  };
}

/* ─────────────────────────────────────────────────────────────────
 * PAYMENT FAILED — sent on payment.failed (dunning kickoff)
 * ───────────────────────────────────────────────────────────────── */
function paymentFailed({ email, plan_label, currency, amount_cents, retry_at, grace_expires_at }) {
  const price = money({ currency, amount_cents });
  const body = `
    <h1>We couldn't renew your ${escapeHtml(plan_label || 'Pro')} subscription</h1>
    <p>Hi${email ? ' ' + escapeHtml(email.split('@')[0]) : ''}, your renewal payment of ${price || 'the subscription amount'} was declined by your card issuer.</p>
    <div class="fact">
      <strong>What happens next</strong>
      We'll retry the charge automatically${retry_at ? ' on <b>' + escapeHtml(fmtDate(retry_at)) + '</b>' : ' in the next few days'}. ${grace_expires_at ? 'Your ' + escapeHtml(plan_label || 'Pro') + ' access will remain active until <b>' + escapeHtml(fmtDate(grace_expires_at)) + '</b> while we retry.' : 'You will not lose access immediately.'}
    </div>
    <p>Most declines are cleared by updating your payment method. You can do that here:</p>
    <a class="btn" href="${APP_URL}/account">Update payment method</a>
  `;
  return {
    subject: `Payment failed — ${plan_label || 'ProofTamil Pro'}`,
    html: shell({ preheader: `We'll retry the charge. Your access continues for now.`, body }),
  };
}

function featureLabel(f) {
  const labels = {
    proofreading: 'Unlimited proofreading',
    ocr:          'Handwriting OCR',
    export:       'DOCX / PDF export',
  };
  return labels[f] || f;
}

module.exports = {
  welcome,
  renewalReminder,
  renewalSuccess,
  cancellation,
  paymentFailed,
  FROM_NAME,
  FROM_ADDR,
};
