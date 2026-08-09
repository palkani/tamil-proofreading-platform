const express = require('express');

const {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  RATE_LIMIT_IP_CAPACITY,
  RATE_LIMIT_IP_WINDOW_MS,
  RATE_LIMIT_SESSION_CAPACITY,
  RATE_LIMIT_SESSION_WINDOW_MS,
} = require('../lib/chatbot/config');
const { embedText, streamChat } = require('../lib/chatbot/gemini');
const { detectLeadIntent } = require('../lib/chatbot/leadIntent');
const { notifyNewLead } = require('../lib/chatbot/notify');
const {
  appendMessage,
  ensureConversation,
  insertLead,
  markLeadOffered,
} = require('../lib/chatbot/persistence');
const { consume } = require('../lib/chatbot/rateLimit');
const { buildSystemPrompt } = require('../lib/chatbot/systemPrompt');
const { matchChunks } = require('../lib/chatbot/vectorStore');

/**
 * ProofTamil chatbot routes.
 *
 * Mounted at /api by create-app.js, giving:
 *   POST /api/chat   NDJSON stream
 *   POST /api/leads  consent-gated lead capture
 *
 * NDJSON wire format — one JSON object per line:
 *   {"type":"token","value":"..."}                      streamed answer text
 *   {"type":"meta","leadCapture":bool,"sources":[...]}   final line, always last
 *   {"type":"error","value":"..."}                       graceful failure
 */

const router = express.Router();

/* ---------------------------------------------------------------- helpers */

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.ip || 'unknown';
}

function writeLine(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

function ndjsonError(res, message, status) {
  res.status(status).type('application/x-ndjson');
  res.end(`${JSON.stringify({ type: 'error', value: message })}\n`);
}

class ValidationError extends Error {}

function validate(body) {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const { sessionId, messages, pageUrl, locale } = body;

  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID-like string.');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('messages must be a non-empty array.');
  }
  // Cap before any per-message work so an oversized array cannot be used to
  // burn CPU on validation alone.
  if (messages.length > 100) throw new ValidationError('Too many messages.');

  const cleaned = messages.map((message, index) => {
    if (typeof message !== 'object' || message === null) {
      throw new ValidationError(`messages[${index}] must be an object.`);
    }
    const { role, content } = message;
    if (role !== 'user' && role !== 'assistant') {
      throw new ValidationError(`messages[${index}].role must be "user" or "assistant".`);
    }
    if (typeof content !== 'string') {
      throw new ValidationError(`messages[${index}].content must be a string.`);
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new ValidationError(`Message too long (limit ${MAX_MESSAGE_CHARS} characters).`);
    }
    return { role, content };
  });

  if (cleaned[cleaned.length - 1].role !== 'user') {
    throw new ValidationError('The last message must be from the user.');
  }

  const asString = (value, max) =>
    typeof value === 'string' && value.length <= max ? value : undefined;

  return {
    sessionId,
    messages: cleaned,
    pageUrl: asString(pageUrl, 2000),
    locale: asString(locale, 20),
  };
}

/** Citations for the meta line: deduped by URL, most relevant first. */
function toSources(chunks) {
  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.url)) continue;
    seen.add(chunk.url);
    sources.push({ url: chunk.url, title: chunk.title });
    if (sources.length === 3) break;
  }

  return sources;
}

/* ------------------------------------------------------------- POST /chat */

