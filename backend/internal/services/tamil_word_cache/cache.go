package tamil_word_cache

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// CacheLoadOptions tunes DB load (batch size, limit, per-batch timeout). Nil = use defaults.
type CacheLoadOptions struct {
	BatchSize       int           // rows per query (default 10000)
	LoadLimit       int           // max rows (default 500000)
	BatchTimeout    time.Duration // per-batch deadline (default 30s)
}

type CacheService struct {
	db          *gorm.DB
	redisClient *redis.Client
	enabled     bool
	// In-memory cache as fallback (organized by first letter)
	memoryCache map[string][]CachedWord
	memoryMu    sync.RWMutex
	initialized bool
	// Load tuning (used by InitializeCache)
	loadBatchSize    int
	loadLimit        int
	batchTimeout     time.Duration
}

type CachedWord struct {
	TamilText       string `json:"tamil_text"`
	Transliteration string `json:"transliteration"`
	Frequency       int    `json:"frequency"`
	Category        string `json:"category"`
	UserConfirmed   int    `json:"user_confirmed"`
	Rank            int    `json:"rank"` // Computed rank score
}

const (
	// Redis key prefix for Tamil words by first letter
	redisKeyPrefix = "tamil:words:letter:"
	// Cache TTL - 24 hours
	cacheTTL = 24 * time.Hour
	// Max words to cache per letter (top N by frequency)
	maxWordsPerLetter = 50000
	// Max rows to load from DB — set high enough to load full corpus (e.g. 227k+ tawiki titles)
	maxWordsLoadLimit = 500000
	// If load fails after retries, accept partial cache when we have at least this many words
	minWordsForPartialInit = 1000
	// Per-batch retries before advancing or giving up
	maxBatchRetries = 3
)

func NewCacheService(db *gorm.DB, redisURL string, loadOpts *CacheLoadOptions) *CacheService {
	cs := &CacheService{
		db:          db,
		memoryCache: make(map[string][]CachedWord),
		enabled:     false,
		initialized: false,
		loadBatchSize: 10000,
		loadLimit:     maxWordsLoadLimit,
		batchTimeout:  2 * time.Minute, // generous per-batch for cold/slow DB
	}
	if loadOpts != nil {
		if loadOpts.BatchSize > 0 {
			cs.loadBatchSize = loadOpts.BatchSize
		}
		if loadOpts.LoadLimit > 0 {
			cs.loadLimit = loadOpts.LoadLimit
		}
		if loadOpts.BatchTimeout > 0 {
			cs.batchTimeout = loadOpts.BatchTimeout
		}
	}

	// Initialize Redis if URL provided
	if redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err == nil {
			cs.redisClient = redis.NewClient(opt)
			// Test connection
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := cs.redisClient.Ping(ctx).Err(); err == nil {
				cs.enabled = true
				log.Printf("[TamilWordCache] Redis cache enabled ✓")
			} else {
				log.Printf("[TamilWordCache] Redis connection failed, using in-memory cache: %v", err)
			}
		} else {
			log.Printf("[TamilWordCache] Invalid Redis URL, using in-memory cache: %v", err)
		}
	} else {
		log.Printf("[TamilWordCache] Redis URL not configured, using in-memory cache")
	}

	return cs
}

// isRetryableDBError returns true for transient connection errors (e.g. pool exhausted, EOF, deadline exceeded).
func isRetryableDBError(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "EOF") ||
		strings.Contains(s, "connection reset") ||
		strings.Contains(s, "broken pipe") ||
		strings.Contains(s, "connection refused") ||
		strings.Contains(s, "max clients") ||
		strings.Contains(s, "MaxClientsInSessionMode") ||
		strings.Contains(s, "too many connections") ||
		strings.Contains(s, "deadline exceeded") ||
		strings.Contains(s, "context canceled")
}

