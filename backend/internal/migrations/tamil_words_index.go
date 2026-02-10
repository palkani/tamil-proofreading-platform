package migrations

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

// MigrateTamilWordsIndex creates indexes on tamil_words for fast lookups and batch loads.
func MigrateTamilWordsIndex(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	if db.Dialector.Name() != "postgres" {
		return nil
	}

	// 1) Prefix lookup for suggestFromDB / autocomplete: LOWER(transliteration) LIKE 'prefix%'
	log.Println("[MIGRATIONS] Creating tamil_words transliteration index (if not exists)...")
	err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_tamil_words_transliteration_prefix ON tamil_words (transliteration text_pattern_ops)`).Error
	if err != nil && !strings.Contains(err.Error(), "already exists") {
		log.Printf("[MIGRATIONS] tamil_words transliteration index: %v (non-fatal)", err)
	}
	// Expression index for case-insensitive prefix (suggestFromDB uses ILIKE)
	err2 := db.Exec(`CREATE INDEX IF NOT EXISTS idx_tamil_words_lower_trans ON tamil_words (LOWER(transliteration) text_pattern_ops)`).Error
	if err2 != nil && !strings.Contains(err2.Error(), "already exists") {
		log.Printf("[MIGRATIONS] tamil_words lower(transliteration) index: %v (non-fatal)", err2)
	}

	// 2) Batch load: keyset pagination (frequency DESC, user_confirmed DESC, id) — avoids slow OFFSET
	log.Println("[MIGRATIONS] Creating tamil_words batch-load index (if not exists)...")
	err3 := db.Exec(`CREATE INDEX IF NOT EXISTS idx_tamil_words_freq_uc_id ON tamil_words (frequency DESC, user_confirmed DESC, id)`).Error
	if err3 != nil && !strings.Contains(err3.Error(), "already exists") {
		log.Printf("[MIGRATIONS] tamil_words freq_uc_id index: %v (non-fatal)", err3)
	}

	log.Println("[MIGRATIONS] tamil_words indexes OK")
	return nil
}
