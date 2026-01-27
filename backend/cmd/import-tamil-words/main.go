package main

import (
	"bufio"
	"compress/gzip"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	totalProcessed int64
	totalInserted   int64
	totalSkipped    int64
	totalErrors     int64
	startTime       = time.Now()
)

type WordRecord struct {
	TamilText       string
	Transliteration string
	Alternates      []string
	Frequency       int
	Category        string
	Meaning         string
	Source          string
}

func main() {
	var (
		inputFile    = flag.String("file", "", "Path to input file (required)")
		format       = flag.String("format", "auto", "File format: auto, sql, csv, json, jsonl, txt")
		batchSize    = flag.Int("batch", 1000, "Batch size for inserts")
		workers      = flag.Int("workers", 4, "Number of worker goroutines")
		source       = flag.String("source", "dump_import", "Source identifier for imported words")
		skipExisting = flag.Bool("skip-existing", true, "Skip words that already exist")
		showProgress = flag.Bool("progress", true, "Show progress updates")
		compress     = flag.Bool("gzip", false, "Input file is gzip compressed")
	)
	flag.Parse()

	if *inputFile == "" {
		log.Fatal("Error: -file is required. Usage: go run main.go -file=/path/to/dump")
	}

	if _, err := os.Stat(*inputFile); os.IsNotExist(err) {
		log.Fatalf("Error: File not found: %s", *inputFile)
	}

	// Auto-detect format if needed
	if *format == "auto" {
		*format = detectFormat(*inputFile)
		log.Printf("Auto-detected format: %s", *format)
	}

	// Load configuration
	cfg := config.Load()

	// Initialize database with optimized settings for bulk inserts
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent), // Reduce logging overhead
		PrepareStmt: true,                              // Use prepared statements
	})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Test connection
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal("Failed to get database connection:", err)
	}
	defer sqlDB.Close()

	// Set connection pool settings for bulk operations
	sqlDB.SetMaxOpenConns(*workers + 2)
	sqlDB.SetMaxIdleConns(*workers)
	sqlDB.SetConnMaxLifetime(time.Hour)

	log.Printf("Starting import from: %s", *inputFile)
	log.Printf("Format: %s, Batch size: %d, Workers: %d", *format, *batchSize, *workers)

	// Open input file
	file, err := os.Open(*inputFile)
	if err != nil {
		log.Fatal("Failed to open file:", err)
	}
	defer file.Close()

	var reader io.Reader = file

	// Handle gzip compression
	if *compress || strings.HasSuffix(*inputFile, ".gz") {
		gzReader, err := gzip.NewReader(file)
		if err != nil {
			log.Fatal("Failed to create gzip reader:", err)
		}
		defer gzReader.Close()
		reader = gzReader
		log.Println("Reading gzip compressed file...")
	}

	// Start progress reporter
	var wg sync.WaitGroup
	if *showProgress {
		wg.Add(1)
		go func() {
			defer wg.Done()
			reportProgress()
		}()
	}

	// Process based on format
	switch *format {
	case "sql":
		err = importSQL(reader, db, *batchSize, *workers, *source, *skipExisting)
	case "csv":
		err = importCSV(reader, db, *batchSize, *workers, *source, *skipExisting)
	case "json":
		err = importJSON(reader, db, *batchSize, *workers, *source, *skipExisting)
	case "jsonl":
		err = importJSONL(reader, db, *batchSize, *workers, *source, *skipExisting)
	case "txt":
		err = importTXT(reader, db, *batchSize, *workers, *source, *skipExisting)
	default:
		log.Fatalf("Unsupported format: %s", *format)
	}

	if err != nil {
		log.Fatal("Import failed:", err)
	}

	// Stop progress reporter
	if *showProgress {
		time.Sleep(2 * time.Second) // Let final progress report show
	}

	log.Printf("\n=== Import Complete ===")
	log.Printf("Total processed: %d", atomic.LoadInt64(&totalProcessed))
	log.Printf("Total inserted: %d", atomic.LoadInt64(&totalInserted))
	log.Printf("Total skipped: %d", atomic.LoadInt64(&totalSkipped))
	log.Printf("Total errors: %d", atomic.LoadInt64(&totalErrors))
	log.Printf("Time taken: %v", time.Since(startTime))
}

