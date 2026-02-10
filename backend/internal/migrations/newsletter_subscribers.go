package migrations

import (
	"log"
	"strings"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

func isAlreadyExists(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "already exists") ||
		strings.Contains(s, "42P07") || // duplicate_table
		strings.Contains(s, "42710")   // duplicate_object
}

// MigrateNewsletterSubscribers creates the newsletter_subscribers table if it doesn't exist
func MigrateNewsletterSubscribers(db *gorm.DB) error {
	if db == nil {
		return nil
	}

	log.Println("[MIGRATIONS] Running newsletter_subscribers migration...")

	// Auto-migrate the NewsletterSubscriber model
	if err := db.AutoMigrate(&models.NewsletterSubscriber{}); err != nil {
		if isAlreadyExists(err) {
			log.Println("[MIGRATIONS] newsletter_subscribers table already exists, skipping")
			// Still create indexes below
		} else {
			log.Printf("[MIGRATIONS] Failed to migrate newsletter_subscribers: %v", err)
			return err
		}
	}

	// Add indexes if they don't exist (AutoMigrate should handle this, but just in case)
	if db.Dialector.Name() == "postgres" {
		// Index on status for filtering active subscribers
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON newsletter_subscribers(status)`)
		// Index on confirmation token for quick lookups
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_confirm_token ON newsletter_subscribers(confirmation_token) WHERE confirmation_token != ''`)
		// Index on unsubscribe token
		db.Exec(`CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_unsub_token ON newsletter_subscribers(unsubscribe_token) WHERE unsubscribe_token != ''`)
	}

	log.Println("[MIGRATIONS] newsletter_subscribers migration completed successfully")
	return nil
}
