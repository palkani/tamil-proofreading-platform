package suggest

import (
	"bufio"
	"log"
	"os"
	"strings"

	"gorm.io/gorm"
)

// SeedCorpusIfEmpty loads a minimal corpus SQL file when tamil_words is empty.
// This is intended for first-time deployments only and is gated by env.
func SeedCorpusIfEmpty(db *gorm.DB, sqlPath string, minCount int) error {
	if db == nil {
		return nil
	}
	if minCount <= 0 {
		minCount = 1
	}

	var count int64
	if err := db.Table("tamil_words").Count(&count).Error; err != nil {
		return err
	}
	if count >= int64(minCount) {
		log.Printf("[SEED] tamil_words already has %d rows; skip seeding", count)
		return nil
	}

	log.Printf("[SEED] tamil_words count=%d; seeding from %s", count, sqlPath)
	raw, err := os.ReadFile(sqlPath)
	if err != nil {
		return err
	}

	// Strip psql meta commands (e.g., \echo)
	var cleaned strings.Builder
	scanner := bufio.NewScanner(strings.NewReader(string(raw)))
	for scanner.Scan() {
		line := scanner.Text()
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "\\") {
			continue
		}
		cleaned.WriteString(line)
		cleaned.WriteString("\n")
	}
	if err := scanner.Err(); err != nil {
		return err
	}

	// Execute statements separated by ';'
	stmts := strings.Split(cleaned.String(), ";")
	for _, stmt := range stmts {
		s := strings.TrimSpace(stmt)
		if s == "" {
			continue
		}
		if err := db.Exec(s).Error; err != nil {
			return err
		}
	}

	log.Printf("[SEED] corpus seed complete")
	return nil
}
