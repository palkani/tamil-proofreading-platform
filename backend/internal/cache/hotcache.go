package cache

import (
	"context"
	"database/sql"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

// ScoredWord is a Tamil word with frequency score for hot cache.
type ScoredWord struct {
	Tamil     string
	Frequency int64
}

// HotCache holds top 5K words indexed by English prefix (~10 MB). Covers most autocomplete queries.
type HotCache struct {
	data map[string][]ScoredWord
	mu   sync.RWMutex
}

// NewHotCache loads top 5K words from DB (phonetic_variants + tamil_words by frequency_rank).
// Uses 15s timeout for initial load. Starts a background refresh every 30 minutes.
func NewHotCache(db *sql.DB) (*HotCache, error) {
	hc := &HotCache{data: make(map[string][]ScoredWord)}
	if db == nil {
		return hc, nil
	}
	if err := hc.load(db); err != nil {
		log.Printf("[HotCache] Initial load failed: %v", err)
		return hc, err
	}
	go hc.backgroundRefresh(db)
	return hc, nil
}

func (hc *HotCache) load(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Top 5K by frequency_rank from tamil_words; get their phonetic_variants
	query := `
		SELECT pv.variant_lower, pv.tamil_text, pv.frequency
		FROM phonetic_variants pv
		INNER JOIN tamil_words tw ON pv.tamil_word_id = tw.id AND tw.deleted_at IS NULL
		WHERE tw.frequency_rank IS NOT NULL AND tw.frequency_rank <= 5000
		ORDER BY pv.frequency DESC
	`
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	newData := make(map[string][]ScoredWord, 50000)
	for rows.Next() {
		var variant, tamil string
		var freq int64
		if err := rows.Scan(&variant, &tamil, &freq); err != nil {
			continue
		}
		variant = strings.TrimSpace(strings.ToLower(variant))
		if variant == "" || tamil == "" {
			continue
		}
		maxLen := len(variant)
		if maxLen > 8 {
			maxLen = 8
		}
		for i := 1; i <= maxLen; i++ {
			prefix := variant[:i]
			newData[prefix] = append(newData[prefix], ScoredWord{Tamil: tamil, Frequency: freq})
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	// Dedupe and keep top 10 per prefix by frequency
	for prefix, words := range newData {
		words = dedupScoredWords(words)
		sort.Slice(words, func(i, j int) bool { return words[i].Frequency > words[j].Frequency })
		if len(words) > 10 {
			words = words[:10]
		}
		newData[prefix] = words
	}

	hc.mu.Lock()
	hc.data = newData
	hc.mu.Unlock()
	log.Printf("[HotCache] Loaded %d prefix entries", len(newData))
	return nil
}

func dedupScoredWords(words []ScoredWord) []ScoredWord {
	seen := make(map[string]struct{}, len(words))
	out := make([]ScoredWord, 0, len(words))
	for _, w := range words {
		if _, exists := seen[w.Tamil]; !exists {
			seen[w.Tamil] = struct{}{}
			out = append(out, w)
		}
	}
	return out
}

// Lookup returns cached suggestions for the query (exact prefix match). Nil or empty if miss.
func (hc *HotCache) Lookup(query string) []ScoredWord {
	if hc == nil {
		return nil
	}
	hc.mu.RLock()
	defer hc.mu.RUnlock()
	return hc.data[strings.ToLower(strings.TrimSpace(query))]
}

func (hc *HotCache) backgroundRefresh(db *sql.DB) {
	if db == nil {
		return
	}
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		if err := hc.load(db); err != nil {
			log.Printf("[HotCache] Refresh error: %v", err)
		}
	}
}
