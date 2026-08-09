import { MAX_MESSAGE_CHARS, RATE_LIMIT_IP_WINDOW_MS } from '@/lib/chatbot/config';
import { notifyNewLead } from '@/lib/chatbot/notify';
import { insertLead } from '@/lib/chatbot/persistence';
import { consume } from '@/lib/chatbot/rateLimit';

/**
 * Lead capture endpoint.
 *
 * Stores a consented email and fires a notification to the team. Consent is
 * enforced twice — here, and by a CHECK constraint on the table — so a bug in
 * this route cannot produce an unconsented row.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deliberately permissive. Strict RFC 5322 validation rejects addresses that
 * genuinely deliver, and the cost of a bad row here is far lower than the cost
 * of turning away a real lead. Real verification is the follow-up email.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function optionalString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(request: Request): Promise<Response> {
  // Far tighter than the chat limit: a visitor has no legitimate reason to
  // submit more than a handful of leads a minute.
  const limit = consume(`lead:${clientIp(request)}`, 5, RATE_LIMIT_IP_WINDOW_MS);
  if (!limit.ok) {
    return json({ error: 'Too many submissions. Please wait a moment.' }, 429);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
  if (!EMAIL_PATTERN.test(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  // Consent must be an explicit boolean true. Accepting "true", 1, or any
  // truthy value would let a client opt someone in by accident.
  if (body.consent !== true) {
    return json({ error: 'Consent is required before we can store your email.' }, 400);
  }

  const name = optionalString(body.name, 120);
  const context = optionalString(body.context, MAX_MESSAGE_CHARS);
  const pageUrl = optionalString(body.pageUrl, 2_000);
  const sessionId = optionalString(body.sessionId, 64);

  try {
    await insertLead({ email, name, context, pageUrl, sessionId });
  } catch (error) {
    console.error('[leads] failed to store lead:', (error as Error).message);
    return json({ error: 'We could not save that just now. Please try again.' }, 500);
  }

  // Notify after the row is safely stored, and never let a transport failure
  // turn a captured lead into an error the visitor sees.
  const notified = await notifyNewLead({
    email,
    name: name ?? undefined,
    context: context ?? undefined,
    pageUrl: pageUrl ?? undefined,
    sessionId: sessionId ?? undefined,
  });

  if (notified === 'failed' || notified === 'not-configured') {
    console.warn(`[leads] stored ${email} but notification result was "${notified}".`);
  }

  return json({ ok: true }, 201);
}
