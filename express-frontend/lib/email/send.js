/**
 * Shared transactional email sender.
 *
 * Extracted from the inline transports in routes/api.js (/api/contact,
 * /api/account/delete-request) and lib/chatbot/notify.js so we don't
 * triple-maintain the Resend → SendGrid → SMTP fallback chain.
 *
 * Transport priority (first configured wins):
 *   1. Resend HTTP API       (RESEND_API_KEY)
 *   2. SendGrid HTTP API     (SENDGRID_API_KEY, or SMTP password starting "SG.")
 *   3. SMTP (nodemailer)     (SMTP_HOST + SMTP_PASSWORD)
 *
 * HTTP APIs are preferred over SMTP because Vercel's serverless runtime
 * has intermittent trouble with outbound SMTP on port 587/465.
 *
 * If nothing is configured, sendEmail() resolves with { ok:false, transport:'none' }
 * and logs a warning. It NEVER throws — the caller decides how to handle it.
 * That way an email failure never blocks a user-facing request path.
 */

const nodemailer = require('nodemailer');

function envDefaults() {
  const smtpPass = process.env.SMTP_PASSWORD || process.env.SENDGRID_SMTP_PASSWORD || '';
  return {
    resendKey: (process.env.RESEND_API_KEY || '').trim(),
    // SG. prefix keys work with both SendGrid SMTP and SendGrid HTTP API.
    sgApiKey: (process.env.SENDGRID_API_KEY || (smtpPass.startsWith('SG.') ? smtpPass : '')).trim(),
    smtpPass,
    smtpHost: process.env.SMTP_HOST || process.env.SENDGRID_SMTP_HOST || 'smtp.sendgrid.net',
    smtpPort: parseInt(process.env.SMTP_PORT || process.env.SENDGRID_SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER || process.env.SENDGRID_SMTP_USER || null,
    fromEmail: process.env.EMAIL_FROM_ADDRESS || 'noreply@prooftamil.com',
    fromName: process.env.EMAIL_FROM_NAME || 'ProofTamil',
  };
}

/**
 * sendEmail({ to, subject, html, text?, replyTo?, listUnsubscribe? })
 *   → { ok, transport, error? }
 *
 * `listUnsubscribe` (optional) sets RFC 8058 List-Unsubscribe + List-Unsubscribe-Post
 * headers so Gmail/Outlook show the one-click unsubscribe button. Pass a URL like
 * `https://www.prooftamil.com/api/newsletter/unsubscribe?token=…`.
 */
async function sendEmail(opts) {
  const { to, subject, html } = opts || {};
  if (!to || !subject || !html) {
    throw new Error('sendEmail: to, subject, and html are required');
  }
  const text = opts.text || htmlToText(html);
  const env = envDefaults();

  if (env.resendKey) {
    try { await sendViaResend(opts, text, env); return { ok: true, transport: 'resend' }; }
    catch (err) { console.error('[email] Resend send failed:', err.message); return { ok: false, transport: 'resend', error: err.message }; }
  }
  if (env.sgApiKey) {
    try { await sendViaSendGrid(opts, text, env); return { ok: true, transport: 'sendgrid' }; }
    catch (err) { console.error('[email] SendGrid send failed:', err.message); return { ok: false, transport: 'sendgrid', error: err.message }; }
  }
  if (env.smtpPass) {
    try { await sendViaSMTP(opts, text, env); return { ok: true, transport: 'smtp' }; }
    catch (err) { console.error('[email] SMTP send failed:', err.message); return { ok: false, transport: 'smtp', error: err.message }; }
  }
  console.warn(`[email] No transport configured — email to ${to} NOT sent. Subject: ${subject}`);
  return { ok: false, transport: 'none' };
}

async function sendViaResend({ to, subject, html, replyTo, listUnsubscribe }, text, env) {
  const payload = {
    from: `${env.fromName} <${env.fromEmail}>`,
    to: [to],
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(listUnsubscribe ? {
      headers: {
        'List-Unsubscribe': `<${listUnsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    } : {}),
  };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text().catch(() => '')}`);
}

async function sendViaSendGrid({ to, subject, html, replyTo, listUnsubscribe }, text, env) {
  const body = {
    from: { email: env.fromEmail, name: env.fromName },
    personalizations: [{ to: [{ email: to }], subject }],
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html',  value: html },
    ],
    ...(replyTo ? { reply_to: { email: replyTo } } : {}),
    ...(listUnsubscribe ? {
      headers: {
        'List-Unsubscribe': `<${listUnsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    } : {}),
  };
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.sgApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status >= 400) throw new Error(`SendGrid ${r.status}: ${await r.text().catch(() => '')}`);
}

async function sendViaSMTP({ to, subject, html, replyTo, listUnsubscribe }, text, env) {
  const t = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser || env.fromEmail, pass: env.smtpPass },
  });
  await t.sendMail({
    from: `"${env.fromName}" <${env.fromEmail}>`,
    to, subject, html, text,
    ...(replyTo ? { replyTo } : {}),
    ...(listUnsubscribe ? {
      headers: {
        'List-Unsubscribe': `<${listUnsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    } : {}),
  });
}

/** Very simple HTML→text fallback for callers that don't provide a text version.
 *  Enough for ESP acceptance filters; not a full parser. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { sendEmail };
