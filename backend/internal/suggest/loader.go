package suggest

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
)

// isRetryableDBError returns true for transient connection errors (e.g. unexpected EOF, deadline exceeded).
func isRetryableDBError(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "EOF") ||
		strings.Contains(s, "connection reset") ||
		strings.Contains(s, "broken pipe") ||
		strings.Contains(s, "connection refused") ||
		strings.Contains(s, "deadline exceeded") ||
		strings.Contains(s, "context canceled")
}

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

	var rows []LexiconRow
	var version string
	var loadedFromCache bool

	// Try loading from Redis cache first
	if opts.UseRedisCache && opts.RedisClient != nil && opts.RedisClient.Enabled() {
		cachedRows, cachedVersion, _, found, err := opts.RedisClient.LoadLexiconRowsFromCache(ctx)
		if err == nil && found && len(cachedRows) > 0 {
			rows = cachedRows
			version = cachedVersion
			loadedFromCache = true
			// Use cached version or generate new one
			if version == "" {
				version = time.Now().UTC().Format(time.RFC3339)
			}
		}
	}

	// Fallback to PostgreSQL if cache miss — load in batches with per-batch timeout
	if !loadedFromCache {
		loadLimit := opts.LoadLimit
		if loadLimit <= 0 {
			loadLimit = 100000
		}
		batchSize := opts.BatchSize
		if batchSize <= 0 {
			batchSize = 10000
		}
		batchTimeout := opts.BatchTimeout
		if batchTimeout <= 0 {
			batchTimeout = 30 * time.Second
		}
		// Keyset pagination: (frequency, user_confirmed, id) < last row — each batch is O(limit), not O(offset).
		// Requires index: idx_tamil_words_freq_uc_id ON (frequency DESC, user_confirmed DESC, id).
		var loadErr error
		for attempt := 0; attempt < 3; attempt++ {
			rows = make([]LexiconRow, 0, loadLimit)
			var lastFreq int
			var lastUC int
			var lastID uint
			firstBatch := true
			for {
				batchCtx := ctx
				var cancel context.CancelFunc
				if batchTimeout > 0 {
					batchCtx, cancel = context.WithTimeout(ctx, batchTimeout)
				}
				q := db.WithContext(batchCtx).Table("tamil_words").
					Select("id, tamil_text, transliteration, alternate_spellings, frequency, user_confirmed").
					Order("frequency DESC, user_confirmed DESC, id")
				if !firstBatch {
					q = q.Where("(frequency, user_confirmed, id) < (?, ?, ?)", lastFreq, lastUC, lastID)
				}
				var batch []LexiconRow
				batchErr := q.Limit(batchSize).Find(&batch).Error
				if cancel != nil {
					cancel()
				}
				if batchErr != nil {
					loadErr = batchErr
					break
				}
				rows = append(rows, batch...)
				if len(batch) < batchSize {
					break
				}
				last := batch[len(batch)-1]
				lastFreq, lastUC, lastID = last.Frequency, last.UserConfirmed, last.ID
				firstBatch = false
				if len(rows) >= loadLimit {
					break
				}
			}
			if loadErr == nil {
				break
			}
			if !isRetryableDBError(loadErr) || attempt == 2 {
				break
			}
			log.Printf("[SUGGEST] LoadSuggestData retry %d/3 after: %v", attempt+1, loadErr)
			time.Sleep(time.Duration(attempt+1) * time.Second)
		}
		if loadErr != nil {
			log.Printf("[SUGGEST] LoadSuggestData DB error (using empty lexicon): %v", loadErr)
			return &SuggestData{
				Tables:       NewIDTables(1),
				Trie:         NewTrie(opts.MaxTopPerNode, NewIDTables(1)),
				LexiconCount: 0,
				LoadedAt:     time.Now(),
				TrieVersion:  time.Now().UTC().Format(time.RFC3339),
			}, nil
		}

		// Generate version timestamp
		version = time.Now().UTC().Format(time.RFC3339)

		// Cache in Redis for next time (async, don't block on error)
		if opts.UseRedisCache && opts.RedisClient != nil && opts.RedisClient.Enabled() {
			go func() {
				cacheCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				_ = opts.RedisClient.CacheLexiconRows(cacheCtx, rows, version)
			}()
		}
	}

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
	}, nil
}

type LoaderOptions struct {
	MaxTopPerNode       int
	EnableVowelCollapse bool
	RedisClient         *RedisClient // Optional: for caching lexicon
	UseRedisCache       bool         // Whether to use Redis cache
	// Tuning: batch size and limit for DB load; BatchTimeout per batch (0 = no timeout)
	BatchSize     int           // rows per query (default 10000)
	LoadLimit     int           // max rows to load (default 100000)
	BatchTimeout  time.Duration // per-batch deadline (default 30s)
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

