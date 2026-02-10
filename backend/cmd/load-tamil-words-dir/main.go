// load-tamil-words-dir scans a local folder for Tamil word/title files (e.g. tawiki *all-titles*.gz)
// and loads them into the Postgres tamil_words table.
//
// Usage:
//   DATABASE_URL="postgres://..." go run . -dir=/path/to/words
//   go run . -dir=/Users/palkanirajendran/Downloads/words -db="postgres://..."
package main

import (
	"bufio"
	"compress/gzip"
	"flag"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"unicode"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	tamilScriptStart = 0x0B80
	tamilScriptEnd   = 0x0BFF
	batchSize        = 2000
)

var (
	totalProcessed int64
	totalInserted  int64
	totalSkipped   int64
	totalErrors    int64
)

func main() {
	dir := flag.String("dir", "", "Path to folder containing Tamil word files (e.g. *all-titles*.gz)")
	dbURL := flag.String("db", "", "Postgres connection string (default: DATABASE_URL env)")
	skipNoTamil := flag.Bool("skip-no-tamil", true, "Skip lines that contain no Tamil script")
	flag.Parse()

	if *dir == "" {
		*dir = "/Users/palkanirajendran/Downloads/words"
		log.Printf("Using default -dir=%s", *dir)
	}

	if _, err := os.Stat(*dir); os.IsNotExist(err) {
		log.Fatalf("Directory not found: %s", *dir)
	}

	connStr := *dbURL
	if connStr == "" {
		cfg := config.Load()
		connStr = cfg.DatabaseURL
	}
	if connStr == "" || strings.Contains(connStr, "password@localhost") {
		log.Fatal("Set DATABASE_URL or pass -db=postgres://user:pass@host:port/dbname?sslmode=require")
	}

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  connStr,
		PreferSimpleProtocol: true,
	}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		sqlDB.SetMaxOpenConns(4)
		sqlDB.SetMaxIdleConns(2)
		defer sqlDB.Close()
	}

	log.Printf("Scanning folder: %s", *dir)
	start := time.Now()

	// Find *all-titles*.gz (and similar) — skip .sql.gz like categorylinks, externallinks
	entries, err := os.ReadDir(*dir)
	if err != nil {
		log.Fatal("ReadDir:", err)
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := strings.ToLower(e.Name())
		if !strings.HasSuffix(name, ".gz") {
			continue
		}
		if strings.Contains(name, "all-titles") || (strings.Contains(name, "tawiki") && !strings.Contains(name, ".sql")) {
			files = append(files, filepath.Join(*dir, e.Name()))
		}
	}
	if len(files) == 0 {
		log.Fatal("No *all-titles*.gz (or tawiki non-SQL .gz) files found in " + *dir)
	}
	log.Printf("Found %d file(s) to load", len(files))

	for _, path := range files {
		if err := loadFile(path, db, *skipNoTamil); err != nil {
			log.Printf("Error loading %s: %v", path, err)
		}
	}

	log.Printf("Done. Processed=%d Inserted=%d Skipped=%d Errors=%d in %v",
		atomic.LoadInt64(&totalProcessed), atomic.LoadInt64(&totalInserted),
		atomic.LoadInt64(&totalSkipped), atomic.LoadInt64(&totalErrors), time.Since(start))
}

func loadFile(path string, db *gorm.DB, skipNoTamil bool) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	scanner := bufio.NewScanner(gz)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 2*1024*1024)

	var batch []models.TamilWord
	headerDone := false
	tabFormat := false
	fileProcessed := int64(0)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		if !headerDone {
			headerDone = true
			if strings.HasPrefix(line, "page_namespace") && strings.Contains(line, "page_title") {
				tabFormat = true
			}
			continue
		}

		var title string
		if tabFormat {
			parts := strings.SplitN(line, "\t", 2)
			if len(parts) != 2 {
				continue
			}
			ns := strings.TrimSpace(parts[0])
			if ns != "0" {
				continue
			}
			title = strings.TrimSpace(parts[1])
		} else {
			title = line
		}

		title = strings.TrimSpace(title)
		if title == "" {
			continue
		}
		if skipNoTamil && !hasTamilScript(title) {
			continue
		}

		tamilText := strings.ReplaceAll(title, "_", " ")
		translit := strings.ToLower(title)
		if translit == "" {
			translit = tamilText
		}

		word := models.TamilWord{
			TamilText:       tamilText,
			Transliteration: translit,
			Frequency:       0,
			Category:        models.CategoryCommon,
			Source:          "tawiki_titles",
		}
		batch = append(batch, word)
		fileProcessed++
		atomic.AddInt64(&totalProcessed, 1)

		if len(batch) >= batchSize {
			insertBatch(db, &batch)
			batch = batch[:0]
		}
	}

	if len(batch) > 0 {
		insertBatch(db, &batch)
	}
	log.Printf("Loaded %s: %d titles", filepath.Base(path), fileProcessed)
	return scanner.Err()
}

func hasTamilScript(s string) bool {
	for _, r := range s {
		if r >= tamilScriptStart && r <= tamilScriptEnd {
			return true
		}
		if unicode.Is(unicode.Tamil, r) {
			return true
		}
	}
	return false
}

func insertBatch(db *gorm.DB, batch *[]models.TamilWord) {
	if len(*batch) == 0 {
		return
	}
	words := *batch
	*batch = (*batch)[:0]

	// Skip existing by transliteration
	translits := make([]string, len(words))
	for i := range words {
		translits[i] = words[i].Transliteration
	}
	var existing []models.TamilWord
	db.Select("transliteration").Where("transliteration IN ?", translits).Find(&existing)
	existingSet := make(map[string]bool)
	for _, e := range existing {
		existingSet[e.Transliteration] = true
	}
	var newWords []models.TamilWord
	for _, w := range words {
		if existingSet[w.Transliteration] {
			atomic.AddInt64(&totalSkipped, 1)
		} else {
			newWords = append(newWords, w)
		}
	}
	if len(newWords) == 0 {
		return
	}
	if err := db.CreateInBatches(newWords, 500).Error; err != nil {
		for _, w := range newWords {
			if db.Create(&w).Error == nil {
				atomic.AddInt64(&totalInserted, 1)
			} else {
				atomic.AddInt64(&totalErrors, 1)
			}
		}
	} else {
		atomic.AddInt64(&totalInserted, int64(len(newWords)))
	}
}
