package migrations

import (
	"log"

	"gorm.io/gorm"
)

// EnsureContactMessageUserIDNullable drops NOT NULL on contact_messages.user_id so anonymous
// contact form submissions can be stored.
func EnsureContactMessageUserIDNullable(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	if db.Dialector.Name() != "postgres" {
		return nil
	}

	stmt := `ALTER TABLE contact_messages ALTER COLUMN user_id DROP NOT NULL`
	if err := db.Exec(stmt).Error; err != nil {
		// If it's already nullable, Postgres returns no error; any error here likely means missing table/perm.
		log.Printf("[MIGRATIONS] contact_messages.user_id nullable fix failed: %v (sql=%s)", err, stmt)
		return err
	}
	return nil
}


