package middleware

import (
	"hash/fnv"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

// ShardedRateLimiter uses sharded locks for better concurrency with 1000+ users
// Instead of one global mutex, we use 64 shards to reduce lock contention
const numShards = 64

type shard struct {
	mu       sync.RWMutex
	requests map[string][]time.Time
}

type ShardedRateLimiter struct {
	shards   [numShards]*shard
	limit    int
	window   time.Duration
	hitCount atomic.Uint64 // For monitoring
	missCount atomic.Uint64
}

func NewRateLimiter(limit int, window time.Duration) *ShardedRateLimiter {
	rl := &ShardedRateLimiter{
		limit:  limit,
		window: window,
	}

	for i := 0; i < numShards; i++ {
		rl.shards[i] = &shard{
			requests: make(map[string][]time.Time),
		}
	}

	// Clean up old entries periodically
	go rl.cleanup()

	return rl
}

func (rl *ShardedRateLimiter) getShard(key string) *shard {
	h := fnv.New32a()
	h.Write([]byte(key))
	return rl.shards[h.Sum32()%numShards]
}

func (rl *ShardedRateLimiter) cleanup() {
	ticker := time.NewTicker(30 * time.Second) // More frequent cleanup for high traffic
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		for i := 0; i < numShards; i++ {
			s := rl.shards[i]
			s.mu.Lock()
			for key, timestamps := range s.requests {
				filtered := make([]time.Time, 0, len(timestamps))
				for _, ts := range timestamps {
					if now.Sub(ts) < rl.window {
						filtered = append(filtered, ts)
					}
				}
				if len(filtered) == 0 {
					delete(s.requests, key)
				} else {
					s.requests[key] = filtered
				}
			}
			s.mu.Unlock()
		}
	}
}

func (rl *ShardedRateLimiter) Allow(key string) bool {
	s := rl.getShard(key)
	now := time.Now()

	s.mu.Lock()
	defer s.mu.Unlock()

	timestamps := s.requests[key]

	// Remove old timestamps - preallocate for efficiency
	filtered := make([]time.Time, 0, len(timestamps))
	for _, ts := range timestamps {
		if now.Sub(ts) < rl.window {
			filtered = append(filtered, ts)
		}
	}

	if len(filtered) >= rl.limit {
		rl.missCount.Add(1)
		return false
	}

	filtered = append(filtered, now)
	s.requests[key] = filtered
	rl.hitCount.Add(1)
	return true
}

// Stats returns hit/miss counts for monitoring
func (rl *ShardedRateLimiter) Stats() (hits, misses uint64) {
	return rl.hitCount.Load(), rl.missCount.Load()
}

func RateLimitMiddleware(limit int, window time.Duration) gin.HandlerFunc {
	limiter := NewRateLimiter(limit, window)

	return func(c *gin.Context) {
		key := c.ClientIP()
		if userID, exists := c.Get("user_id"); exists {
			if id, ok := userID.(uint); ok && id > 0 {
				key = key + ":" + strconv.FormatUint(uint64(id), 10)
			}
		}

		if !limiter.Allow(key) {
			// Add Retry-After header for better client handling
			c.Header("Retry-After", strconv.FormatInt(int64(window.Seconds()), 10))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Rate limit exceeded. Please try again later.",
				"retry_after": int(window.Seconds()),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
