package suggest

import "sort"

type trieNode struct {
	children map[rune]int
	topIDs   []int32
}

type Trie struct {
	nodes       []trieNode
	maxTopPerNode int
	tables      *IDTables
}

func NewTrie(maxTopPerNode int, tables *IDTables) *Trie {
	if maxTopPerNode < 5 {
		maxTopPerNode = 5
	}
	t := &Trie{
		nodes:       []trieNode{{children: map[rune]int{}, topIDs: nil}},
		maxTopPerNode: maxTopPerNode,
		tables:      tables,
	}
	return t
}

func (t *Trie) Insert(key string, id int32) {
	if key == "" || id <= 0 {
		return
	}
	nodeIdx := 0
	t.maybePushTop(nodeIdx, id)
	for _, r := range key {
		next, ok := t.nodes[nodeIdx].children[r]
		if !ok {
			next = len(t.nodes)
			t.nodes = append(t.nodes, trieNode{children: map[rune]int{}, topIDs: nil})
			t.nodes[nodeIdx].children[r] = next
		}
		nodeIdx = next
		t.maybePushTop(nodeIdx, id)
	}
}

func (t *Trie) Lookup(prefix string, limit int) []int32 {
	if prefix == "" {
		return nil
	}
	nodeIdx := 0
	for _, r := range prefix {
		next, ok := t.nodes[nodeIdx].children[r]
		if !ok {
			return nil
		}
		nodeIdx = next
	}
	top := t.nodes[nodeIdx].topIDs
	if len(top) == 0 {
		return nil
	}
	if limit <= 0 || limit >= len(top) {
		return append([]int32(nil), top...)
	}
	return append([]int32(nil), top[:limit]...)
}

func (t *Trie) maybePushTop(nodeIdx int, id int32) {
	node := &t.nodes[nodeIdx]
	for _, existing := range node.topIDs {
		if existing == id {
			return
		}
	}
	node.topIDs = append(node.topIDs, id)
	sort.Slice(node.topIDs, func(i, j int) bool {
		li := t.tables.BaseScore(node.topIDs[i])
		lj := t.tables.BaseScore(node.topIDs[j])
		if li == lj {
			return node.topIDs[i] < node.topIDs[j]
		}
		return li > lj
	})
	if len(node.topIDs) > t.maxTopPerNode {
		node.topIDs = node.topIDs[:t.maxTopPerNode]
	}
}
