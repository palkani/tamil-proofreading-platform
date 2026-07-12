package migrations

import (
	"log"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

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
// and the entire draft-save feature silently degrades.
//
// PERFORMANCE NOTE: Cold-start latency matters — every extra ms here
// delays readyHandler.Store() and widens the window during which
// /api/v1/* endpoints return 503 {"status":"starting"}. To keep this
// migration cheap on warm boots (99% of the time nothing's missing),
// we do a SINGLE information_schema query first to see which columns
// already exist, then ONLY ALTER the ones that are genuinely missing.
// Cold path: 1 SELECT + 0-14 ALTERs (typically 0 on redeploys).
// Old path: 14 ALTERs regardless. ~1s → ~50ms on warm boots.
//
// ONLY use ADD COLUMN IF NOT EXISTS in this function. NEVER drop,
// rename, or change types here — those are destructive and belong in
// a proper migration file that a human triggers deliberately.
func EnsureCoreSchema(db *gorm.DB) {
	start := time.Now()

	// One column-existence lookup per table. Cheap; hits pg_catalog
	// which is fully cached.
	existing := map[string]bool{}
	rows, err := db.Raw(`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = 'submissions'
	`).Rows()
	if err != nil {
		// If the meta-query itself fails, log and fall through to
		// blind ALTERs — safer than skipping the check entirely.
		log.Printf("[SCHEMA] Warning: information_schema query failed (%v); falling back to unconditional ALTERs", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var name string
			if scanErr := rows.Scan(&name); scanErr == nil {
				existing[name] = true
			}
		}
	}

	// Every OPTIONAL column on the Submission model. Any new field
	// that lands on the model should be added here so a future deploy
	// doesn't fall into the "missing_column silent failure" trap that
	// bit group_id.
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

	missing := 0
	for _, c := range submissionsCols {
		if existing[c.name] {
			continue // fast path: skip the ALTER round-trip entirely
		}
		if err := db.Exec(c.ddl).Error; err != nil {
			log.Printf("[SCHEMA] Warning: ensure submissions.%s failed: %v", c.name, err)
			continue
		}
		log.Printf("[SCHEMA] Added missing column submissions.%s", c.name)
		missing++
	}

	// Companion index — skip the round-trip on warm boots by checking
	// pg_indexes first.
	var idxCount int64
	db.Raw(`SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_submissions_group_id'`).Scan(&idxCount)
	if idxCount == 0 {
		if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_submissions_group_id ON submissions (group_id) WHERE group_id IS NOT NULL`).Error; err != nil {
			log.Printf("[SCHEMA] Warning: create idx_submissions_group_id failed: %v", err)
		} else {
			log.Printf("[SCHEMA] Created idx_submissions_group_id")
		}
	}

	// ── Observability tables ────────────────────────────────────────
	// Every table below is defined as a Go model and written to by
	// fire-and-forget goroutines. If the table doesn't exist, the
	// insert fails silently with a warning log ([AI_LOG], [ACTIVITY_LOG])
	// and the ADMIN DASHBOARD shows empty stats for that class of event.
	// That's exactly what bit us with activity_events — the admin
	// asked "why do I see no non-admin login activity?" — answer:
	// the table didn't exist, every write since deploy was dropped.
	// AutoMigrate here creates each table + model-declared indexes
	// idempotently, safe on every startup.
	observabilityModels := []struct {
		name  string
		model any
	}{
		{"ai_requests", &models.AIRequest{}},
		{"activity_events", &models.ActivityEvent{}},
		{"anonymous_submission_events", &models.AnonymousSubmissionEvent{}},
		{"visit_events", &models.VisitEvent{}},
	}
	for _, m := range observabilityModels {
		if err := db.AutoMigrate(m.model); err != nil {
			log.Printf("[SCHEMA] Warning: ensure %s table failed: %v", m.name, err)
		}
	}
	// Companion composite index used by the admin AI-cost dashboard.
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_ai_requests_occurred_status ON ai_requests (occurred_at DESC, status)`).Error; err != nil {
		log.Printf("[SCHEMA] Warning: ensure idx_ai_requests_occurred_status failed: %v", err)
	}
	// Companion index for activity feed queries (most-recent first per user).
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_events_occurred_user ON activity_events (occurred_at DESC, user_id)`).Error; err != nil {
		log.Printf("[SCHEMA] Warning: ensure idx_activity_events_occurred_user failed: %v", err)
	}

	log.Printf("[SCHEMA] Core-schema check complete in %v (added=%d columns)", time.Since(start), missing)
}
