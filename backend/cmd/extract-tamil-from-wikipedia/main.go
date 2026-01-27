package main

import (
	"bufio"
	"compress/bzip2"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"regexp"
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
	totalArticles    int64
	totalTamilWords  int64
	totalInserted    int64
	totalSkipped     int64
	totalErrors      int64
	startTime        = time.Now()
	tamilWordRegex   = regexp.MustCompile(`[\p{Tamil}]+`)
	wordFrequency    = make(map[string]int)
	wordFrequencyMu   sync.Mutex
)

type WordRecord struct {
	TamilText       string
	Transliteration string
	Frequency       int
	Category        string
	Source          string
}

func main() {
	var (
		inputFile    = flag.String("file", "", "Path to Wikipedia XML dump (required)")
		batchSize    = flag.Int("batch", 1000, "Batch size for inserts")
		workers      = flag.Int("workers", 4, "Number of worker goroutines")
		minFrequency = flag.Int("min-freq", 2, "Minimum word frequency to import")
		showProgress = flag.Bool("progress", true, "Show progress updates")
		outputFile   = flag.String("output", "", "Optional: Save extracted words to file before importing")
	)
	flag.Parse()

	if *inputFile == "" {
		log.Fatal("Error: -file is required. Usage: go run main.go -file=/path/to/wikipedia-dump.xml.bz2")
	}

	if _, err := os.Stat(*inputFile); os.IsNotExist(err) {
		log.Fatalf("Error: File not found: %s", *inputFile)
	}

	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
		PrepareStmt: true,
	})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal("Failed to get database connection:", err)
	}
	defer sqlDB.Close()

	sqlDB.SetMaxOpenConns(*workers + 2)
	sqlDB.SetMaxIdleConns(*workers)
	sqlDB.SetConnMaxLifetime(time.Hour)

	log.Printf("Starting Wikipedia dump processing: %s", *inputFile)
	log.Printf("Batch size: %d, Workers: %d, Min frequency: %d", *batchSize, *workers, *minFrequency)

	// Open input file
	file, err := os.Open(*inputFile)
	if err != nil {
		log.Fatal("Failed to open file:", err)
	}
	defer file.Close()

	// Handle bzip2 compression
	reader := bzip2.NewReader(file)
	log.Println("Reading bzip2 compressed file...")

	// Start progress reporter
	var wg sync.WaitGroup
	if *showProgress {
		wg.Add(1)
		go func() {
			defer wg.Done()
			reportProgress()
		}()
	}

	// Extract Tamil words from Wikipedia
	err = extractTamilWords(reader, db, *batchSize, *workers, *minFrequency, *outputFile)

	if err != nil {
		log.Fatal("Extraction failed:", err)
	}

	// Stop progress reporter
	if *showProgress {
		time.Sleep(2 * time.Second)
	}

	log.Printf("\n=== Extraction Complete ===")
	log.Printf("Total articles processed: %d", atomic.LoadInt64(&totalArticles))
	log.Printf("Total Tamil words found: %d", atomic.LoadInt64(&totalTamilWords))
	log.Printf("Total inserted: %d", atomic.LoadInt64(&totalInserted))
	log.Printf("Total skipped: %d", atomic.LoadInt64(&totalSkipped))
	log.Printf("Total errors: %d", atomic.LoadInt64(&totalErrors))
	log.Printf("Time taken: %v", time.Since(startTime))
}

func reportProgress() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			articles := atomic.LoadInt64(&totalArticles)
			words := atomic.LoadInt64(&totalTamilWords)
			inserted := atomic.LoadInt64(&totalInserted)
			skipped := atomic.LoadInt64(&totalSkipped)
			errors := atomic.LoadInt64(&totalErrors)
			elapsed := time.Since(startTime)
			articleRate := float64(articles) / elapsed.Seconds()

			log.Printf("[Progress] Articles: %d (%.0f/sec) | Tamil words: %d | Inserted: %d | Skipped: %d | Errors: %d",
				articles, articleRate, words, inserted, skipped, errors)
		}
	}
}

