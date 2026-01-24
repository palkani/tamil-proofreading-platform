package main

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func main() {
	log.Println("[SEED-IME] Starting IME corpus seeder...")

	cfg := config.Load()
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Fatal("[SEED-IME] Failed to connect to database:", err)
	}

	// Files live in repo root /data by plan. Allow override via SEED_DIR.
	seedDir := os.Getenv("SEED_DIR")
	if seedDir == "" {
		seedDir = "data"
	}

	wordsPath := filepath.Join(seedDir, "seed_words.tsv")
	phrasesPath := filepath.Join(seedDir, "seed_phrases.tsv")
	bigramsPath := filepath.Join(seedDir, "seed_bigrams.tsv")

	seedWords(db, wordsPath)
	seedPhrases(db, phrasesPath)
	seedBigrams(db, bigramsPath)

	log.Println("[SEED-IME] Done.")
}

func seedWords(db *gorm.DB, path string) {
	rows, err := readTSV(path, 2)
	if err != nil {
		log.Printf("[SEED-IME] seed_words skipped: %v", err)
		return
	}
	updated := 0
	for _, r := range rows {
		word := strings.TrimSpace(r[0])
		freq := parseInt64(r[1])
		if word == "" || freq <= 0 {
			continue
		}
		// Existing schema uses tamil_words with potentially multiple rows per tamil_text.
		// Update all matches to max(existing, new). We do not create new rows here.
		res := db.Model(&models.TamilWord{}).
			Where("tamil_text = ?", word).
			UpdateColumn("frequency", gorm.Expr("GREATEST(frequency, ?)", freq))
		if res.Error == nil && res.RowsAffected > 0 {
			updated += int(res.RowsAffected)
		}
	}
	log.Printf("[SEED-IME] seed_words updated_rows=%d", updated)
}

func seedPhrases(db *gorm.DB, path string) {
	rows, err := readTSV(path, 2)
	if err != nil {
		log.Printf("[SEED-IME] seed_phrases skipped: %v", err)
		return
	}
	inserted := 0
	for _, r := range rows {
		phrase := strings.TrimSpace(r[0])
		freq := parseInt64(r[1])
		if phrase == "" || freq <= 0 {
			continue
		}
		obj := models.TamilPhrase{Phrase: phrase, Frequency: freq}
		if err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "phrase"}},
			DoUpdates: clause.Assignments(map[string]interface{}{"frequency": gorm.Expr("GREATEST(tamil_phrases.frequency, ?)", freq)}),
		}).Create(&obj).Error; err == nil {
			inserted++
		}
	}
	log.Printf("[SEED-IME] seed_phrases upserts=%d", inserted)
}

func seedBigrams(db *gorm.DB, path string) {
	rows, err := readTSV(path, 3)
	if err != nil {
		log.Printf("[SEED-IME] seed_bigrams skipped: %v", err)
		return
	}
	upserts := 0
	for _, r := range rows {
		w := strings.TrimSpace(r[0])
		n := strings.TrimSpace(r[1])
		freq := parseInt64(r[2])
		if w == "" || n == "" || freq <= 0 {
			continue
		}
		obj := models.TamilBigram{Word: w, NextWord: n, Frequency: freq}
		if err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "word"}, {Name: "next_word"}},
			DoUpdates: clause.Assignments(map[string]interface{}{"frequency": gorm.Expr("GREATEST(tamil_bigrams.frequency, ?)", freq)}),
		}).Create(&obj).Error; err == nil {
			upserts++
		}
	}
	log.Printf("[SEED-IME] seed_bigrams upserts=%d", upserts)
}

func readTSV(path string, cols int) ([][]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	out := [][]string{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < cols {
			continue
		}
		out = append(out, parts[:cols])
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func parseInt64(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}


