import 'server-only';

import { query, queryOne } from './db';

/**
 * Conversation and message storage.
 *
 * Persistence is best-effort by design: a failure to write history must never
 * cost the visitor their answer. Callers log and continue rather than aborting
 * the stream — see the try/catch sites in app/api/chat/route.ts.
 */

export interface Source {
  url: string;
  title: string;
}

export interface Conversation {
  id: string;
  leadOffered: boolean;
}

/**
 * Find-or-create the conversation for a browser session.
 *
 * A single upsert rather than SELECT-then-INSERT: two tabs opening at once
 * would race the read, and `on conflict` resolves that in one round trip
 * instead of needing a retry path.
 */
export async function ensureConversation(
  sessionId: string,
  pageUrl?: string,
  locale?: string,
): Promise<Conversation> {
  const row = await queryOne<{ id: string; lead_offered: boolean }>(
    `insert into chatbot_conversations (session_id, page_url, locale)
     values ($1, $2, $3)
     on conflict (session_id) do update
       set last_message_at = now()
     returning id, lead_offered`,
    [sessionId, pageUrl ?? null, locale ?? null],
  );

  if (!row) throw new Error('Failed to upsert conversation: no row returned.');
  return { id: row.id, leadOffered: row.lead_offered };
}

export async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources: Source[] = [],
): Promise<void> {
  await query(
    `insert into chatbot_messages (conversation_id, role, content, sources)
     values ($1, $2, $3, $4::jsonb)`,
    [conversationId, role, content, JSON.stringify(sources)],
  );

  await query(`update chatbot_conversations set last_message_at = now() where id = $1`, [
    conversationId,
  ]);
}

/**
 * Record that the email-capture card was shown, so it is offered at most once
 * per session. Server-side state, not a client flag — otherwise clearing
 * localStorage would re-trigger the prompt on every turn.
 */
export async function markLeadOffered(conversationId: string): Promise<void> {
  await query(`update chatbot_conversations set lead_offered = true where id = $1`, [
    conversationId,
  ]);
}

/* ------------------------------------------------------------------- leads */

export interface LeadInput {
  email: string;
  name: string | null;
  context: string | null;
  pageUrl: string | null;
  sessionId: string | null;
}

export async function insertLead(lead: LeadInput): Promise<void> {
  await query(
    `insert into chatbot_leads (email, name, context, page_url, session_id, consent)
     values ($1, $2, $3, $4, $5, true)`,
    [lead.email, lead.name, lead.context, lead.pageUrl, lead.sessionId],
  );
}
