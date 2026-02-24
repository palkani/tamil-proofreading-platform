-- Create ai_content_drafts table (matches backend/internal/models/ai_content_draft.go)
-- Run if "Failed to save draft" with details like "relation \"ai_content_drafts\" does not exist".
-- Run with: psql -d "$DATABASE_URL" -f scripts/create_ai_content_drafts_table.sql
-- Or in Supabase/Neon SQL Editor: paste and run.

CREATE TABLE IF NOT EXISTS ai_content_drafts (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT    NOT NULL,
  title            VARCHAR(255) NOT NULL,
  content          TEXT      NOT NULL,
  prompt           TEXT,
  content_type     VARCHAR(64),
  language         VARCHAR(32),
  tone             VARCHAR(32),
  meta_description TEXT,
  keywords         TEXT,
  word_count       INTEGER   NOT NULL DEFAULT 0,
  created_at       TIMESTAMP WITH TIME ZONE,
  updated_at       TIMESTAMP WITH TIME ZONE,
  deleted_at       TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_user_id ON ai_content_drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_deleted_at ON ai_content_drafts (deleted_at);

COMMENT ON TABLE ai_content_drafts IS 'AI Content Writer saved drafts (separate from proofreading submissions)';
