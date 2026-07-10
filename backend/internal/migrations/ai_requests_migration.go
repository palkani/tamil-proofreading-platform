package migrations

import (
	"log"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

// MigrateAIRequests creates the ai_requests table if it doesn't exist.
// This is a pure observability table — no foreign-key cascades to
// users / submissions, because we want the log to survive user
// deletion (for cost accounting) and because Gorm's FK handling with
// Supabase pgBouncer is finicky enough that a naked table is simpler.
//
// Indexes are declared on the model (`gorm:"index"` tags on
// user_id, organization_id, status, occurred_at) so AutoMigrate
// creates them.
func MigrateAIRequests(db *gorm.DB) error {
	log.Println("[MIGRATIONS] Running ai_requests table migration...")

	if err := db.AutoMigrate(&models.AIRequest{}); err != nil {
		if !isAlreadyExistsOrPreparedStmt(err) {
			log.Printf("[MIGRATIONS] Warning: Failed to migrate ai_requests table: %v", err)
			return err
		}
	}
	log.Println("[MIGRATIONS] ai_requests table migrated successfully")

	// Composite index for the most common admin dashboard query:
	// "cost per day, filtered by status." AutoMigrate creates the
	// single-column indexes; we add the composite here.
	compositeIdx := `CREATE INDEX IF NOT EXISTS idx_ai_requests_occurred_status
		ON ai_requests (occurred_at DESC, status)`
	if err := db.Exec(compositeIdx).Error; err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to ensure composite index on ai_requests: %v", err)
	}

	return nil
}
