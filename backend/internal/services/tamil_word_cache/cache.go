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

type CacheService struct {
	db          *gorm.DB
	redisClient *redis.Client
	enabled     bool
	// In-memory cache as fallback (organized by first letter)
	memoryCache map[string][]CachedWord
	memoryMu    sync.RWMutex
	initialized bool
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
	maxWordsPerLetter = 10000
	// Max rows to load from DB (avoids statement timeout on large tables)
	maxWordsLoadLimit = 100000
)

func NewCacheService(db *gorm.DB, redisURL string) *CacheService {
	cs := &CacheService{
		db:          db,
		memoryCache: make(map[string][]CachedWord),
		enabled:     false,
		initialized: false,
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

// InitializeCache preloads Tamil words from database into cache
// Organized by first letter of transliteration for fast prefix lookups
func (cs *CacheService) InitializeCache(ctx context.Context) error {
	start := time.Now()
	log.Printf("[TamilWordCache] Starting cache initialization...")

	var words []models.TamilWord
	// Read-only load: avoid Transaction so we don't hit 25P02 (aborted transaction) if
	// SET LOCAL fails on managed Postgres (e.g. Supabase). Limit keeps the query bounded.
	err := cs.db.WithContext(ctx).
		Select("tamil_text, transliteration, frequency, category, user_confirmed").
		Order("frequency DESC, user_confirmed DESC").
		Limit(maxWordsLoadLimit).
		Find(&words).Error
	if err != nil {
		return fmt.Errorf("failed to load words from database: %w", err)
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
