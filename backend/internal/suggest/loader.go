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

// LoadSuggestData returns empty lexicon; lexicon is loaded from baked file (LoadSuggestDataFromFile) in engine.reload.
func LoadSuggestData(ctx context.Context, db *gorm.DB, opts LoaderOptions) (*SuggestData, error) {
	return &SuggestData{
		Tables:       NewIDTables(1),
		Trie:         NewTrie(opts.MaxTopPerNode, NewIDTables(1)),
		LexiconCount: 0,
		LoadedAt:     time.Now(),
		TrieVersion:  time.Now().UTC().Format(time.RFC3339),
	}, nil
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

// LoadSuggestDataFromFile loads lexicon from a pre-built JSON file (baked into image in CI).
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
	log.Printf("[SUGGEST] LoadSuggestDataFromFile loaded %d rows from %s", len(rows), path)
	return BuildSuggestDataFromRows(rows, opts, version), nil
}

type LoaderOptions struct {
	MaxTopPerNode       int
	EnableVowelCollapse bool
	BatchSize           int           // unused (kept for API compatibility)
	LoadLimit           int           // unused (kept for API compatibility)
	BatchTimeout        time.Duration // unused (kept for API compatibility)
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

