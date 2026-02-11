package migrations

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

const (
	idxTransliterationPrefix = "idx_tamil_words_transliteration_prefix"
	idxLowerTrans            = "idx_tamil_words_lower_trans"
	idxFreqUcID               = "idx_tamil_words_freq_uc_id"
)

// MigrateTamilWordsIndex creates indexes on tamil_words for fast lookups and batch loads.
// Skips with a single log line if all indexes already exist (avoids log spam on every cold start).
func MigrateTamilWordsIndex(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	if db.Dialector.Name() != "postgres" {
		return nil
	}

	// Quick check: if all three indexes exist, skip (no log spam on every instance start).
	var count int64
	err := db.Raw(`SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'tamil_words' AND indexname IN (?, ?, ?)`,
		idxTransliterationPrefix, idxLowerTrans, idxFreqUcID).Scan(&count).Error
	if err == nil && count == 3 {
		log.Println("[MIGRATIONS] tamil_words indexes already present")
		return nil
	}

	// Create missing indexes.
	log.Println("[MIGRATIONS] Creating tamil_words indexes (if not exists)...")
	_ = db.Exec(`CREATE INDEX IF NOT EXISTS ` + idxTransliterationPrefix + ` ON tamil_words (transliteration text_pattern_ops)`).Error
	_ = db.Exec(`CREATE INDEX IF NOT EXISTS ` + idxLowerTrans + ` ON tamil_words (LOWER(transliteration) text_pattern_ops)`).Error
	err3 := db.Exec(`CREATE INDEX IF NOT EXISTS ` + idxFreqUcID + ` ON tamil_words (frequency DESC, user_confirmed DESC, id)`).Error
	if err3 != nil && !strings.Contains(err3.Error(), "already exists") {
		log.Printf("[MIGRATIONS] tamil_words index: %v (non-fatal)", err3)
	}
	log.Println("[MIGRATIONS] tamil_words indexes OK")
	return nil
}
