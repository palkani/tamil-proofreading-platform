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

// LexiconBinaryExt is the extension used for binary lexicon cache files.
const LexiconBinaryExt = ".bin"

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
		if tamil == "" {
			continue
		}
		if int(id) >= len(tables.TamilByID) {
			continue
		}
		// Build all lookup keys: primary transliteration + alternate_spellings (each maps to same tamil_text)
		primary := strings.TrimSpace(r.Transliteration)
		keys := make([]string, 0, 1+4)
		if primary != "" {
			keys = append(keys, primary)
		}
		for _, alt := range parseAlternateSpellings(r.AlternateSpellings) {
			alt = strings.TrimSpace(alt)
			if alt != "" && (primary == "" || alt != primary) {
				keys = append(keys, alt)
			}
		}
		if len(keys) == 0 {
			continue
		}
		tables.TamilByID[id] = tamil
		if primary != "" {
			tables.LatinByID[id] = primary
		} else {
			tables.LatinByID[id] = keys[0]
		}
		tables.GlobalFreqByID[id] = int32(r.Frequency)
		tables.BoostByID[id] = float32(r.UserConfirmed)

		seenNorm := make(map[string]bool)
		for _, k := range keys {
			norm := NormalizeRoman(k, normOpts)
			if norm == "" || seenNorm[norm] {
				continue
			}
			seenNorm[norm] = true
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

// LoadSuggestDataFromFile loads the entire lexicon from a pre-built file (binary .bin or JSON).
// Binary format loads faster and uses less memory than JSON.
// Returns nil, nil if file is missing or empty (caller should fall back to DB).
func LoadSuggestDataFromFile(path string, opts LoaderOptions) (*SuggestData, error) {
	if path == "" {
		log.Printf("[SUGGEST] LoadSuggestDataFromFile: path empty, skipping")
		return nil, nil
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("[SUGGEST] LoadSuggestDataFromFile: file missing path=%s", path)
			return nil, nil
		}
		log.Printf("[SUGGEST] LoadSuggestDataFromFile: stat failed path=%s err=%v", path, err)
		return nil, err
	}
	sizeMB := float64(info.Size()) / (1024 * 1024)
	// Prefer binary format when extension is .bin
	if strings.HasSuffix(strings.ToLower(path), LexiconBinaryExt) {
		return LoadSuggestDataFromBinary(path, sizeMB)
	}
	log.Printf("[SUGGEST] LoadSuggestDataFromFile: streaming JSON path=%s size_mb=%.2f", path, sizeMB)
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[SUGGEST] LoadSuggestDataFromFile: open failed path=%s err=%v", path, err)
		return nil, err
	}
	defer f.Close()
	dec := json.NewDecoder(f)
	// consume opening '['
	if _, err := dec.Token(); err != nil {
		log.Printf("[SUGGEST] LoadSuggestDataFromFile: token '[' failed err=%v", err)
		return nil, err
	}
	// Pre-allocate to avoid many reallocs (495k rows typical)
	rows := make([]LexiconRow, 0, 600000)
	for dec.More() {
		var r LexiconRow
		if err := dec.Decode(&r); err != nil {
			log.Printf("[SUGGEST] LoadSuggestDataFromFile: decode row failed at len=%d err=%v", len(rows), err)
			return nil, err
		}
		rows = append(rows, r)
	}
	// consume closing ']'
	if _, err := dec.Token(); err != nil {
		log.Printf("[SUGGEST] LoadSuggestDataFromFile: token ']' failed err=%v", err)
		return nil, err
	}
	if len(rows) == 0 {
		log.Printf("[SUGGEST] LoadSuggestDataFromFile: file has 0 rows path=%s", path)
		return nil, nil
	}
	log.Printf("[SUGGEST] LoadSuggestDataFromFile: decoded %d rows, building trie...", len(rows))
	version := "file:" + path
	out := BuildSuggestDataFromRows(rows, opts, version)
	log.Printf("[SUGGEST] LoadSuggestDataFromFile: done — %d rows in cache, trie_version=%s", out.LexiconCount, out.TrieVersion)
	return out, nil
}

// LoadSuggestDataFromBinary loads SuggestData from a pre-built binary file (fast load, no JSON parse).
func LoadSuggestDataFromBinary(path string, sizeMB float64) (*SuggestData, error) {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[SUGGEST] LoadSuggestDataFromBinary: open failed path=%s err=%v", path, err)
		return nil, err
	}
	defer f.Close()
	if sizeMB <= 0 {
		info, _ := f.Stat()
		if info != nil {
			sizeMB = float64(info.Size()) / (1024 * 1024)
		}
	}
	log.Printf("[SUGGEST] LoadSuggestDataFromBinary: path=%s size_mb=%.2f", path, sizeMB)
	version := "binary:" + path
	out, err := ReadSuggestDataBinary(f, version)
	if err != nil {
		log.Printf("[SUGGEST] LoadSuggestDataFromBinary: read failed path=%s err=%v", path, err)
		return nil, err
	}
	if out == nil {
		return nil, nil
	}
	log.Printf("[SUGGEST] LoadSuggestDataFromBinary: done — %d words in cache, trie_version=%s", out.LexiconCount, out.TrieVersion)
	return out, nil
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

