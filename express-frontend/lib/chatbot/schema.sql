-- ProofTamil chatbot schema (Supabase Postgres + pgvector)
--
-- Run once against the chatbot database. Safe to re-run: every statement is
-- idempotent.
--
--   psql "$CHATBOT_DATABASE_URL" -f lib/chatbot/schema.sql
--
-- (or paste it into the Supabase SQL editor if that is where the DB lives)
--
-- The vector(768) dimension MUST match EMBEDDING_DIMENSIONS in config.ts.
-- If you change one, change both AND re-run `npm run ingest` from scratch —
-- vectors from different models or dimensions are not comparable, and mixing
-- them degrades retrieval silently rather than raising an error.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ============================================================== RAG corpus ==

-- One row per ingested page.
create table if not exists chatbot_documents (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  title        text not null default '',
  -- sha256 of the extracted text. Lets ingest skip pages whose content has not
  -- changed, which is what makes re-running it cheap instead of a full re-embed.
  content_hash text not null,
  char_count   integer not null default 0,
  chunk_count  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists chatbot_doc_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references chatbot_documents (id) on delete cascade,
  chunk_index integer not null,
  content     text not null,
  embedding   vector(768) not null,
  created_at  timestamptz not null default now(),
  unique (document_id, chunk_index)
);

-- HNSW beats IVFFlat here: the corpus is small (~40 pages) and mostly static,
-- so we want recall and no training step, not insert throughput.
-- Note pgvector caps indexable dimensions at 2000 — another reason for 768.
create index if not exists chatbot_doc_chunks_embedding_idx
  on chatbot_doc_chunks
  using hnsw (embedding vector_cosine_ops);

create index if not exists chatbot_doc_chunks_document_id_idx
  on chatbot_doc_chunks (document_id);

-- =========================================================== conversations ==

create table if not exists chatbot_conversations (
  id              uuid primary key default gen_random_uuid(),
  -- Browser-generated UUID from localStorage. Anonymous by design; there is no
  -- auth on the widget.
  session_id      text not null unique,
  page_url        text,
  locale          text,
  -- The email-capture card is offered at most once per session. Tracked
  -- server-side so clearing localStorage cannot re-trigger the prompt on
  -- every turn.
  lead_offered    boolean not null default false,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- Backfill for databases created before lead_offered existed.
alter table chatbot_conversations
  add column if not exists lead_offered boolean not null default false;

create table if not exists chatbot_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chatbot_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- Citations shown under an assistant reply: [{ "url": ..., "title": ... }]
  sources         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists chatbot_messages_conversation_idx
  on chatbot_messages (conversation_id, created_at);

-- =================================================================== leads ==

create table if not exists chatbot_leads (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text,
  -- The user's last message: why they were offered the capture card. Without it
  -- the sales follow-up has no idea what the person actually wanted.
  context    text,
  page_url   text,
  session_id text,
  -- Never nullable and never default-true: a row can only exist if the visitor
  -- actively ticked consent. The check constraint makes that a database
  -- guarantee rather than an application convention.
  consent    boolean not null,
  created_at timestamptz not null default now(),
  constraint chatbot_leads_consent_required check (consent = true)
);

create index if not exists chatbot_leads_email_idx on chatbot_leads (lower(email));
create index if not exists chatbot_leads_created_at_idx on chatbot_leads (created_at desc);
-- ===================================================================== note ==

-- No RLS policies and no match_chatbot_chunks() RPC here by design.
--
-- Both existed only to satisfy Supabase's PostgREST HTTP API. The app connects
-- directly as the table owner via CHATBOT_DATABASE_URL, so top-K search is a
-- plain query in lib/chatbot/vectorStore.ts and there is no anon key that could
-- reach these tables in the first place.
--
-- If you ever expose this database through PostgREST, enable RLS on all five
-- tables with NO policies before doing so — these tables hold conversation
-- transcripts and captured lead emails, and must never be reachable with a
-- public anon key.
