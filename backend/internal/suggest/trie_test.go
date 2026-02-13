package suggest

import "testing"

func TestTrieTopIDsOrdering(t *testing.T) {
	tables := NewIDTables(3)
	tables.TamilByID[1] = "அ"
	tables.TamilByID[2] = "ஆ"
	tables.TamilByID[3] = "இ"
	tables.GlobalFreqByID[1] = 10
	tables.GlobalFreqByID[2] = 30
	tables.GlobalFreqByID[3] = 20

	// NewTrie enforces min maxTopPerNode=5, so we use 5
	trie := NewTrie(5, tables)
	trie.Insert("a", 1)
	trie.Insert("a", 2)
	trie.Insert("a", 3)

	out := trie.Lookup("a", 5)
	if len(out) != 3 {
		t.Fatalf("expected 3 ids, got %d", len(out))
	}
	// Order by score: 2 (30), 3 (20), 1 (10)
	if out[0] != 2 || out[1] != 3 || out[2] != 1 {
		t.Fatalf("unexpected order: %v", out)
	}
}
