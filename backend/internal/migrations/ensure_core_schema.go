package migrations

import (
	"log"

	"gorm.io/gorm"
)

// EnsureCoreSchema runs UNCONDITIONALLY at every backend startup — not
// gated by RUN_MIGRATIONS — and idempotently ensures every column the
// running Go models expect actually exists on the corresponding table.
//
// Rationale: the standard migration flow (RUN_MIGRATIONS=true) is
// deliberately skipped in production to reduce cold-start time and
// avoid schema surprises during deploys. That means every time a new
// field lands on a model, someone has to remember to run the ops-panel
// "Setup tables" button. When they don't, we get log lines like
//
//   [SUBMIT] Error creating submission: user_id=X ...
//     err_class=missing_column err=column "group_id" of relation
//     "submissions" does not exist (SQLSTATE 42703)
//
// and the entire draft-save feature silently degrades. The user
// eventually notices ("my drafts don't save") and files a bug days
// after the field was added.
//
// This function is the fix: it lists every OPTIONAL column on the
// hot-path tables (users, submissions) and runs
// ALTER TABLE ... ADD COLUMN IF NOT EXISTS for each. Idempotent by
// design — no risk on re-run — and cheap (each ALTER on a non-missing
// column is a no-op with negligible cost).
//
// ONLY use ADD COLUMN IF NOT EXISTS in this function. NEVER drop,
// rename, or change types here — those are destructive and belong in
// a proper migration file that a human triggers deliberately.
//
// When to add to this list: any time a model field is added and the
// team can't or won't turn RUN_MIGRATIONS back on for a deploy.
func EnsureCoreSchema(db *gorm.DB) {
	log.Println("[SCHEMA] Ensuring core-schema columns (idempotent)")

	// ── submissions ─────────────────────────────────────────────────
	// The `group_id` gap was the direct cause of the user's
	// "Save failed (server)" reports. Every field flagged as
	// json:"omitempty" is added defensively here so a future model
	// addition triggers a warning log at most, never a total failure.
	submissionsCols := []struct {
		name string
		ddl  string
	}{
		{"group_id", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS group_id bigint`},
		{"title", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS title varchar(255)`},
		{"original_html", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS original_html text`},
		{"request_id", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS request_id varchar(64)`},
		{"proofread_text", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS proofread_text text`},
		{"suggestions", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS suggestions jsonb DEFAULT '[]'::jsonb`},
		{"alternatives", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS alternatives jsonb DEFAULT '[]'::jsonb`},
		{"include_alternatives", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS include_alternatives boolean NOT NULL DEFAULT false`},
		{"error", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS error text`},
		{"processing_time", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS processing_time double precision`},
		{"cost", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS cost double precision NOT NULL DEFAULT 0`},
		{"archived", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`},
		{"archived_at", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS archived_at timestamptz`},
		{"deleted_at", `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS deleted_at timestamptz`},
	}
	for _, c := range submissionsCols {
		if err := db.Exec(c.ddl).Error; err != nil {
			log.Printf("[SCHEMA] Warning: ensure submissions.%s failed: %v", c.name, err)
		}
	}

	// Companion index for group_id lookups on the drafts page. Same
	// IF NOT EXISTS idempotency guarantee.
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_submissions_group_id ON submissions (group_id) WHERE group_id IS NOT NULL`).Error; err != nil {
		log.Printf("[SCHEMA] Warning: create idx_submissions_group_id failed: %v", err)
	}

	log.Println("[SCHEMA] Core-schema check complete")
}