func extractTamilWords(reader io.Reader, db *gorm.DB, batchSize, workers, minFreq int, outputFile string) error {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 256*1024)
	scanner.Buffer(buf, 10*1024*1024) // 10MB buffer

	var (
		currentText   strings.Builder
		inPage        bool
		inRevision    bool
		inText        bool
	)

	// Channel for word batches
	wordChan := make(chan WordRecord, batchSize*10)
	var wg sync.WaitGroup

	// Start worker goroutines
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			processWords(wordChan, db, batchSize)
		}()
	}

	// Optional: Save to file first
	var outputWriter *bufio.Writer
	if outputFile != "" {
		file, err := os.Create(outputFile)
		if err != nil {
			log.Printf("Warning: Could not create output file: %v", err)
		} else {
			defer file.Close()
			outputWriter = bufio.NewWriter(file)
			defer outputWriter.Flush()
		}
	}

	// Parse XML stream
	for scanner.Scan() {
		line := scanner.Text()

		// Detect page start
		if strings.Contains(line, "<page>") {
			inPage = true
			
			currentText.Reset()
			continue
		}

		if !inPage {
			continue
		}

		// Detect page end
		if strings.Contains(line, "</page>") {
			inPage = false
			inRevision = false
			inText = false

			// Process the page
			text := currentText.String()
			if text != "" {
				extractWordsFromText(text, wordChan, outputWriter)
				atomic.AddInt64(&totalArticles, 1)
				
			}

			currentText.Reset()
			continue
		}

		// Extract title
		if strings.Contains(line, "<title>") {
			re := regexp.MustCompile(`<title>(.*?)</title>`)
			matches := re.FindStringSubmatch(line)
			if len(matches) > 1 {
				_ = matches[1]
			}
		}

		// Detect revision/text section
		if strings.Contains(line, "<revision>") {
			inRevision = true
			continue
		}

		if strings.Contains(line, "</revision>") {
			inRevision = false
			continue
		}

		if inRevision && strings.Contains(line, "<text") {
			inText = true
			// Extract text content
			re := regexp.MustCompile(`<text[^>]*>(.*)`)
			matches := re.FindStringSubmatch(line)
			if len(matches) > 1 {
				textContent := matches[1]
				// Remove closing tag if present
				textContent = strings.TrimSuffix(textContent, "</text>")
				currentText.WriteString(textContent + "\n")
			}
			continue
		}

		if inText {
			// Check if this line closes the text tag
			if strings.Contains(line, "</text>") {
				// Remove closing tag
				line = strings.TrimSuffix(line, "</text>")
				currentText.WriteString(line + "\n")
				inText = false
			} else {
				currentText.WriteString(line + "\n")
			}
		}
	}

	// Close word channel and wait for workers
	close(wordChan)
	wg.Wait()

	return scanner.Err()
}

func extractWordsFromText(text string, wordChan chan<- WordRecord, outputWriter *bufio.Writer) {
	// Clean MediaWiki markup (basic cleanup)
	text = cleanMediaWikiMarkup(text)

	// Find all Tamil words
	words := tamilWordRegex.FindAllString(text, -1)
	wordSet := make(map[string]bool)

	for _, word := range words {
		// Normalize word
		word = strings.TrimSpace(word)
		if len(word) < 2 { // Skip single character "words"
			continue
		}

		// Remove common punctuation
		word = strings.Trim(word, ".,;:!?()[]{}\"'")

		if len(word) < 2 {
			continue
		}

		// Skip if not primarily Tamil
		if !isPrimarilyTamil(word) {
			continue
		}

		// Deduplicate in this article
		wordKey := normalizeTamilWord(word)
		if wordSet[wordKey] {
			continue
		}
		wordSet[wordKey] = true

		// Update frequency
		wordFrequencyMu.Lock()
		wordFrequency[wordKey]++
		freq := wordFrequency[wordKey]
		wordFrequencyMu.Unlock()

		atomic.AddInt64(&totalTamilWords, 1)

		// Generate transliteration
		translit := generateTransliteration(wordKey)

		record := WordRecord{
			TamilText:       wordKey,
			Transliteration: translit,
			Frequency:      freq,
			Category:       "common",
			Source:         "wikipedia_en",
		}

		// Write to output file if specified
		if outputWriter != nil {
			jsonBytes, _ := json.Marshal(record)
			outputWriter.WriteString(string(jsonBytes) + "\n")
		}

		// Send to channel for processing
		select {
		case wordChan <- record:
		default:
			// Channel full, skip (shouldn't happen with proper buffering)
		}
	}
}

