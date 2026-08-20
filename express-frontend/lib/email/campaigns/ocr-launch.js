/**
 * "Handwriting OCR is live" launch email — for non-Pro newsletter subscribers.
 *
 * MARKETING BRIEF (2026-08-20)
 * ─────────────────────────────
 *   Audience:     Registered users on the Free plan who subscribed to the
 *                 newsletter. Do NOT send to Pro subscribers (they already have
 *                 the 20/month allowance).
 *   Goal:         Get them to try the OCR at /tools/handwriting-ocr this week.
 *   Secondary:    Warm nudge toward Pro for users who hit the 1/month cap.
 *   Success:      Track via UTMs — email_ocr_launch_2026_08 in GA4.
 *
 *   Subject A (recommended): "Your handwritten Tamil notes, now editable text"
 *   Subject B:               "New: turn Tamil handwriting into text — free"
 *   Preview text:            "Photograph a page of notes and get clean Tamil
 *                            text back in seconds. 1 free conversion each
 *                            month, no download."
 *
 * COMPLIANCE
 * ──────────
 *   Every message MUST include an unsubscribe link (RFC 8058 one-click header
 *   + a visible footer link). The caller passes `unsubscribeUrl`; if omitted
 *   we fall back to /api/newsletter/unsubscribe?email=… so the user always has
 *   a way out (Gmail/Outlook require this or they'll spam-fold us).
 *
 * USAGE
 * ─────
 *   const { render } = require('./ocr-launch');
 *   const { subject, html, text, listUnsubscribe } = render({
 *     name: user.name, email: user.email, unsubscribeToken: user.newsletter_token,
 *   });
 *   await sendEmail({ to: user.email, subject, html, text, listUnsubscribe });
 */

const BASE_URL = 'https://www.prooftamil.com';
const CAMPAIGN = 'ocr_launch_2026_08';
const UTM = `utm_source=email&utm_medium=lifecycle&utm_campaign=${CAMPAIGN}`;
const link = (path, extra = '') =>
  `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}${UTM}${extra ? '&' + extra : ''}`;

const SUBJECT = 'Your handwritten Tamil notes, now editable text';
const PREVIEW = 'Photograph a page of notes and get clean Tamil text back in seconds. 1 free conversion each month, no download.';

function render({ name, email, unsubscribeToken } = {}) {
  const displayName = firstName(name) || 'there';
  const unsubscribeUrl = unsubscribeToken
    ? `${BASE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${BASE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email || '')}`;

  return {
    subject: SUBJECT,
    listUnsubscribe: unsubscribeUrl,
    html: renderHtml(displayName, unsubscribeUrl),
    text: renderText(displayName, unsubscribeUrl),
  };
}

