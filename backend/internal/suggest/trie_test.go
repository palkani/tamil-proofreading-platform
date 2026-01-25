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

	trie := NewTrie(2, tables)
	trie.Insert("a", 1)
	trie.Insert("a", 2)
	trie.Insert("a", 3)

	out := trie.Lookup("a", 3)
	if len(out) != 2 {
		t.Fatalf("expected top2, got %d", len(out))
	}
	if out[0] != 2 || out[1] != 3 {
		t.Fatalf("unexpected order: %v", out)
	}
}
