# ProofTamil Chatbot

A bilingual (English + Tamil) support and lead-capture assistant for
[prooftamil.com](https://www.prooftamil.com), grounded in ProofTamil's own pages
via RAG.

It answers questions about the tools, pricing, plans and accounts, and captures
an email — with explicit consent — when a visitor shows buying intent or asks
something the site content cannot answer.

**Out of scope:** the bot does not proofread, transliterate, run OCR or write
content in the chat. It routes visitors to the existing product tools.

---

## Contents

- [Architecture](#architecture)
- [Setup from scratch](#setup-from-scratch)
- [Environment variables](#environment-variables)
- [Running the schema](#running-the-schema)
- [Ingestion](#ingestion)
- [Editing the system prompt](#editing-the-system-prompt)
- [The streaming protocol](#the-streaming-protocol)
- [Lead capture](#lead-capture)
- [Security posture](#security-posture)
- [Production notes](#production-notes)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
Visitor
  │
  ├─► components/chatbot/ChatWidget.tsx      floating widget (client)
  │        │  POST /api/chat  ── NDJSON stream ──►
  │        ▼
  │   app/api/chat/route.ts                  validate → rate-limit → embed
  │        │                                 → retrieve → prompt → stream
  │        ├─► lib/chatbot/gemini.ts          Gemini: embeddings + generation
  │        ├─► lib/chatbot/db.ts              pg pool (direct Postgres)
  │        ├─► lib/chatbot/vectorStore.ts     pgvector top-K cosine search
  │        ├─► lib/chatbot/systemPrompt.ts    persona + grounding rules
  │        ├─► lib/chatbot/leadIntent.ts      when to offer the email card
  │        └─► lib/chatbot/persistence.ts     conversations + messages
  │
  └─► POST /api/leads ─► chatbot_leads + notifyNewLead() ─► contact@prooftamil.com

scripts/ingest.ts   sitemap → fetch → extract → chunk → embed → upsert
```

Everything lives inside `frontend/`. The Go backend and the Express app are
untouched.

### Models

| Role | Default | Notes |
|---|---|---|
| Chat | `gemini-3.6-flash` | Flash tier. The `-lite` variants are cheaper but noticeably weaker in Tamil. |
| Embeddings | `gemini-embedding-001` | 768 dimensions via Matryoshka truncation. |

768 is deliberate: it keeps retrieval quality, cuts storage 4×, and stays under
pgvector's 2000-dimension ceiling for HNSW indexes — 3072-dim vectors cannot be
indexed at all.

Both are overridable via `CHAT_MODEL_ID` / `EMBEDDING_MODEL_ID`.

---

## Setup from scratch

```bash
cd frontend
npm install
cp .env.local.example .env.local     # then set CHATBOT_DATABASE_URL
```

1. **Pick a Postgres** with pgvector available — a Supabase project, Cloud SQL,
   or a local server for development.
2. **Run the schema** — see [below](#running-the-schema).
3. **Set `CHATBOT_DATABASE_URL`** in `frontend/.env.local`. No API keys needed —
   `GOOGLE_GENAI_API_KEY` and the SendGrid key are inherited from `../.env`.
4. **Ingest the site content:** `npm run ingest`
5. **Run it:** `npm run dev` → http://localhost:3100

---

## Environment variables

**Most credentials are inherited from the repo root.** `load-root-env.mjs` —
imported by both `next.config.mjs` and the ingest script — loads `../.env` and
`../.env.local` into the process, so the keys the Go backend and Express app
already use are reused here.

There is **no Supabase service-role key and no anon key**. The app connects
straight to Postgres as the table owner, so the only thing you set is which
database to use.

| Variable | Source | Purpose |
|---|---|---|
| `CHATBOT_DATABASE_URL` | **you set this** | Which Postgres holds the chatbot tables |
| `GOOGLE_GENAI_API_KEY` | inherited from `../.env` | Gemini, server-side only |
| `SENDGRID_SMTP_PASSWORD` | inherited from `../.env` | An `SG.…` key — used via the SendGrid v3 Web API |
| `EMAIL_FROM_ADDRESS`, `CONTACT_TO_EMAIL` | inherited from `../.env` | Notification envelope |
| `CHAT_MODEL_ID` | optional | Default `gemini-3.6-flash` |
| `EMBEDDING_MODEL_ID` | optional | Default `gemini-embedding-001` |
| `EMBEDDING_DIMENSIONS` | optional | Default `768` — must match `schema.sql` |
| `RAG_TOP_K` / `RAG_MIN_SCORE` | optional | Default `6` / `0.35` |
| `RESEND_API_KEY` | optional | Preferred lead-notification transport |

Precedence, highest first: real `process.env` (CI secrets, host dashboard) →
`frontend/.env.local` → `frontend/.env` → `../.env.local` → `../.env`. Root
files never override.

> **Always set `CHATBOT_DATABASE_URL` explicitly.** This repo has *two*
> different `DATABASE_URL`s — a Supabase pooler in `../.env` and a Cloud SQL
> host in `../.env.local` — and `.env.local` wins, so a bare `DATABASE_URL`
> silently resolves to whichever the loader saw first.

> **Serverless caveat:** on Vercel/Lambda, `next.config.mjs` is evaluated at
> *build* time, so `../.env` is not readable per request. Set the variables in
> the host's dashboard for those deployments.

### Why no service-role key

The first version of this used `@supabase/supabase-js`, whose PostgREST HTTP API
accepts only the anon key or the service-role key. The anon key is public (it
ships to browsers), and these tables hold conversation transcripts and captured
lead emails — so anon access was never an option, which left the service-role
key and one more secret to store and rotate.

All chatbot database access is server-side anyway, so PostgREST bought nothing.
Connecting directly as the table owner removes the credential entirely — and
adds real transactions, which PostgREST cannot express.

## Running the schema

```bash
psql "$CHATBOT_DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/chatbot/schema.sql
```

Or paste the file into the Supabase SQL editor if that is where the database
lives. Every statement is idempotent, so it is safe to re-run.

It creates:

| Object | Purpose |
|---|---|
| `chatbot_documents` | One row per ingested page, with a content hash |
| `chatbot_doc_chunks` | Chunks + `vector(768)` embeddings, HNSW-indexed |
| `chatbot_conversations` | One row per browser session, plus `lead_offered` |
| `chatbot_messages` | Full transcript with citations |
| `chatbot_leads` | Captured emails, `consent` enforced by CHECK constraint |

`create extension vector` is included. On Supabase and Cloud SQL pgvector is
available out of the box; on a self-managed Postgres you may need to install it
(`brew install pgvector`, or build from source for your major version).

There are no RLS policies, because nothing but this server can reach the
database. **If you ever expose it through PostgREST, enable RLS on all five
tables with no policies first** — the note at the bottom of `schema.sql` says
the same thing.

## Ingestion

```bash
npm run ingest                  # incremental — only re-embeds changed pages
npm run ingest -- --force       # re-embed everything
npm run ingest -- --dry-run     # fetch + chunk + report; no writes, no Gemini
npm run ingest -- --url=https://www.prooftamil.com/pricing
npm run ingest -- --limit=5
```

The pipeline is: **sitemap → fetch → extract → chunk (~700 tokens, 15% overlap)
→ embed → upsert**.

Expected output:

```
Fetching sitemap: https://www.prooftamil.com/sitemap.xml
  found 41 URLs
[1/41] https://www.prooftamil.com/ — inserted (3 chunks)
...
Done. inserted=41 updated=0 skipped=0 failed=0 chunks=168
```

### Idempotency

Each page's extracted text is hashed. On a re-run, unchanged pages report
`skipped (unchanged)` and cost **zero** Gemini calls. A second consecutive run
should finish in seconds with everything skipped — that is the check that
idempotency is working.

Each page's write is a single transaction — delete old chunks, insert new ones,
stamp the hash, all or nothing. An interrupted run leaves the previous version
fully intact. Embedding happens *outside* the transaction, so a slow Gemini call
never pins a Postgres connection.

### When to re-run

| Trigger | Command |
|---|---|
| Published or edited a page | `npm run ingest` |
| Changed pricing or plans | `npm run ingest` — **do this immediately** |
| Deleted a page | `npm run ingest` (prunes documents no longer in the sitemap) |
| Changed `EMBEDDING_MODEL_ID` or `EMBEDDING_DIMENSIONS` | `npm run ingest -- --force` |
| Routine freshness | nightly cron — see [Production notes](#production-notes) |

> Vectors from two different embedding models are **not comparable**. Mixing
> them degrades retrieval silently rather than raising an error, which is why a
> model change always needs `--force`.

### Why ingest runs under `--conditions=react-server`

`lib/chatbot/gemini.ts` and friends `import 'server-only'`, which throws outside
a React Server context. The `react-server` export condition resolves that
package to its no-op build, so the script can reuse the exact same modules the
API route uses instead of duplicating them. This is already wired into the
`ingest` script in `package.json`.

---

## Editing the system prompt

`lib/chatbot/systemPrompt.ts` is the main behavioural knob. Editing it needs
**no re-ingest and no migration** — the change takes effect on the next request.

The `PERSONA` constant covers the product description, the two jobs, grounding
rules, scope limits and tone. Tune freely, but keep the grounding rules intact:

- Answer only from the provided context.
- Never invent pricing, limits, plan names or features.
- Say so honestly when the context does not answer the question.

Those rules are what stop the bot inventing a price. `RAG_MIN_SCORE` works with
them — chunks below the floor are dropped entirely, so an off-topic question
reaches the model with an *empty* context, which is what triggers the honest
"I'm not sure" plus a lead-capture offer.

---

## The streaming protocol

`POST /api/chat` accepts:

```json
{
  "sessionId": "uuid-like string",
  "messages": [{ "role": "user", "content": "How much does ProofTamil cost?" }],
  "pageUrl": "https://www.prooftamil.com/pricing",
  "locale": "en-GB"
}
```

and responds with **NDJSON** — one JSON object per line,
`Content-Type: application/x-ndjson`:

```
{"type":"token","value":"ProofTamil "}
{"type":"token","value":"has two plans"}
{"type":"meta","leadCapture":false,"sources":[{"url":"...","title":"..."}]}
```

| Line type | Meaning |
|---|---|
| `token` | A chunk of the answer. Append in order. |
| `meta` | **Always last.** Citations, and whether to show the email card. |
| `error` | Graceful failure. Show the text; never retry automatically. |

NDJSON rather than SSE because the widget reads it with a plain `fetch` +
`ReadableStream` reader — there is no `EventSource` involved and no need for its
reconnect semantics on a one-shot request.

### Consuming it

The reader must do two things or Tamil breaks:

1. **Buffer partial lines.** A chunk boundary can land mid-line; keep the
   trailing fragment until the next chunk arrives.
2. **Decode with `TextDecoder` in streaming mode** (`decode(value, { stream: true })`).
   A Tamil grapheme spans up to 3 UTF-8 bytes and can split across chunks;
   decoding each chunk independently emits replacement characters mid-word.

`components/chatbot/useChat.ts` is the reference implementation.

### Test it with curl

```bash
curl -N -X POST http://localhost:3100/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
        "sessionId": "11111111-2222-3333-4444-555555555555",
        "messages": [{"role":"user","content":"How much does ProofTamil cost?"}]
      }'
```

A Tamil question:

```bash
curl -N -X POST http://localhost:3100/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
        "sessionId": "11111111-2222-3333-4444-555555555555",
        "messages": [{"role":"user","content":"விலை என்ன?"}]
      }'
```

---

## Lead capture

### When the card appears

`lib/chatbot/leadIntent.ts` offers the card **at most once per session** on any
of:

| Reason | Trigger |
|---|---|
| `contact-request` | "talk to a human", "தொடர்பு", "demo", "sales" |
| `unanswered` | Retrieval returned nothing — the site cannot answer this |
| `buying-intent` | "pricing", "upgrade", "team", "invoice", "விலை", "சந்தா" |

Rules rather than a model call: it runs on every turn, must be cheap, and a
false positive costs one dismissed card. The once-per-session flag lives in the
`chatbot_conversations.lead_offered` column — server-side, so clearing
localStorage cannot re-trigger the prompt on every turn.

### Consent

Consent is enforced **three times**:

1. The widget's checkbox is unchecked by default and blocks submit.
2. `/api/leads` rejects anything where `consent !== true` — a truthy `"true"`
   string or `1` is refused.
3. `chatbot_leads` has `CHECK (consent = true)` and `consent` is `NOT NULL`.

A row without consent cannot exist, even if the route has a bug.

### Lead notifications

`lib/chatbot/notify.ts` → `notifyNewLead()`. It tries, in order:

1. **Resend** (`RESEND_API_KEY`) — https://resend.com, sign up, verify
   `prooftamil.com`, create an API key.
2. **SendGrid** (`SENDGRID_API_KEY`).
3. **Neither configured** → the lead is still **saved**, a warning is logged,
   and nothing is emailed.

Both are called over HTTPS, so there is no `nodemailer` dependency and it works
unchanged on serverless.

The env names deliberately mirror the Go backend's existing contract in
`backend/internal/services/email/email_service.go`, so whatever you already have
configured for transactional email works here with no new variables.

Notification failures never turn a captured lead into an error the visitor sees
— the row is stored first, and the send is best-effort after.

---

## Security posture

| Concern | Mitigation |
|---|---|
| API key in client bundle | `@google/genai` and `pg` are `import 'server-only'`; verified absent from `.next/static` |
| Public credential reaching the tables | There is no anon key and no PostgREST surface — the database is reachable only by this server |
| SQL injection | Every query is parameterised (`$1`, `$2`); no string interpolation anywhere in `lib/chatbot/` |
| Prompt injection via page content | Model is instructed to treat context as reference only; it has no tools and cannot act |
| XSS via model output | `Markdown.tsx` builds React elements and **never** uses `dangerouslySetInnerHTML`. Raw HTML in a reply renders as visible text. |
| Malicious links | Only `http:` / `https:` become anchors — `javascript:`, `data:`, `vbscript:` degrade to plain text. All links get `rel="noopener noreferrer nofollow"`. |
| Abuse / cost blowout | Token buckets per IP (30/min) and per session (15/min) |
| Oversized input | 2000 chars per message, 100 messages per request, 12 turns of history |
| Stack traces / key leakage in errors | Errors are logged server-side; the visitor gets a fixed friendly string |
| Unconsented data capture | Triple-enforced, including a DB CHECK constraint (verified: a raw `insert … consent=false` is rejected by Postgres) |

### Verifying no secret reached the client

```bash
npm run build
for n in GOOGLE_GENAI_API_KEY GoogleGenAI CHATBOT_DATABASE_URL AIza; do
  printf '%-28s ' "$n"
  grep -rq "$n" .next/static/ && echo 'LEAKED' || echo 'absent'
done
```

All four must report `absent`. Re-run this after adding any new client
component that touches chatbot code.

---

## Production notes

### 1. Replace the in-memory rate limiter

`lib/chatbot/rateLimit.ts` is **per-process**. On serverless or multi-instance
deploys each instance keeps its own buckets, so the effective limit is
`capacity × instances`. That is an abuse speed-bump, not a quota.

Swap in [Upstash Redis](https://upstash.com) before it matters:

```bash
npm install @upstash/ratelimit @upstash/redis
```

```ts
// lib/chatbot/rateLimit.ts — replace consume() with:
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, '60 s'),
  prefix: 'prooftamil-chat',
});

export async function consume(key: string) {
  const { success, reset } = await limiter.limit(key);
  return { ok: success, retryAfter: Math.ceil((reset - Date.now()) / 1000) };
}
```

`consume()` becomes async, so `await` it in both route handlers.

### 2. Add a nightly re-ingest

Keeps the corpus in step with published content. Pricing changes especially —
a stale corpus means the bot quotes an old price with full confidence.

**GitHub Actions** (`.github/workflows/chatbot-ingest.yml`):

```yaml
name: Chatbot re-ingest
on:
  schedule:
    - cron: '0 2 * * *'      # 02:00 UTC nightly
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci                 # dev deps needed: tsx, cheerio, dotenv
      - run: npm run ingest
        env:
          GOOGLE_GENAI_API_KEY: ${{ secrets.GOOGLE_GENAI_API_KEY }}
          CHATBOT_DATABASE_URL: ${{ secrets.CHATBOT_DATABASE_URL }}
```

`npm ci` (not `--omit=dev`) matters: `tsx`, `cheerio` and `dotenv` are
devDependencies and the script needs all three.

### 3. Deployment

`vercel.json` at the repo root currently pins `rootDirectory: "express-frontend"`,
so **this Next app is not deployed by the existing config**. To ship the
chatbot you need either:

- a **second Vercel project** with root directory `frontend`, and the widget
  embedded into the Express app pointing at it (requires CORS on both routes); or
- to **move the site** to this Next app and change `rootDirectory`.

Set the three required env vars in the host's dashboard either way — do not
commit them.

### 4. Cost

Roughly, per conversation turn: one embedding call for the query plus one
flash-tier generation over ~6 retrieved chunks. Full ingestion of the 41-page
site is ~168 embedding calls and only re-runs for changed pages.

### 5. Monitoring

Watch server logs for these prefixes:

| Prefix | Meaning |
|---|---|
| `[chat] retrieval failed` | Supabase or embedding problem — answers are ungrounded |
| `[chat] persistence unavailable` | Transcripts are not being stored |
| `[chat] generation failed` | Gemini error — visitors are seeing the error card |
| `[leads] stored … notification result was "not-configured"` | Leads landing with no email going out |

---

## Troubleshooting

**"I'm not sure" to everything.** The corpus is empty or the schema is missing.
Check `select count(*) from chatbot_doc_chunks;` — expect ~168. If it is 0, run
`npm run ingest`.

**Everything fails with a connection error.** `CHATBOT_DATABASE_URL` is unset,
so it fell back to `DATABASE_URL` — which in this repo may be the Cloud SQL host
from `../.env.local` rather than the database you meant. Set it explicitly.

**Embedding dimension mismatch.** `EMBEDDING_DIMENSIONS` and the `vector(N)`
column disagree. Make them match, then `npm run ingest -- --force`.

**`EMBEDDING_MODEL_ID` rejected.** Your key may not have the model. Set
`EMBEDDING_MODEL_ID=gemini-embedding-2` and re-run with `--force`. The dimension
stays 768 either way, so no SQL change is needed.

**Ingest throws "This module cannot be imported from a Client Component".**
It was run without `--conditions=react-server`. Use `npm run ingest`, not
`npx tsx scripts/ingest.ts`.

**Replies arrive in one lump instead of streaming.** A proxy is buffering. The
route already sends `X-Accel-Buffering: no`; check for another proxy in front.

**Tamil shows as boxes or mojibake.** The Noto Sans Tamil `<link>` in
`app/layout.tsx` is missing, or a reader is decoding the stream without
`{ stream: true }`.

**`The server does not support SSL connections`.** Your DSN points at a local
Postgres but TLS was negotiated anyway. Append `?sslmode=disable`, or use a
hostname the driver recognises as local (`localhost`, `127.0.0.1`, `::1`).

**`extension "vector" is not available`.** pgvector is not installed for your
Postgres *major version* — the binaries are version-specific. On Homebrew,
`brew install pgvector` may target a different major than the server you are
running; build from source against it:
`make && make install PG_CONFIG=$(which pg_config)`.

**SendGrid returns `403 … does not match a verified Sender Identity`.** The
`from` address is not verified on the SendGrid account. Either verify
`contact@prooftamil.com` under Settings → Sender Authentication, or set
`EMAIL_FROM_ADDRESS` to an address that already is. See
`../SENDGRID_SENDER_SETUP.md`. The lead is still stored — only the email fails.

**The bot mentions "context" or "my sources" in a reply.** Tighten the last
Style rule in `lib/chatbot/systemPrompt.ts`; avoid using those words in the
prompt itself, since they prime the model to echo them.

**The lead card never appears.** It is once per session. Reset it with
`update chatbot_conversations set lead_offered = false where session_id = '…';`
and clear the browser's `prooftamil.chatbot.v1` localStorage key.