func detectFormat(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".sql":
		return "sql"
	case ".csv":
		return "csv"
	case ".json":
		return "json"
	case ".jsonl", ".ndjson":
		return "jsonl"
	case ".txt", ".text":
		return "txt"
	case ".gz":
		// Check inner extension
		base := strings.TrimSuffix(filename, ".gz")
		return detectFormat(base)
	default:
		// Try to peek at first few bytes
		file, err := os.Open(filename)
		if err != nil {
			return "txt" // Default fallback
		}
		defer file.Close()

		buf := make([]byte, 512)
		n, _ := file.Read(buf)
		content := string(buf[:n])

		if strings.HasPrefix(content, "COPY ") || strings.Contains(content, "INSERT INTO") {
			return "sql"
		}
		if strings.HasPrefix(content, "[") || strings.HasPrefix(content, "{") {
			return "json"
		}
		if strings.Contains(content, ",") && strings.Contains(content, "\n") {
			return "csv"
		}
		return "txt"
	}
}

func reportProgress() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			processed := atomic.LoadInt64(&totalProcessed)
			inserted := atomic.LoadInt64(&totalInserted)
			skipped := atomic.LoadInt64(&totalSkipped)
			errors := atomic.LoadInt64(&totalErrors)
			elapsed := time.Since(startTime)
			rate := float64(processed) / elapsed.Seconds()

			log.Printf("[Progress] Processed: %d | Inserted: %d | Skipped: %d | Errors: %d | Rate: %.0f records/sec",
				processed, inserted, skipped, errors, rate)
		}
	}
}

// Import SQL dump (COPY format or INSERT statements)
func importSQL(reader io.Reader, db *gorm.DB, batchSize, workers int, source string, skipExisting bool) error {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024) // 10MB buffer for large lines

	var batch []WordRecord
	var inCopyBlock bool
	var copyColumns []string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "--") {
			continue
		}

		// Detect COPY block
		if strings.HasPrefix(line, "COPY ") {
			inCopyBlock = true
			// Parse column names from COPY statement
			// COPY tamil_words (tamil_text, transliteration, ...) FROM stdin;
			if idx := strings.Index(line, "("); idx > 0 {
				cols := line[idx+1:]
				if idx2 := strings.Index(cols, ")"); idx2 > 0 {
					colStr := cols[:idx2]
					copyColumns = strings.Split(colStr, ",")
					for i := range copyColumns {
						copyColumns[i] = strings.TrimSpace(copyColumns[i])
					}
				}
			}
			continue
		}

		if line == "\\.\n" || line == "\\." {
			inCopyBlock = false
			continue
		}

		if inCopyBlock {
			// Parse tab-separated COPY format
			fields := strings.Split(line, "\t")
			if len(fields) >= 2 {
				record := parseSQLRecord(fields, copyColumns)
				if record != nil {
					record.Source = source
					batch = append(batch, *record)
					if len(batch) >= batchSize {
						processBatch(db, batch, skipExisting)
						batch = batch[:0]
					}
				}
			}
		} else if strings.HasPrefix(line, "INSERT INTO") {
			// Handle INSERT statements (less common for large dumps)
			// This is a simplified parser - may need enhancement
			log.Println("Warning: INSERT statements detected. Consider using COPY format for better performance.")
		}
	}

	// Process remaining batch
	if len(batch) > 0 {
		processBatch(db, batch, skipExisting)
	}

	return scanner.Err()
}

