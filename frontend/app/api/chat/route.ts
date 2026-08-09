import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  RATE_LIMIT_IP_CAPACITY,
  RATE_LIMIT_IP_WINDOW_MS,
  RATE_LIMIT_SESSION_CAPACITY,
  RATE_LIMIT_SESSION_WINDOW_MS,
} from '@/lib/chatbot/config';
import { embedText, streamChat, type ChatTurn } from '@/lib/chatbot/gemini';
import { detectLeadIntent } from '@/lib/chatbot/leadIntent';
import {
  appendMessage,
  ensureConversation,
  markLeadOffered,
  type Source,
} from '@/lib/chatbot/persistence';
import { consume } from '@/lib/chatbot/rateLimit';
import { buildSystemPrompt } from '@/lib/chatbot/systemPrompt';
import { matchChunks, type MatchedChunk } from '@/lib/chatbot/vectorStore';

/**
 * Streaming chat endpoint.
 *
 * Wire format is NDJSON — one JSON object per line:
 *   {"type":"token","value":"..."}                        streamed answer text
 *   {"type":"meta","leadCapture":bool,"sources":[...]}     final line, always last
 *   {"type":"error","value":"..."}                         graceful failure
 *
 * NDJSON rather than SSE because the widget reads it with a plain
 * `fetch` + `ReadableStream` reader; there is no EventSource involved and no
 * need for its reconnect semantics on a one-shot request.
 */

// Node runtime, not Edge: @google/genai and the Supabase service client both
// expect Node built-ins.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------- validation */

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  sessionId: string;
  messages: IncomingMessage[];
  pageUrl?: string;
  locale?: string;
}

class ValidationError extends Error {}

function validate(body: unknown): ChatRequest {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const { sessionId, messages, pageUrl, locale } = body as Record<string, unknown>;

  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID-like string.');
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('messages must be a non-empty array.');
  }

  // Cap before any per-message work so an oversized array cannot be used to
  // burn CPU on validation alone.
  if (messages.length > 100) {
    throw new ValidationError('Too many messages.');
  }

  const cleaned: IncomingMessage[] = messages.map((message, index) => {
    if (typeof message !== 'object' || message === null) {
      throw new ValidationError(`messages[${index}] must be an object.`);
    }
    const { role, content } = message as Record<string, unknown>;

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

  const asString = (value: unknown, max: number) =>
    typeof value === 'string' && value.length <= max ? value : undefined;

  return {
    sessionId,
    messages: cleaned,
    pageUrl: asString(pageUrl, 2_000),
    locale: asString(locale, 20),
  };
}

/* ---------------------------------------------------------------- helpers */

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function line(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

function ndjsonError(message: string, status: number): Response {
  // A plain string body here, not the encoded `line()` — non-stream responses
  // take the string overload, and Response has no Uint8Array overload under
  // the DOM lib's BodyInit.
  return new Response(`${JSON.stringify({ type: 'error', value: message })}\n`, {
    status,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

/** Citations for the meta line: deduped by URL, most relevant first. */
function toSources(chunks: MatchedChunk[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.url)) continue;
    seen.add(chunk.url);
    sources.push({ url: chunk.url, title: chunk.title });
    if (sources.length === 3) break;
  }

  return sources;
}

/* ------------------------------------------------------------------- POST */

export async function POST(request: Request): Promise<Response> {
  let parsed: ChatRequest;

  try {
    parsed = validate(await request.json());
  } catch (error) {
    const message =
      error instanceof ValidationError ? error.message : 'Request body must be valid JSON.';
    return ndjsonError(message, 400);
  }

  const { sessionId, messages, pageUrl, locale } = parsed;

  // Two independent buckets. The IP bucket is the abuse ceiling; the session
  // bucket stops a single tab hammering the model even from a shared NAT where
  // the IP limit would be spread across many legitimate users.
  const ipLimit = consume(`ip:${clientIp(request)}`, RATE_LIMIT_IP_CAPACITY, RATE_LIMIT_IP_WINDOW_MS);
  if (!ipLimit.ok) {
    return ndjsonError('Too many requests. Please wait a moment and try again.', 429);
  }

  const sessionLimit = consume(
    `session:${sessionId}`,
    RATE_LIMIT_SESSION_CAPACITY,
    RATE_LIMIT_SESSION_WINDOW_MS,
  );
  if (!sessionLimit.ok) {
    return ndjsonError('You are sending messages very quickly. Please slow down.', 429);
  }

  const question = messages[messages.length - 1].content.trim();
  if (!question) {
    return ndjsonError('Message cannot be empty.', 400);
  }

  /* ------------------------------------------------------------ retrieval */

  let chunks: MatchedChunk[] = [];
  try {
    const queryEmbedding = await embedText(question, 'RETRIEVAL_QUERY');
    chunks = await matchChunks(queryEmbedding);
  } catch (error) {
    // Retrieval failure is not fatal: an ungrounded reply is still better than
    // a dead widget, and the empty context makes the model say it is unsure
    // rather than invent an answer.
    console.error('[chat] retrieval failed:', (error as Error).message);
  }

  /* ---------------------------------------------------------- persistence */

  // Best-effort throughout: storage problems must never cost the visitor their
  // answer, so every persistence call is individually guarded.
  let conversationId: string | null = null;
  let leadAlreadyOffered = false;

  try {
    const conversation = await ensureConversation(sessionId, pageUrl, locale);
    conversationId = conversation.id;
    leadAlreadyOffered = conversation.leadOffered;
    await appendMessage(conversationId, 'user', question);
  } catch (error) {
    console.error('[chat] persistence unavailable:', (error as Error).message);
  }

  const sources = toSources(chunks);

  /* -------------------------------------------------------------- generate */

  const systemPrompt = buildSystemPrompt({ chunks, pageUrl, locale });

  // Trim oldest-first, then drop a leading assistant turn: Gemini requires the
  // conversation to start with a user turn, and a naive slice can leave one
  // stranded at the front.
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  while (trimmed.length > 0 && trimmed[0].role !== 'user') trimmed.shift();

  const history: ChatTurn[] = trimmed.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    text: message.content,
  }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';
      let leadCapture = false;

      try {
        const deltas = await streamChat(systemPrompt, history);

        for await (const delta of deltas) {
          answer += delta;
          controller.enqueue(line({ type: 'token', value: delta }));
        }

        // Decided here rather than up front: `meta` is the last line out, so the
        // finished answer is available — and the bot admitting it does not know
        // is a far better "offer to follow up" signal than the retrieval count,
        // which stays non-zero for near-miss chunks.
        leadCapture = detectLeadIntent({
          message: question,
          answer,
          retrievedCount: chunks.length,
          alreadyOffered: leadAlreadyOffered,
        }).capture;

        controller.enqueue(line({ type: 'meta', leadCapture, sources }));
      } catch (error) {
        // Log the real error server-side; send the visitor something human. The
        // message must never carry a stack trace or the upstream API's text,
        // which can echo request details back.
        console.error('[chat] generation failed:', (error as Error).message);
        controller.enqueue(
          line({
            type: 'error',
            value: 'Sorry — something went wrong generating that reply. Please try again.',
          }),
        );
      } finally {
        controller.close();
      }

      if (conversationId && answer) {
        try {
          await appendMessage(conversationId, 'assistant', answer, sources);
          if (leadCapture) await markLeadOffered(conversationId);
        } catch (error) {
          console.error('[chat] failed to store reply:', (error as Error).message);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Without this, nginx buffers the whole response and the "streaming" UI
      // arrives in one lump.
      'X-Accel-Buffering': 'no',
    },
  });
}