// InitializeCache preloads Tamil words from database into cache (batched, with per-batch timeout).
// Uses per-batch retries so a single slow batch doesn't force a full restart. Accepts partial
// cache if load fails after retries but we have at least minWordsForPartialInit words.
// Organized by first letter of transliteration for fast prefix lookups.
func (cs *CacheService) InitializeCache(ctx context.Context) error {
	start := time.Now()
	batchSize := cs.loadBatchSize
	loadLimit := cs.loadLimit
	log.Printf("[TamilWordCache] Starting cache initialization (batch=%d limit=%d timeout=%v)...", batchSize, loadLimit, cs.batchTimeout)

	words := make([]models.TamilWord, 0, loadLimit)
	const maxAttempts = 3 // full-load retries (each attempt can make progress with per-batch retries)
	var loadErr error
	var lastFreq int
	var lastUC int
	var lastID uint
	firstBatch := true

	for attempt := 0; attempt < maxAttempts; attempt++ {
		for {
			// Per-batch retry: retry same batch up to maxBatchRetries before giving up this batch
			var batch []models.TamilWord
			var batchErr error
			for batchAttempt := 0; batchAttempt < maxBatchRetries; batchAttempt++ {
				batchCtx := ctx
				var cancel context.CancelFunc
				if cs.batchTimeout > 0 {
					batchCtx, cancel = context.WithTimeout(ctx, cs.batchTimeout)
				}
				q := cs.db.WithContext(batchCtx).
					Select("id, tamil_text, transliteration, frequency, category, user_confirmed").
					Order("frequency DESC, user_confirmed DESC, id")
				if !firstBatch {
					q = q.Where("(frequency, user_confirmed, id) < (?, ?, ?)", lastFreq, lastUC, lastID)
				}
				batch = nil
				batchErr = q.Limit(batchSize).Find(&batch).Error
				if cancel != nil {
					cancel()
				}
				if batchErr == nil {
					break
				}
				if !isRetryableDBError(batchErr) {
					break
				}
				backoff := time.Duration(batchAttempt+1) * 2 * time.Second
				log.Printf("[TamilWordCache] Batch failed (attempt %d/%d), retrying in %v: %v", batchAttempt+1, maxBatchRetries, backoff, batchErr)
				time.Sleep(backoff)
			}
			if batchErr != nil {
				loadErr = batchErr
				break
			}
			words = append(words, batch...)
			if len(batch) < batchSize {
				loadErr = nil
				break
			}
			last := batch[len(batch)-1]
			lastFreq, lastUC, lastID = last.Frequency, last.UserConfirmed, last.ID
			firstBatch = false
			if len(words) >= loadLimit {
				loadErr = nil
				break
			}
			if len(words)%20000 == 0 || len(words) < 20000 {
				log.Printf("[TamilWordCache] Loaded %d words so far...", len(words))
			}
		}
		if loadErr == nil {
			break
		}
		if !isRetryableDBError(loadErr) {
			break
		}
		// Full-load retry: restart from beginning after backoff
		backoff := time.Duration(attempt+1) * 3 * time.Second
		log.Printf("[TamilWordCache] Load failed (attempt %d/%d), retrying in %v: %v", attempt+1, maxAttempts, backoff, loadErr)
		words = words[:0]
		lastFreq, lastUC, lastID = 0, 0, 0
		firstBatch = true
		time.Sleep(backoff)
	}

	if loadErr != nil && len(words) < minWordsForPartialInit {
		return fmt.Errorf("failed to load words from database: %w", loadErr)
	}
	if loadErr != nil {
		log.Printf("[TamilWordCache] Using partial cache after load error: %v (words=%d)", loadErr, len(words))
	}

	log.Printf("[TamilWordCache] Loaded %d words from database", len(words))

	// Organize by first letter
	byLetter := make(map[string][]CachedWord)

	for _, word := range words {
		if word.Transliteration == "" {
			continue
		}

		firstLetter := strings.ToLower(string(word.Transliteration[0]))
		if len(firstLetter) == 0 {
			continue
		}

		// Calculate rank score (higher = better)
		rank := word.Frequency*100 + word.UserConfirmed*10

		cached := CachedWord{
			TamilText:       word.TamilText,
			Transliteration: word.Transliteration,
			Frequency:       word.Frequency,
			Category:        string(word.Category),
			UserConfirmed:   word.UserConfirmed,
			Rank:            rank,
		}

		byLetter[firstLetter] = append(byLetter[firstLetter], cached)
	}

	// Sort each letter's words by rank (descending) and limit
	for letter, words := range byLetter {
		// Sort by rank descending
		sort.Slice(words, func(i, j int) bool {
			return words[i].Rank > words[j].Rank
		})

		// Limit to top N words per letter
		if len(words) > maxWordsPerLetter {
			words = words[:maxWordsPerLetter]
		}

		byLetter[letter] = words
	}

	// Store in Redis if enabled
	if cs.enabled {
		pipe := cs.redisClient.Pipeline()
		keysToSet := 0

		for letter, words := range byLetter {
			key := redisKeyPrefix + letter
			data, err := json.Marshal(words)
			if err != nil {
				log.Printf("[TamilWordCache] Error marshaling words for letter %s: %v", letter, err)
				continue
			}
			pipe.Set(ctx, key, data, cacheTTL)
			keysToSet++
		}

		// Execute pipeline
		_, err := pipe.Exec(ctx)
		if err != nil {
			log.Printf("[TamilWordCache] Error storing in Redis: %v (falling back to memory)", err)
			cs.enabled = false
		} else {
			log.Printf("[TamilWordCache] Stored %d letters in Redis cache", keysToSet)
		}
	}

	// Store in memory cache (always, as fallback)
	cs.memoryMu.Lock()
	cs.memoryCache = byLetter
	cs.memoryMu.Unlock()

	cs.initialized = true
	elapsed := time.Since(start)
	log.Printf("[TamilWordCache] Cache initialization complete in %v (letters: %d)", elapsed, len(byLetter))

	return nil
}

