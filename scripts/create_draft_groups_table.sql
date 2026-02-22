-- Create draft_groups table (matches backend/internal/models/draft_group.go)
-- Run with: psql -d "$DATABASE_URL" -f scripts/create_draft_groups_table.sql
-- Or in Supabase SQL Editor: paste and run.

CREATE TABLE IF NOT EXISTS draft_groups (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT    NOT NULL,
  name       VARCHAR(255) NOT NULL,
  sort_order INTEGER   NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_draft_groups_user_id ON draft_groups (user_id);
CREATE INDEX IF NOT EXISTS idx_draft_groups_deleted_at ON draft_groups (deleted_at);

-- Optional: add foreign key to users (only if you have a users table and want referential integrity)
-- ALTER TABLE draft_groups
--   ADD CONSTRAINT fk_draft_groups_user
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMENT ON TABLE draft_groups IS 'User-named groups for organizing drafts (submissions)';

-- Optional: add group_id to submissions if it doesn't exist (backend expects it)
-- Run only if your submissions table was created before draft groups were added:
-- ALTER TABLE submissions ADD COLUMN IF NOT EXISTS group_id BIGINT;
-- CREATE INDEX IF NOT EXISTS idx_submissions_group_id ON submissions (group_id);
