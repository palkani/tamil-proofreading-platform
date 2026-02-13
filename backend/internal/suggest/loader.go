package suggest

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"time"

	"gorm.io/gorm"
)

type LexiconRow struct {
	ID                 uint
	TamilText          string
	Transliteration    string
	AlternateSpellings string
	Frequency          int
	UserConfirmed      int
}

type SuggestData struct {
	Tables        *IDTables
	Trie          *Trie
	LexiconCount  int
	LoadedAt      time.Time
	TrieVersion   string
}

// LoadSuggestData loads lexicon from tamil_words when the baked file was empty or missing.
// Uses batched cursor query with opts.BatchSize, opts.LoadLimit (0 = no limit), and opts.BatchTimeout.
func LoadSuggestData(ctx context.Context, db *gorm.DB, opts LoaderOptions) (*SuggestData, error) {
	if db == nil {
		return &SuggestData{
			Tables:       NewIDTables(1),
			Trie:         NewTrie(opts.MaxTopPerNode, NewIDTables(1)),
			LexiconCount: 0,
			LoadedAt:     time.Now(),
			TrieVersion:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	}
	batchSize := opts.BatchSize
	if batchSize <= 0 {
		batchSize = 10000
	}
	loadLimit := opts.LoadLimit
	batchTimeout := opts.BatchTimeout
	if batchTimeout <= 0 {
		batchTimeout = 2 * time.Minute
	}
	var rows []LexiconRow
	var lastFreq int
	var lastUC int
	var lastID uint
	firstBatch := true
	for {
		reqCtx, cancel := context.WithTimeout(ctx, batchTimeout)
		var batch []LexiconRow
		q := db.WithContext(reqCtx).Table("tamil_words").
			Select("id, tamil_text, transliteration, alternate_spellings, frequency, user_confirmed").
			Order("frequency DESC, user_confirmed DESC, id")
		if !firstBatch {
			q = q.Where("(frequency, user_confirmed, id) < (?, ?, ?)", lastFreq, lastUC, lastID)
		}
		if err := q.Limit(batchSize).Find(&batch).Error; err != nil {
			cancel()
			log.Printf("[SUGGEST] LoadSuggestData DB batch failed: %v", err)
			return nil, err
		}
		cancel()
		rows = append(rows, batch...)
		log.Printf("[SUGGEST] LoadSuggestData: fetched %d rows (total %d)", len(batch), len(rows))
		if len(batch) < batchSize {
			break
		}
		last := batch[len(batch)-1]
		lastFreq, lastUC, lastID = last.Frequency, last.UserConfirmed, last.ID
		firstBatch = false
		if loadLimit > 0 && len(rows) >= loadLimit {
			rows = rows[:loadLimit]
			log.Printf("[SUGGEST] LoadSuggestData: stopped at limit %d", loadLimit)
			break
		}
	}
	if len(rows) == 0 {
		log.Printf("[SUGGEST] LoadSuggestData: tamil_words table is empty; suggest will return no results until words are added")
		return &SuggestData{
			Tables:       NewIDTables(1),
			Trie:         NewTrie(opts.MaxTopPerNode, NewIDTables(1)),
			LexiconCount: 0,
			LoadedAt:     time.Now(),
			TrieVersion:  "db:empty",
		}, nil
	}
	version := "db:" + time.Now().UTC().Format(time.RFC3339)
	log.Printf("[SUGGEST] LoadSuggestData: loading %d rows from DB into cache", len(rows))
	return BuildSuggestDataFromRows(rows, opts, version), nil
}

// BuildSuggestDataFromRows builds SuggestData (IDTables + Trie) from lexicon rows.
// Used by both LoadSuggestData (DB) and LoadSuggestDataFromFile (baked file).
func BuildSuggestDataFromRows(rows []LexiconRow, opts LoaderOptions, version string) *SuggestData {
	maxID := 0
	for _, r := range rows {
		if int(r.ID) > maxID {
			maxID = int(r.ID)
		}
	}
	tables := NewIDTables(maxID)
	trie := NewTrie(opts.MaxTopPerNode, tables)

	normOpts := NormalizeOptions{EnableVowelCollapse: opts.EnableVowelCollapse}
	for _, r := range rows {
		if r.ID == 0 {
			continue
		}
		id := int32(r.ID)
		tamil := strings.TrimSpace(r.TamilText)
		latin := strings.TrimSpace(r.Transliteration)
		if tamil == "" || latin == "" {
			continue
		}
		if int(id) >= len(tables.TamilByID) {
			continue
		}
		tables.TamilByID[id] = tamil
		tables.LatinByID[id] = latin
		tables.GlobalFreqByID[id] = int32(r.Frequency)
		tables.BoostByID[id] = float32(r.UserConfirmed)

		keys := []string{latin}
		for _, alt := range parseAlternateSpellings(r.AlternateSpellings) {
			keys = append(keys, alt)
		}
		for _, k := range keys {
			norm := NormalizeRoman(k, normOpts)
			if norm == "" {
				continue
			}
			trie.Insert(norm, id)
		}
	}

	return &SuggestData{
		Tables:       tables,
		Trie:         trie,
		LexiconCount: len(rows),
		LoadedAt:     time.Now(),
		TrieVersion:  version,
	}
}

// LoadSuggestDataFromFile loads the entire lexicon from a pre-built JSON file (baked into image in CI).
// The full file is read and unmarshalled; all rows are loaded into the in-memory cache (trie + ID tables).
// Returns nil, nil if file is missing or empty (caller should fall back to DB).
func LoadSuggestDataFromFile(path string, opts LoaderOptions) (*SuggestData, error) {
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var rows []LexiconRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	version := "file:" + path
	log.Printf("[SUGGEST] LoadSuggestDataFromFile: loading entire file into cache — %d rows from %s", len(rows), path)
	return BuildSuggestDataFromRows(rows, opts, version), nil
}

type LoaderOptions struct {
	MaxTopPerNode       int
	EnableVowelCollapse bool
	BatchSize           int           // batch size for DB load (LoadSuggestData)
	LoadLimit           int           // max rows to load from DB (0 = no limit)
	BatchTimeout        time.Duration // per-batch timeout for DB load
}

func parseAlternateSpellings(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err == nil {
		return out
	}
	// Fallback: comma separated string
	parts := strings.Split(raw, ",")
	out = make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