func cleanMediaWikiMarkup(text string) string {
	// Remove common MediaWiki markup
	// Remove templates {{...}}
	re := regexp.MustCompile(`\{\{[^}]*\}\}`)
	text = re.ReplaceAllString(text, " ")

	// Remove links [[...]]
	re = regexp.MustCompile(`\[\[([^\]]+)\]\]`)
	text = re.ReplaceAllString(text, "$1")

	// Remove external links [...]
	re = regexp.MustCompile(`\[https?://[^\]]+\]`)
	text = re.ReplaceAllString(text, " ")

	// Remove HTML tags
	re = regexp.MustCompile(`<[^>]+>`)
	text = re.ReplaceAllString(text, " ")

	// Remove references <ref>...</ref>
	re = regexp.MustCompile(`<ref[^>]*>.*?</ref>`)
	text = re.ReplaceAllString(text, " ")

	// Remove multiple spaces
	re = regexp.MustCompile(`\s+`)
	text = re.ReplaceAllString(text, " ")

	return text
}

func isPrimarilyTamil(text string) bool {
	tamilCount := 0
	totalCount := 0

	for _, r := range text {
		totalCount++
		if unicode.In(r, unicode.Tamil) {
			tamilCount++
		}
	}

	// At least 80% Tamil characters
	if totalCount == 0 {
		return false
	}
	return float64(tamilCount)/float64(totalCount) >= 0.8
}

func normalizeTamilWord(word string) string {
	// Normalize Unicode (NFC)
	word = strings.TrimSpace(word)
	// Remove zero-width characters
	word = strings.ReplaceAll(word, "\u200B", "") // Zero-width space
	word = strings.ReplaceAll(word, "\u200C", "") // Zero-width non-joiner
	word = strings.ReplaceAll(word, "\u200D", "") // Zero-width joiner
	return word
}

func generateTransliteration(tamilText string) string {
	// Simple transliteration - in production, use a proper library
	// For now, create a basic transliteration
	translit := strings.ToLower(strings.ReplaceAll(tamilText, " ", "_"))
	// Remove non-ASCII for basic transliteration
	var result strings.Builder
	for _, r := range translit {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			result.WriteRune(r)
		}
	}
	if result.Len() == 0 {
		// Fallback: use a hash-based transliteration
		return fmt.Sprintf("word_%d", len(tamilText))
	}
	return result.String()
}

func processWords(wordChan <-chan WordRecord, db *gorm.DB, batchSize int) {
	var batch []models.TamilWord
	ticker := time.NewTicker(5 * time.Second)

	for {
		select {
		case record, ok := <-wordChan:
			if !ok {
				// Channel closed, process remaining batch
				if len(batch) > 0 {
					insertBatch(db, batch)
				}
				return
			}

			// Convert to model
			word := models.TamilWord{
				TamilText:       record.TamilText,
				Transliteration: record.Transliteration,
				Frequency:      record.Frequency,
				Category:       models.WordCategory(record.Category),
				Source:         record.Source,
				IsVerified:     false,
			}

			batch = append(batch, word)

			// Insert batch when full
			if len(batch) >= batchSize {
				insertBatch(db, batch)
				batch = batch[:0]
			}

		case <-ticker.C:
			// Periodic flush
			if len(batch) > 0 {
				insertBatch(db, batch)
				batch = batch[:0]
			}
		}
	}
}

func insertBatch(db *gorm.DB, batch []models.TamilWord) {
	if len(batch) == 0 {
		return
	}

	// Get unique transliterations to check for existing
	translits := make([]string, len(batch))
	for i, w := range batch {
		translits[i] = w.Transliteration
	}

	// Check existing
	var existing []models.TamilWord
	db.Where("transliteration IN ?", translits).Find(&existing)
	existingMap := make(map[string]bool)
	for _, e := range existing {
		existingMap[e.Transliteration] = true
	}

	// Filter new words
	newWords := make([]models.TamilWord, 0, len(batch))
	for _, word := range batch {
		if existingMap[word.Transliteration] {
			atomic.AddInt64(&totalSkipped, 1)
		} else {
			newWords = append(newWords, word)
		}
	}

	// Insert new words
	if len(newWords) > 0 {
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
}
