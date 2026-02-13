package suggest

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildSuggestDataFromRows(t *testing.T) {
	rows := []LexiconRow{
		{ID: 1, TamilText: "நன்றி", Transliteration: "nandri", AlternateSpellings: `["nandree"]`, Frequency: 100, UserConfirmed: 5},
		{ID: 2, TamilText: "வணக்கம்", Transliteration: "vanakkam", AlternateSpellings: "", Frequency: 200, UserConfirmed: 10},
	}
	opts := LoaderOptions{MaxTopPerNode: 15, EnableVowelCollapse: false}
	data := BuildSuggestDataFromRows(rows, opts, "test")
	if data == nil {
		t.Fatal("BuildSuggestDataFromRows returned nil")
	}
	if data.LexiconCount != 2 {
		t.Errorf("LexiconCount want 2, got %d", data.LexiconCount)
	}
	if data.Trie == nil {
		t.Fatal("Trie is nil")
	}
	normOpts := NormalizeOptions{EnableVowelCollapse: false}
	// Lookup by primary transliteration (trie keys are normalized)
	norm := NormalizeRoman("nandri", normOpts)
	ids := data.Trie.Lookup(norm, 5)
	if len(ids) == 0 {
		t.Errorf("Lookup(normalized 'nandri'=%q) returned no ids", norm)
	}
	if len(ids) > 0 && data.Tables.TamilByID[ids[0]] != "நன்றி" {
		t.Errorf("Lookup('nandri') wrong tamil: got %q", data.Tables.TamilByID[ids[0]])
	}
	// Lookup by alternate spelling
	normAlt := NormalizeRoman("nandree", normOpts)
	idsAlt := data.Trie.Lookup(normAlt, 5)
	if len(idsAlt) == 0 {
		t.Errorf("Lookup(normalized 'nandree'=%q) alternate returned no ids", normAlt)
	}
	if len(idsAlt) > 0 && data.Tables.TamilByID[idsAlt[0]] != "நன்றி" {
		t.Errorf("Lookup('nandree') wrong tamil: got %q", data.Tables.TamilByID[idsAlt[0]])
	}
	normVan := NormalizeRoman("vanakkam", normOpts)
	idsVan := data.Trie.Lookup(normVan, 5)
	if len(idsVan) == 0 {
		t.Errorf("Lookup(normalized 'vanakkam'=%q) returned no ids", normVan)
	}
}

func TestLoadSuggestDataFromFile(t *testing.T) {
	rows := []LexiconRow{
		{ID: 1, TamilText: "சரி", Transliteration: "sari", AlternateSpellings: "", Frequency: 50, UserConfirmed: 0},
	}
	raw, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "lexicon.json")
	if err := os.WriteFile(path, raw, 0644); err != nil {
		t.Fatal(err)
	}
	opts := LoaderOptions{MaxTopPerNode: 15, EnableVowelCollapse: false}
	data, err := LoadSuggestDataFromFile(path, opts)
	if err != nil {
		t.Fatalf("LoadSuggestDataFromFile: %v", err)
	}
	if data == nil {
		t.Fatal("LoadSuggestDataFromFile returned nil data")
	}
	if data.LexiconCount != 1 {
		t.Errorf("LexiconCount want 1, got %d", data.LexiconCount)
	}
	norm := NormalizeRoman("sari", NormalizeOptions{EnableVowelCollapse: false})
	ids := data.Trie.Lookup(norm, 5)
	if len(ids) == 0 {
		t.Errorf("Lookup(normalized 'sari'=%q) returned no ids", norm)
	}
	if len(ids) > 0 && data.Tables.TamilByID[ids[0]] != "சரி" {
		t.Errorf("Lookup('sari') wrong tamil: got %q", data.Tables.TamilByID[ids[0]])
	}
}

// TestLoadSuggestDataFromFile_realFile loads data/lexicon.json from repo root if present (e.g. full 495k rows).
// Run from repo root: go test -v -run TestLoadSuggestDataFromFile_realFile ./backend/internal/suggest
// Or from backend: go test -v -run TestLoadSuggestDataFromFile_realFile ./internal/suggest
func TestLoadSuggestDataFromFile_realFile(t *testing.T) {
	// Try paths relative to common run dirs (repo root, backend, or backend/internal/suggest)
	candidates := []string{
		"data/lexicon.json",
		"../data/lexicon.json",
		"../../data/lexicon.json",
		"../../../data/lexicon.json",
	}
	var path string
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			path = c
			break
		}
	}
	if path == "" {
		t.Skip("data/lexicon.json not found (run from repo root or backend with full lexicon)")
	}
	opts := LoaderOptions{MaxTopPerNode: 25, EnableVowelCollapse: false}
	start := time.Now()
	data, err := LoadSuggestDataFromFile(path, opts)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("LoadSuggestDataFromFile: %v", err)
	}
	if data == nil {
		t.Fatal("LoadSuggestDataFromFile returned nil")
	}
	t.Logf("Loaded %d rows from %s in %v", data.LexiconCount, path, elapsed)
	if data.LexiconCount == 0 {
		t.Error("lexicon count is 0")
	}
	// Sanity: lookup common prefixes
	for _, q := range []string{"na", "va", "ta", "tamil"} {
		ids := data.Trie.Lookup(NormalizeRoman(q, NormalizeOptions{EnableVowelCollapse: false}), 5)
		if len(ids) == 0 {
			t.Logf("Lookup(%q) returned 0 ids (may be ok if no matches)", q)
			continue
		}
		t.Logf("Lookup(%q) -> %d ids, e.g. %q", q, len(ids), data.Tables.TamilByID[ids[0]])
	}
	// Backend should wait at least this long for lexicon load (so ready timeout > load time)
	if elapsed > 30*time.Second {
		t.Logf("Load took %v; ensure server WaitSuggestReady timeout is at least 5 minutes so cache loads before 'ready'", elapsed)
	}
}