func parseSQLRecord(fields []string, columns []string) *WordRecord {
	record := &WordRecord{
		Frequency: 0,
		Category:  "common",
		Source:    "dump_import",
	}

	// Map fields to columns
	for i, col := range columns {
		if i >= len(fields) {
			break
		}
		value := strings.Trim(fields[i], `"'`)

		switch col {
		case "tamil_text":
			record.TamilText = value
		case "transliteration":
			record.Transliteration = strings.ToLower(value)
		case "alternate_spellings":
			if value != "" && value != "\\N" && value != "NULL" {
				var alternates []string
				if err := json.Unmarshal([]byte(value), &alternates); err == nil {
					record.Alternates = alternates
				}
			}
		case "frequency":
			fmt.Sscanf(value, "%d", &record.Frequency)
		case "category":
			if value != "" && value != "\\N" {
				record.Category = value
			}
		case "meaning":
			record.Meaning = value
		case "example":
			// Store if needed
		case "source":
			if value != "" && value != "\\N" {
				record.Source = value
			}
		}
	}

	// Validate required fields
	if record.TamilText == "" || record.Transliteration == "" {
		return nil
	}

	return record
}

// Import CSV format
func importCSV(reader io.Reader, db *gorm.DB, batchSize, workers int, source string, skipExisting bool) error {
	csvReader := csv.NewReader(reader)
	csvReader.Comma = ','
	csvReader.Comment = '#'
	csvReader.LazyQuotes = true
	csvReader.TrimLeadingSpace = true

	// Read header
	headers, err := csvReader.Read()
	if err != nil {
		return fmt.Errorf("failed to read CSV header: %v", err)
	}

	// Normalize header names
	headerMap := make(map[string]int)
	for i, h := range headers {
		headerMap[strings.ToLower(strings.TrimSpace(h))] = i
	}

	var batch []WordRecord

	for {
		row, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			atomic.AddInt64(&totalErrors, 1)
			continue
		}

		record := parseCSVRecord(row, headerMap)
		if record != nil {
			record.Source = source
			batch = append(batch, *record)
			if len(batch) >= batchSize {
				processBatch(db, batch, skipExisting)
				batch = batch[:0]
			}
		}
	}

	// Process remaining batch
	if len(batch) > 0 {
		processBatch(db, batch, skipExisting)
	}

	return nil
}

func parseCSVRecord(row []string, headerMap map[string]int) *WordRecord {
	record := &WordRecord{
		Frequency: 0,
		Category:  "common",
	}

	getField := func(key string) string {
		if idx, ok := headerMap[key]; ok && idx < len(row) {
			return strings.TrimSpace(row[idx])
		}
		return ""
	}

	record.TamilText = getField("tamil") + getField("tamil_text") + getField("word")
	record.Transliteration = strings.ToLower(getField("transliteration") + getField("translit") + getField("roman"))
	freqStr := getField("frequency") + getField("freq") + getField("count")
	if freqStr != "" {
		fmt.Sscanf(freqStr, "%d", &record.Frequency)
	}
	record.Category = getField("category") + getField("type")
	if record.Category == "" {
		record.Category = "common"
	}
	record.Meaning = getField("meaning") + getField("definition")

	// Parse alternates
	altStr := getField("alternates") + getField("alternate_spellings") + getField("variants")
	if altStr != "" {
		var alternates []string
		if err := json.Unmarshal([]byte(altStr), &alternates); err == nil {
			record.Alternates = alternates
		} else {
			// Try comma-separated
			alts := strings.Split(altStr, ",")
			for _, alt := range alts {
				alt = strings.TrimSpace(alt)
				if alt != "" {
					record.Alternates = append(record.Alternates, alt)
				}
			}
		}
	}

	// Validate
	if record.TamilText == "" || record.Transliteration == "" {
		return nil
	}

	return record
}

