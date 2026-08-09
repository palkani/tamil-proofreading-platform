import 'server-only';

import { LEAD_NOTIFY_TO } from './config';

/**
 * Lead notification.
 *
 * Mirrors the env contract the Go backend already uses
 * (backend/internal/services/email/email_service.go): Resend first, SendGrid
 * second. Both are called over HTTPS rather than SMTP so this needs no
 * nodemailer dependency and works unchanged on serverless.
 *
 * If neither is configured the lead is still SAVED — it just is not emailed,
 * and a warning is logged. Losing a notification is annoying; losing the lead
 * row would be unacceptable.
 */

export interface LeadNotification {
  email: string;
  name?: string;
  context?: string;
  pageUrl?: string;
  sessionId?: string;
}

export type NotifyResult = 'sent-resend' | 'sent-sendgrid' | 'not-configured' | 'failed';

/**
 * Include the provider's own explanation in the log.
 *
 * A bare "HTTP 403" is unactionable — the provider's body distinguishes an
 * unverified sender from a key missing mail.send scope, and those need
 * completely different fixes.
 */
async function describeFailure(response: Response): Promise<string> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    // Body already consumed or unreadable — the status alone will have to do.
  }
  return `HTTP ${response.status}${detail ? ` — ${detail}` : ''}`;
}

function buildBody(lead: LeadNotification): { subject: string; text: string } {
  return {
    subject: `New ProofTamil chatbot lead: ${lead.email}`,
    text: [
      `A visitor submitted their email through the ProofTamil chatbot.`,
      ``,
      `Email     : ${lead.email}`,
      `Name      : ${lead.name || '—'}`,
      `Page      : ${lead.pageUrl || '—'}`,
      `Session   : ${lead.sessionId || '—'}`,
      ``,
      `They had just asked:`,
      lead.context ? `  "${lead.context}"` : '  —',
      ``,
      `Consent was given explicitly via the in-chat capture card.`,
    ].join('\n'),
  };
}

async function sendViaResend(lead: LeadNotification, apiKey: string): Promise<boolean> {
  const { subject, text } = buildBody(lead);
  const from = process.env.EMAIL_FROM_ADDRESS ?? 'contact@prooftamil.com';
  const fromName = process.env.EMAIL_FROM_NAME ?? 'ProofTamil';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${from}>`,
      to: [LEAD_NOTIFY_TO],
      reply_to: lead.email,
      subject,
      text,
    }),
  });

  if (!response.ok) {
    console.error(`[leads] Resend rejected the notification: ${await describeFailure(response)}`);
    return false;
  }
  return true;
}

async function sendViaSendGrid(lead: LeadNotification, apiKey: string): Promise<boolean> {
  const { subject, text } = buildBody(lead);
  const from = process.env.EMAIL_FROM_ADDRESS ?? 'contact@prooftamil.com';
  const fromName = process.env.EMAIL_FROM_NAME ?? 'ProofTamil';

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: LEAD_NOTIFY_TO }] }],
      from: { email: from, name: fromName },
      reply_to: { email: lead.email },
      subject,
      content: [{ type: 'text/plain', value: text }],
    }),
  });

  if (!response.ok) {
    console.error(`[leads] SendGrid rejected the notification: ${await describeFailure(response)}`);
    return false;
  }
  return true;
}

export async function notifyNewLead(lead: LeadNotification): Promise<NotifyResult> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const sendgridKey = (process.env.SENDGRID_API_KEY ?? process.env.SENDGRID_SMTP_PASSWORD)?.trim();

  try {
    if (resendKey) {
      return (await sendViaResend(lead, resendKey)) ? 'sent-resend' : 'failed';
    }
    if (sendgridKey) {
      return (await sendViaSendGrid(lead, sendgridKey)) ? 'sent-sendgrid' : 'failed';
    }
  } catch (error) {
    console.error('[leads] notification transport threw:', (error as Error).message);
    return 'failed';
  }

  // TODO: set RESEND_API_KEY (or SENDGRID_API_KEY) in .env.local / your host's
  // env to turn this into a real email. See CHATBOT_README.md → "Lead
  // notifications". Until then leads accumulate in the chatbot_leads table and
  // this line is the only signal.
  console.warn(
    `[leads] No RESEND_API_KEY or SENDGRID_API_KEY configured — lead NOT emailed. ` +
      `Would have notified ${LEAD_NOTIFY_TO} about ${lead.email}.`,
  );
  return 'not-configured';
}