function renderHtml(displayName, unsubscribeUrl) {
  // Inline styles only — Gmail strips <style> blocks, Outlook ignores many rules.
  // Table-based layout for Outlook 2019/365 desktop compatibility.
  const btn = (label, href, bg = '#4F46E5') =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${SUBJECT}</title>
<meta name="description" content="${PREVIEW}">
</head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${PREVIEW}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(15,13,42,0.06);">

        <!-- Header strip -->
        <tr><td style="padding:24px 32px;border-bottom:1px solid #eef0f7;">
          <a href="${link('/')}" style="text-decoration:none;color:#1a1a2e;font-weight:800;font-size:18px;letter-spacing:-0.01em;">ProofTamil</a>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:36px 32px 16px 32px;">
          <p style="margin:0 0 18px 0;font-size:14px;color:#7C3AED;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">New feature</p>
          <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.25;font-weight:800;letter-spacing:-0.01em;color:#0f0d2a;">
            Your handwritten Tamil notes,<br>now editable text.
          </h1>
          <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#4a4a5e;">
            Hi ${escapeHtml(displayName)}, we just shipped something we've wanted for a long time — handwriting OCR that actually gets Tamil right, குறில் / நெடில் and all.
          </p>
          <p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#4a4a5e;">
            Photograph a page of your handwriting, upload it, and get clean editable Tamil text back in seconds. No app, no download.
          </p>
          ${btn('Try Handwriting OCR — free →', link('/tools/handwriting-ocr'), '#F59E0B')}
        </td></tr>

        <!-- Use cases -->
        <tr><td style="padding:16px 32px 8px 32px;">
          <p style="margin:0 0 12px 0;font-size:13px;color:#7a7a8e;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">People are using it for</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td width="24" valign="top" style="padding:6px 12px 6px 0;font-size:18px;">📚</td>
              <td valign="top" style="padding:6px 0;font-size:15px;line-height:1.55;color:#1a1a2e;"><b>Class notes to study material</b> — snap the whiteboard or a friend's notes and get searchable text.</td>
            </tr>
            <tr>
              <td width="24" valign="top" style="padding:6px 12px 6px 0;font-size:18px;">✉️</td>
              <td valign="top" style="padding:6px 0;font-size:15px;line-height:1.55;color:#1a1a2e;"><b>Old family letters into digital archives</b> — preserve grandparents' letters as text you can back up and share.</td>
            </tr>
            <tr>
              <td width="24" valign="top" style="padding:6px 12px 6px 0;font-size:18px;">📝</td>
              <td valign="top" style="padding:6px 0;font-size:15px;line-height:1.55;color:#1a1a2e;"><b>Manuscript drafts into a working editor</b> — writers and poets, upload a page and pick up in the editor with grammar checking already on.</td>
            </tr>
            <tr>
              <td width="24" valign="top" style="padding:6px 12px 6px 0;font-size:18px;">🎓</td>
              <td valign="top" style="padding:6px 0;font-size:15px;line-height:1.55;color:#1a1a2e;"><b>Exam answer sheets for review</b> — teachers and students working through model answers in Tamil-medium schools.</td>
            </tr>
          </table>
        </td></tr>

        <!-- What we didn't cut corners on -->
        <tr><td style="padding:28px 32px 8px 32px;">
          <p style="margin:0 0 12px 0;font-size:13px;color:#7a7a8e;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Why this one works</p>
          <p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#4a4a5e;">
            Most OCR is built for English and struggles with the vowel signs, sandhi, and ligatures that make Tamil, well, Tamil. Ours is tuned specifically for that.
          </p>
          <ul style="margin:0 0 8px 0;padding-left:20px;font-size:15px;line-height:1.7;color:#4a4a5e;">
            <li>Reads printed and handwritten Tamil.</li>
            <li>Suggests corrections for likely misreads — you approve or ignore each one.</li>
            <li>Your image is deleted immediately after processing. Only the extracted text stays with you.</li>
          </ul>
        </td></tr>

        <!-- Free tier + Pro nudge -->
        <tr><td style="padding:16px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf9ff;border:1px solid #ede7ff;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 6px 0;font-size:15px;line-height:1.5;color:#0f0d2a;"><b>Free plan:</b> 1 conversion per month.</p>
              <p style="margin:0 0 14px 0;font-size:14px;line-height:1.5;color:#4a4a5e;">Do more? <a href="${link('/pricing')}" style="color:#4F46E5;text-decoration:underline;font-weight:600;">ProofTamil PRO</a> is 20 conversions per month, plus unlimited grammar checks and priority processing.</p>
              ${btn('See Pro plans', link('/pricing'))}
            </td></tr>
          </table>
        </td></tr>

        <!-- Sign-off -->
        <tr><td style="padding:28px 32px 12px 32px;">
          <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#4a4a5e;">Try it and hit reply — I read every response and the feedback shapes what ships next.</p>
          <p style="margin:0;font-size:15px;color:#4a4a5e;">— The ProofTamil team</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 32px 28px 32px;border-top:1px solid #eef0f7;">
          <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#8a8aa0;">
            You're receiving this because you subscribed to ProofTamil product updates.
            <br>
            <a href="${unsubscribeUrl}" style="color:#8a8aa0;text-decoration:underline;">Unsubscribe</a>
            &nbsp;·&nbsp;
            <a href="${link('/privacy')}" style="color:#8a8aa0;text-decoration:underline;">Privacy</a>
            &nbsp;·&nbsp;
            <a href="${link('/security')}" style="color:#8a8aa0;text-decoration:underline;">Security</a>
          </p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a8a8bc;">
            ProofTamil · <a href="${link('/')}" style="color:#a8a8bc;text-decoration:underline;">prooftamil.com</a>
          </p>
        </td></tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

function renderText(displayName, unsubscribeUrl) {
  return [
    `Your handwritten Tamil notes, now editable text.`,
    ``,
    `Hi ${displayName},`,
    ``,
    `We just shipped something we've wanted for a long time — handwriting OCR`,
    `that actually gets Tamil right, குறில் / நெடில் and all.`,
    ``,
    `Photograph a page of your handwriting, upload it, and get clean editable`,
    `Tamil text back in seconds. No app, no download.`,
    ``,
    `→ Try it: ${link('/tools/handwriting-ocr')}`,
    ``,
    `WHAT PEOPLE ARE USING IT FOR`,
    ``,
    `  • Class notes to study material — snap the whiteboard, get searchable text.`,
    `  • Old family letters into digital archives.`,
    `  • Manuscript drafts into a working editor with grammar checking already on.`,
    `  • Exam answer sheets for review.`,
    ``,
    `WHY THIS ONE WORKS`,
    ``,
    `Most OCR is built for English and struggles with the vowel signs, sandhi,`,
    `and ligatures that make Tamil, well, Tamil. Ours is tuned specifically for that.`,
    ``,
    `  • Reads printed and handwritten Tamil.`,
    `  • Suggests corrections for likely misreads — you approve or ignore each one.`,
    `  • Your image is deleted immediately after processing.`,
    ``,
    `FREE PLAN: 1 conversion per month.`,
    `Need more? ProofTamil PRO is 20 conversions per month, plus unlimited`,
    `grammar checks and priority processing: ${link('/pricing')}`,
    ``,
    `Try it and hit reply — I read every response and the feedback shapes what`,
    `ships next.`,
    ``,
    `— The ProofTamil team`,
    ``,
    `---`,
    `You're receiving this because you subscribed to ProofTamil product updates.`,
    `Unsubscribe: ${unsubscribeUrl}`,
    `Privacy: ${link('/privacy')}  ·  Security: ${link('/security')}`,
    `ProofTamil · ${BASE_URL}`,
  ].join('\n');
}

function firstName(fullName) {
  if (!fullName) return '';
  return String(fullName).trim().split(/\s+/)[0].slice(0, 30);
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { render, SUBJECT, PREVIEW, CAMPAIGN };