// GetSuggestions returns top N Tamil words matching the query prefix
// Response time target: < 70ms
func (cs *CacheService) GetSuggestions(ctx context.Context, query string, limit int) ([]CachedWord, error) {
	if !cs.initialized {
		// Lazy initialization if not done yet
		if err := cs.InitializeCache(ctx); err != nil {
			return nil, err
		}
	}

	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return []CachedWord{}, nil
	}

	// Get first letter
	firstLetter := string(query[0])
	if len(firstLetter) == 0 {
		return []CachedWord{}, nil
	}

	start := time.Now()
	var words []CachedWord

	// Try Redis first if enabled
	if cs.enabled {
		key := redisKeyPrefix + firstLetter
		data, err := cs.redisClient.Get(ctx, key).Result()
		if err == nil {
			if err := json.Unmarshal([]byte(data), &words); err == nil {
				// Filter by prefix and return top N
				result := cs.filterAndRank(words, query, limit)
				elapsed := time.Since(start)
				if elapsed > 50*time.Millisecond {
					log.Printf("[TamilWordCache] Slow Redis lookup: %v (query: %s)", elapsed, query)
				}
				return result, nil
			}
		}
		// Redis miss or error - fall back to memory
	}

	// Fall back to memory cache
	cs.memoryMu.RLock()
	words, exists := cs.memoryCache[firstLetter]
	cs.memoryMu.RUnlock()

	if !exists {
		return []CachedWord{}, nil
	}

	// Filter by prefix and return top N
	result := cs.filterAndRank(words, query, limit)
	elapsed := time.Since(start)
	if elapsed > 50*time.Millisecond {
		log.Printf("[TamilWordCache] Slow memory lookup: %v (query: %s)", elapsed, query)
	}

	return result, nil
}

// filterAndRank filters words by prefix and returns top N ranked words
func (cs *CacheService) filterAndRank(words []CachedWord, query string, limit int) []CachedWord {
	queryLower := strings.ToLower(query)
	var matches []CachedWord

	for _, word := range words {
		translitLower := strings.ToLower(word.Transliteration)
		if strings.HasPrefix(translitLower, queryLower) {
			matches = append(matches, word)
		}
	}

	// Sort by rank (already sorted, but re-sort to prioritize exact matches)
	sort.Slice(matches, func(i, j int) bool {
		// Exact match gets highest priority
		if matches[i].Transliteration == query {
			return true
		}
		if matches[j].Transliteration == query {
			return false
		}
		// Then by rank
		return matches[i].Rank > matches[j].Rank
	})

	// Return top N
	if len(matches) > limit {
		return matches[:limit]
	}
	return matches
}

// RefreshCache reloads cache from database (call periodically or on data updates)
func (cs *CacheService) RefreshCache(ctx context.Context) error {
	return cs.InitializeCache(ctx)
}

// Close closes Redis connection if enabled
func (cs *CacheService) Close() error {
	if cs.redisClient != nil {
		return cs.redisClient.Close()
	}
	return nil
}

// GetCacheStats returns cache statistics
func (cs *CacheService) GetCacheStats() map[string]interface{} {
	cs.memoryMu.RLock()
	defer cs.memoryMu.RUnlock()

	totalWords := 0
	for _, words := range cs.memoryCache {
		totalWords += len(words)
	}

	return map[string]interface{}{
		"initialized":   cs.initialized,
		"redis_enabled": cs.enabled,
		"letters_cached": len(cs.memoryCache),
		"total_words":   totalWords,
	}
}
