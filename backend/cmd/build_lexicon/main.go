// build_lexicon reads tamil_words from Postgres and writes a JSON lexicon file
// for the suggest engine. Run in CI before Docker build; the file is baked into
// the image so Cloud Run loads it at startup (2–3s) instead of querying DB (15+ min).
//
// Usage:
//
//	DATABASE_URL="postgres://..." go run . -output=data/lexicon.json
//	go run . -output=data/lexicon.json -limit=500000
package main

import (
	"encoding/json"
	"flag"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/suggest"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	output := flag.String("output", "data/lexicon.json", "Output path for lexicon JSON")
	limit := flag.Int("limit", 0, "Max rows to export (0 = no limit, load entire tamil_words into file)")
	batchSize := flag.Int("batch", 10000, "Batch size for DB fetch")
	flag.Parse()

	connStr := config.Load().DatabaseURL
	if connStr == "" {
		connStr = os.Getenv("DATABASE_URL")
	}
	connStr = strings.TrimSpace(connStr)
	if connStr == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  connStr,
		PreferSimpleProtocol: true,
	}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		defer sqlDB.Close()
	}

	start := time.Now()
	var rows []suggest.LexiconRow
	var lastFreq int
	var lastUC int
	var lastID uint
	firstBatch := true
	for {
		var batch []suggest.LexiconRow
		q := db.Table("tamil_words").
			Select("id, tamil_text, transliteration, alternate_spellings, frequency, user_confirmed").
			Order("frequency DESC, user_confirmed DESC, id")
		if !firstBatch {
			q = q.Where("(frequency, user_confirmed, id) < (?, ?, ?)", lastFreq, lastUC, lastID)
		}
		if err := q.Limit(*batchSize).Find(&batch).Error; err != nil {
			log.Fatalf("DB query failed: %v", err)
		}
		rows = append(rows, batch...)
		log.Printf("Fetched %d rows (total %d)", len(batch), len(rows))
		if len(batch) < *batchSize {
			break
		}
		last := batch[len(batch)-1]
		lastFreq, lastUC, lastID = last.Frequency, last.UserConfirmed, last.ID
		firstBatch = false
		if *limit > 0 && len(rows) >= *limit {
			rows = rows[:*limit]
			log.Printf("Stopped at limit %d", *limit)
			break
		}
	}

	if err := os.MkdirAll(filepath.Dir(*output), 0755); err != nil {
		log.Fatalf("Failed to create output dir: %v", err)
	}
	f, err := os.Create(*output)
	if err != nil {
		log.Fatalf("Failed to create %s: %v", *output, err)
	}
	enc := json.NewEncoder(f)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(rows); err != nil {
		f.Close()
		log.Fatalf("Failed to write JSON: %v", err)
	}
	if err := f.Close(); err != nil {
		log.Fatalf("Failed to close %s: %v", *output, err)
	}

	info, _ := os.Stat(*output)
	elapsed := time.Since(start)
	log.Printf("Wrote %s: %d rows, %.2f MB, %v", *output, len(rows), float64(info.Size())/(1024*1024), elapsed)
}