router.post('/chat', async (req, res) => {
  let parsed;
  try {
    parsed = validate(req.body);
  } catch (error) {
    const message =
      error instanceof ValidationError ? error.message : 'Request body must be valid JSON.';
    return ndjsonError(res, message, 400);
  }

  const { sessionId, messages, pageUrl, locale } = parsed;

  // Two independent buckets. The IP bucket is the abuse ceiling; the session
  // bucket stops a single tab hammering the model even from a shared NAT where
  // the IP limit would be spread across many legitimate users.
  if (!consume(`ip:${clientIp(req)}`, RATE_LIMIT_IP_CAPACITY, RATE_LIMIT_IP_WINDOW_MS).ok) {
    return ndjsonError(res, 'Too many requests. Please wait a moment and try again.', 429);
  }
  if (
    !consume(`session:${sessionId}`, RATE_LIMIT_SESSION_CAPACITY, RATE_LIMIT_SESSION_WINDOW_MS).ok
  ) {
    return ndjsonError(res, 'You are sending messages very quickly. Please slow down.', 429);
  }

  const question = messages[messages.length - 1].content.trim();
  if (!question) return ndjsonError(res, 'Message cannot be empty.', 400);

  /* -------------------------------------------------------- retrieval */

  let chunks = [];
  try {
    const queryEmbedding = await embedText(question, 'RETRIEVAL_QUERY');
    chunks = await matchChunks(queryEmbedding);
  } catch (error) {
    // Not fatal: an ungrounded reply beats a dead widget, and the empty context
    // makes the model say it is unsure rather than invent an answer.
    console.error('[chat] retrieval failed:', error.message);
  }

  /* ------------------------------------------------------ persistence */

  // Best-effort throughout: storage problems must never cost the visitor their
  // answer, so every persistence call is individually guarded.
  let conversationId = null;
  let leadAlreadyOffered = false;

  try {
    const conversation = await ensureConversation(sessionId, pageUrl, locale);
    conversationId = conversation.id;
    leadAlreadyOffered = conversation.leadOffered;
    await appendMessage(conversationId, 'user', question);
  } catch (error) {
    console.error('[chat] persistence unavailable:', error.message);
  }

  const sources = toSources(chunks);
  const systemPrompt = buildSystemPrompt({ chunks, pageUrl, locale });

  // Trim oldest-first, then drop a leading assistant turn: Gemini requires the
  // conversation to start with a user turn, and a naive slice can strand one.
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  while (trimmed.length > 0 && trimmed[0].role !== 'user') trimmed.shift();

  const history = trimmed.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    text: message.content,
  }));

  /* ---------------------------------------------------------- stream */

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  // Without this, nginx buffers the whole response and the "streaming" UI
  // arrives in one lump.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let answer = '';
  let leadCapture = false;

  try {
    const deltas = await streamChat(systemPrompt, history);

    for await (const delta of deltas) {
      answer += delta;
      writeLine(res, { type: 'token', value: delta });
    }

    // Decided here rather than up front: `meta` is the last line out, so the
    // finished answer is available — and the bot admitting it does not know is
    // a far better "offer to follow up" signal than the retrieval count, which
    // stays non-zero for near-miss chunks.
    leadCapture = detectLeadIntent({
      message: question,
      answer,
      retrievedCount: chunks.length,
      alreadyOffered: leadAlreadyOffered,
    }).capture;

    writeLine(res, { type: 'meta', leadCapture, sources });
  } catch (error) {
    // Log the real error server-side; send the visitor something human. The
    // message must never carry a stack trace or the upstream API's text.
    console.error('[chat] generation failed:', error.message);
    writeLine(res, {
      type: 'error',
      value: 'Sorry — something went wrong generating that reply. Please try again.',
    });
  } finally {
    res.end();
  }

  if (conversationId && answer) {
    try {
      await appendMessage(conversationId, 'assistant', answer, sources);
      if (leadCapture) await markLeadOffered(conversationId);
    } catch (error) {
      console.error('[chat] failed to store reply:', error.message);
    }
  }
});

/* ------------------------------------------------------------ POST /leads */

/**
 * Deliberately permissive. Strict RFC 5322 validation rejects addresses that
 * genuinely deliver, and the cost of a bad row is far lower than turning away
 * a real lead. Real verification is the follow-up email.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function optionalString(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

router.post('/leads', async (req, res) => {
  // Far tighter than the chat limit: nobody legitimately submits more than a
  // handful of leads a minute.
  if (!consume(`lead:${clientIp(req)}`, 5, RATE_LIMIT_IP_WINDOW_MS).ok) {
    return res.status(429).json({ error: 'Too many submissions. Please wait a moment.' });
  }

  const body = req.body;
  if (typeof body !== 'object' || body === null) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }

  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  // Must be an explicit boolean true. Accepting "true", 1, or any truthy value
  // would let a client opt someone in by accident.
  if (body.consent !== true) {
    return res.status(400).json({ error: 'Consent is required before we can store your email.' });
  }

  const name = optionalString(body.name, 120);
  const context = optionalString(body.context, MAX_MESSAGE_CHARS);
  const pageUrl = optionalString(body.pageUrl, 2000);
  const sessionId = optionalString(body.sessionId, 64);

  try {
    await insertLead({ email, name, context, pageUrl, sessionId });
  } catch (error) {
    console.error('[leads] failed to store lead:', error.message);
    return res.status(500).json({ error: 'We could not save that just now. Please try again.' });
  }

  // Notify after the row is safely stored, and never let a transport failure
  // turn a captured lead into an error the visitor sees.
  const notified = await notifyNewLead({
    email,
    name: name || undefined,
    context: context || undefined,
    pageUrl: pageUrl || undefined,
    sessionId: sessionId || undefined,
  });

  if (notified === 'failed' || notified === 'not-configured') {
    console.warn(`[leads] stored ${email} but notification result was "${notified}".`);
  }

  return res.status(201).json({ ok: true });
});

module.exports = router;