// Import JSON array format
func importJSON(reader io.Reader, db *gorm.DB, batchSize, workers int, source string, skipExisting bool) error {
	decoder := json.NewDecoder(reader)

	// Expect array start
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("failed to read JSON: %v", err)
	}
	if delim, ok := token.(json.Delim); !ok || delim != '[' {
		return fmt.Errorf("expected JSON array, got %v", token)
	}

	var batch []WordRecord

	for decoder.More() {
		var entry map[string]interface{}
		if err := decoder.Decode(&entry); err != nil {
			atomic.AddInt64(&totalErrors, 1)
			continue
		}

		record := parseJSONRecord(entry)
		if record != nil {
			record.Source = source
			batch = append(batch, *record)
			if len(batch) >= batchSize {
				processBatch(db, batch, skipExisting)
				batch = batch[:0]
			}
		}
	}

	// Process remaining batch
	if len(batch) > 0 {
		processBatch(db, batch, skipExisting)
	}

	return nil
}

// Import JSONL (newline-delimited JSON)
func importJSONL(reader io.Reader, db *gorm.DB, batchSize, workers int, source string, skipExisting bool) error {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)

	var batch []WordRecord

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var entry map[string]interface{}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			atomic.AddInt64(&totalErrors, 1)
			continue
		}

		record := parseJSONRecord(entry)
		if record != nil {
			record.Source = source
			batch = append(batch, *record)
			if len(batch) >= batchSize {
				processBatch(db, batch, skipExisting)
				batch = batch[:0]
			}
		}
	}

	// Process remaining batch
	if len(batch) > 0 {
		processBatch(db, batch, skipExisting)
	}

	return scanner.Err()
}

func parseJSONRecord(entry map[string]interface{}) *WordRecord {
	record := &WordRecord{
		Frequency: 0,
		Category:  "common",
	}

	getStr := func(keys ...string) string {
		for _, key := range keys {
			if val, ok := entry[key]; ok {
				if str, ok := val.(string); ok {
					return strings.TrimSpace(str)
				}
			}
		}
		return ""
	}

	getInt := func(keys ...string) int {
		for _, key := range keys {
			if val, ok := entry[key]; ok {
				switch v := val.(type) {
				case float64:
					return int(v)
				case int:
					return v
				case string:
					var i int
					fmt.Sscanf(v, "%d", &i)
					return i
				}
			}
		}
		return 0
	}

	record.TamilText = getStr("tamil", "tamil_text", "word", "text")
	record.Transliteration = strings.ToLower(getStr("transliteration", "translit", "roman", "english"))
	record.Frequency = getInt("frequency", "freq", "count")
	record.Category = getStr("category", "type")
	if record.Category == "" {
		record.Category = "common"
	}
	record.Meaning = getStr("meaning", "definition", "translation")

	// Parse alternates
	if altVal, ok := entry["alternates"]; ok {
		switch v := altVal.(type) {
		case []interface{}:
			for _, item := range v {
				if str, ok := item.(string); ok {
					record.Alternates = append(record.Alternates, str)
				}
			}
		case string:
			var alternates []string
			if err := json.Unmarshal([]byte(v), &alternates); err == nil {
				record.Alternates = alternates
			}
		}
	}

	// Validate
	if record.TamilText == "" || record.Transliteration == "" {
		return nil
	}

	return record
}

// Import plain text (one word per line, tab-separated or space-separated)
func importTXT(reader io.Reader, db *gorm.DB, batchSize, workers int, source string, skipExisting bool) error {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)

	var batch []WordRecord

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Try tab-separated first, then space-separated
		var parts []string
		if strings.Contains(line, "\t") {
			parts = strings.Split(line, "\t")
		} else {
			parts = strings.Fields(line)
		}

		if len(parts) < 2 {
			// Single word - assume it's Tamil text, generate transliteration
			if isTamilText(parts[0]) {
				record := &WordRecord{
					TamilText:       parts[0],
					Transliteration: generateTransliteration(parts[0]),
					Frequency:       1,
					Category:        "common",
					Source:          source,
				}
				batch = append(batch, *record)
			}
		} else {
			// Format: tamil_text transliteration [frequency] [category]
			record := &WordRecord{
				TamilText:       parts[0],
				Transliteration: strings.ToLower(parts[1]),
				Frequency:       1,
				Category:        "common",
				Source:          source,
			}

			if len(parts) >= 3 {
				fmt.Sscanf(parts[2], "%d", &record.Frequency)
			}
			if len(parts) >= 4 {
				record.Category = parts[3]
			}

			batch = append(batch, *record)
		}

		if len(batch) >= batchSize {
			processBatch(db, batch, skipExisting)
			batch = batch[:0]
		}
	}

	// Process remaining batch
	if len(batch) > 0 {
		processBatch(db, batch, skipExisting)
	}

	return scanner.Err()
}

