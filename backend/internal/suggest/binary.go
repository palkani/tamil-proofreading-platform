package suggest

import (
	"encoding/binary"
	"io"
	"log"
	"sort"
	"time"
	"unicode/utf8"
)

const binaryMagic = "PTLX"
const binaryVersion byte = 1

// WriteSuggestDataBinary serializes SuggestData to a compact binary format for fast load.
// Format: magic(4) version(1) | maxID(4) lexiconCount(4) maxTopPerNode(4) | IDTables | Trie.
func WriteSuggestDataBinary(w io.Writer, data *SuggestData) error {
	order := binary.BigEndian
	// Magic + version
	if _, err := w.Write([]byte(binaryMagic)); err != nil {
		return err
	}
	if _, err := w.Write([]byte{binaryVersion}); err != nil {
		return err
	}
	tables := data.Tables
	trie := data.Trie
	maxID := len(tables.TamilByID) - 1
	if maxID < 0 {
		maxID = 0
	}
	// Header
	if err := binary.Write(w, order, uint32(maxID)); err != nil {
		return err
	}
	if err := binary.Write(w, order, uint32(data.LexiconCount)); err != nil {
		return err
	}
	if err := binary.Write(w, order, int32(trie.maxTopPerNode)); err != nil {
		return err
	}
	// IDTables: for id 1..maxID write tamil (len+utf8), latin (len+utf8), freq, boost
	writeStr := func(s string) error {
		b := []byte(s)
		if len(b) > 0xffff {
			b = b[:0xffff]
		}
		if err := binary.Write(w, order, uint16(len(b))); err != nil {
			return err
		}
		_, err := w.Write(b)
		return err
	}
	for id := 1; id <= maxID; id++ {
		tamil := ""
		latin := ""
		if id < len(tables.TamilByID) {
			tamil = tables.TamilByID[id]
		}
		if id < len(tables.LatinByID) {
			latin = tables.LatinByID[id]
		}
		if err := writeStr(tamil); err != nil {
			return err
		}
		if err := writeStr(latin); err != nil {
			return err
		}
		freq := int32(0)
		boost := float32(0)
		if id < len(tables.GlobalFreqByID) {
			freq = tables.GlobalFreqByID[id]
		}
		if id < len(tables.BoostByID) {
			boost = tables.BoostByID[id]
		}
		if err := binary.Write(w, order, freq); err != nil {
			return err
		}
		if err := binary.Write(w, order, boost); err != nil {
			return err
		}
	}
	// Trie: numNodes, then per node: numChildren, (rune int32, childIdx int32)*, numTopIDs, topIDs*
	numNodes := len(trie.nodes)
	if err := binary.Write(w, order, uint32(numNodes)); err != nil {
		return err
	}
	for _, node := range trie.nodes {
		// Children in deterministic order (by rune)
		runes := make([]rune, 0, len(node.children))
		for r := range node.children {
			runes = append(runes, r)
		}
		sort.Slice(runes, func(i, j int) bool { return runes[i] < runes[j] })
		if err := binary.Write(w, order, int32(len(runes))); err != nil {
			return err
		}
		for _, r := range runes {
			if err := binary.Write(w, order, int32(r)); err != nil {
				return err
			}
			if err := binary.Write(w, order, int32(node.children[r])); err != nil {
				return err
			}
		}
		if err := binary.Write(w, order, int32(len(node.topIDs))); err != nil {
			return err
		}
		for _, id := range node.topIDs {
			if err := binary.Write(w, order, id); err != nil {
				return err
			}
		}
	}
	return nil
}

// ReadSuggestDataBinary deserializes SuggestData from the binary format.
// Returns nil, nil if the file is not in binary format (wrong magic).
func ReadSuggestDataBinary(r io.Reader, version string) (*SuggestData, error) {
	magic := make([]byte, 4)
	if _, err := io.ReadFull(r, magic); err != nil {
		return nil, err
	}
	if string(magic) != binaryMagic {
		return nil, nil // not our format, caller can try JSON
	}
	ver := make([]byte, 1)
	if _, err := io.ReadFull(r, ver); err != nil {
		return nil, err
	}
	if ver[0] != binaryVersion {
		log.Printf("[SUGGEST] binary format version %d not supported (expected %d)", ver[0], binaryVersion)
		return nil, nil
	}
	order := binary.BigEndian
	var maxID, lexiconCount uint32
	var maxTopPerNode int32
	if err := binary.Read(r, order, &maxID); err != nil {
		return nil, err
	}
	if err := binary.Read(r, order, &lexiconCount); err != nil {
		return nil, err
	}
	if err := binary.Read(r, order, &maxTopPerNode); err != nil {
		return nil, err
	}
	if maxTopPerNode < 5 {
		maxTopPerNode = 5
	}
	size := int(maxID) + 1
	tables := NewIDTables(int(maxID))
	readStr := func() (string, error) {
		var len16 uint16
		if err := binary.Read(r, order, &len16); err != nil {
			return "", err
		}
		b := make([]byte, len16)
		if len16 > 0 {
			if _, err := io.ReadFull(r, b); err != nil {
				return "", err
			}
		}
		if !utf8.Valid(b) {
			return "", nil
		}
		return string(b), nil
	}
	for id := 1; id <= int(maxID); id++ {
		tamil, err := readStr()
		if err != nil {
			return nil, err
		}
		latin, err := readStr()
		if err != nil {
			return nil, err
		}
		var freq int32
		var boost float32
		if err := binary.Read(r, order, &freq); err != nil {
			return nil, err
		}
		if err := binary.Read(r, order, &boost); err != nil {
			return nil, err
		}
		if id < size {
			tables.TamilByID[id] = tamil
			tables.LatinByID[id] = latin
			tables.GlobalFreqByID[id] = freq
			tables.BoostByID[id] = boost
		}
	}
	var numNodes uint32
	if err := binary.Read(r, order, &numNodes); err != nil {
		return nil, err
	}
	nodes := make([]trieNode, numNodes)
	for i := uint32(0); i < numNodes; i++ {
		var numChildren int32
		if err := binary.Read(r, order, &numChildren); err != nil {
			return nil, err
		}
		children := make(map[rune]int)
		for j := int32(0); j < numChildren; j++ {
			var rn int32
			var childIdx int32
			if err := binary.Read(r, order, &rn); err != nil {
				return nil, err
			}
			if err := binary.Read(r, order, &childIdx); err != nil {
				return nil, err
			}
			children[rune(rn)] = int(childIdx)
		}
		var numTop int32
		if err := binary.Read(r, order, &numTop); err != nil {
			return nil, err
		}
		topIDs := make([]int32, numTop)
		for k := int32(0); k < numTop; k++ {
			if err := binary.Read(r, order, &topIDs[k]); err != nil {
				return nil, err
			}
		}
		nodes[i] = trieNode{children: children, topIDs: topIDs}
	}
	trie := &Trie{
		nodes:         nodes,
		maxTopPerNode: int(maxTopPerNode),
		tables:        tables,
	}
	return &SuggestData{
		Tables:       tables,
		Trie:         trie,
		LexiconCount: int(lexiconCount),
		LoadedAt:     time.Now(),
		TrieVersion:  version,
	}, nil
}