func isTamilText(text string) bool {
	for _, r := range text {
		if unicode.In(r, unicode.Tamil) {
			return true
		}
	}
	return false
}

func generateTransliteration(tamilText string) string {
	// Simple transliteration - this is a placeholder
	// In production, you'd want a proper transliteration library
	return strings.ToLower(strings.ReplaceAll(tamilText, " ", "_"))
}

// Process batch of records
func processBatch(db *gorm.DB, batch []WordRecord, skipExisting bool) {
	if len(batch) == 0 {
		return
	}

	atomic.AddInt64(&totalProcessed, int64(len(batch)))

	words := make([]models.TamilWord, 0, len(batch))
	translitMap := make(map[string]bool)

	for _, rec := range batch {
		// Skip duplicates in batch
		translitLower := strings.ToLower(rec.Transliteration)
		if translitMap[translitLower] {
			atomic.AddInt64(&totalSkipped, 1)
			continue
		}
		translitMap[translitLower] = true

		// Prepare alternate spellings
		alternates := ""
		if len(rec.Alternates) > 0 {
			jsonBytes, _ := json.Marshal(rec.Alternates)
			alternates = string(jsonBytes)
		}

		word := models.TamilWord{
			TamilText:          rec.TamilText,
			Transliteration:    translitLower,
			AlternateSpellings: alternates,
			Frequency:          rec.Frequency,
			Category:           models.WordCategory(rec.Category),
			Meaning:            rec.Meaning,
			Source:             rec.Source,
			IsVerified:         false,
		}

		words = append(words, word)
	}

	if len(words) == 0 {
		return
	}

	// Batch insert with conflict handling
	if skipExisting {
		// Check which words already exist
		translits := make([]string, len(words))
		for i, w := range words {
			translits[i] = w.Transliteration
		}

		var existing []models.TamilWord
		db.Where("transliteration IN ?", translits).Find(&existing)
		existingMap := make(map[string]bool)
		for _, e := range existing {
			existingMap[e.Transliteration] = true
		}

		// Filter out existing words
		newWords := make([]models.TamilWord, 0, len(words))
		for _, word := range words {
			if existingMap[word.Transliteration] {
				atomic.AddInt64(&totalSkipped, 1)
			} else {
				newWords = append(newWords, word)
			}
		}

		// Batch insert new words
		if len(newWords) > 0 {
			// Use GORM's CreateInBatches for better performance
			if err := db.CreateInBatches(newWords, 500).Error; err != nil {
				// Fallback to individual inserts
				for _, word := range newWords {
					if db.Create(&word).Error == nil {
						atomic.AddInt64(&totalInserted, 1)
					} else {
						atomic.AddInt64(&totalErrors, 1)
					}
				}
			} else {
				atomic.AddInt64(&totalInserted, int64(len(newWords)))
			}
		}
	} else {
		// Insert all, ignoring conflicts
		if err := db.CreateInBatches(words, 500).Error; err != nil {
			// Fallback to individual inserts
			for _, word := range words {
				if db.Create(&word).Error == nil {
					atomic.AddInt64(&totalInserted, 1)
				} else {
					atomic.AddInt64(&totalErrors, 1)
				}
			}
		} else {
			atomic.AddInt64(&totalInserted, int64(len(words)))
		}
	}
}
