package suggest

import (
	"context"
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisClient struct {
	client *redis.Client
	enabled bool
}

func NewRedisClient(url string) *RedisClient {
	url = strings.TrimSpace(url)
	if url == "" {
		return &RedisClient{enabled: false}
	}
	opt, err := redis.ParseURL(url)
	if err != nil {
		return &RedisClient{enabled: false}
	}
	c := redis.NewClient(opt)
	return &RedisClient{client: c, enabled: true}
}

func (r *RedisClient) Enabled() bool {
	return r != nil && r.enabled
}

func (r *RedisClient) Close() {
	if r != nil && r.client != nil {
		_ = r.client.Close()
	}
}

func (r *RedisClient) ZIncrBy(ctx context.Context, key, member string, by float64) {
	if !r.Enabled() {
		return
	}
	_ = r.client.ZIncrBy(ctx, key, by, member).Err()
}

func (r *RedisClient) ZMScore(ctx context.Context, key string, members []string) map[string]float64 {
	out := make(map[string]float64, len(members))
	if !r.Enabled() || len(members) == 0 {
		return out
	}
	res, err := r.client.ZMScore(ctx, key, members...).Result()
	if err != nil {
		return out
	}
	for i, m := range members {
		if i >= len(res) {
			continue
		}
		if math.IsNaN(res[i]) {
			continue
		}
		out[m] = res[i]
	}
	return out
}

func (r *RedisClient) WithTimeout(ctx context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		timeout = 25 * time.Millisecond
	}
	return context.WithTimeout(ctx, timeout)
}

func idToMember(id int32) string {
	return strconv.Itoa(int(id))
}

// Lexicon cache keys
const (
	lexiconDataKey    = "sg:lexicon:data"
	lexiconVersionKey = "sg:lexicon:version"
	lexiconCountKey   = "sg:lexicon:count"
)

// CacheLexiconRows stores all lexicon rows in Redis as JSON.
// This allows fast loading without querying PostgreSQL.
func (r *RedisClient) CacheLexiconRows(ctx context.Context, rows []LexiconRow, version string) error {
	if !r.Enabled() {
		return nil
	}
	
	// Serialize rows to JSON
	data, err := json.Marshal(rows)
	if err != nil {
		return err
	}
	
	// Use pipeline for atomic updates
	pipe := r.client.Pipeline()
	pipe.Set(ctx, lexiconDataKey, data, 0) // No expiration - manual invalidation
	pipe.Set(ctx, lexiconVersionKey, version, 0)
	pipe.Set(ctx, lexiconCountKey, len(rows), 0)
	
	_, err = pipe.Exec(ctx)
	return err
}

// LoadLexiconRowsFromCache loads lexicon rows from Redis cache.
// Returns (rows, version, count, found, error)
func (r *RedisClient) LoadLexiconRowsFromCache(ctx context.Context) ([]LexiconRow, string, int, bool, error) {
	if !r.Enabled() {
		return nil, "", 0, false, nil
	}
	
	// Check if cache exists
	exists, err := r.client.Exists(ctx, lexiconDataKey, lexiconVersionKey, lexiconCountKey).Result()
	if err != nil || exists == 0 {
		return nil, "", 0, false, err
	}
	
	// Load data
	data, err := r.client.Get(ctx, lexiconDataKey).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, "", 0, false, nil
		}
		return nil, "", 0, false, err
	}
	
	// Load version
	version, err := r.client.Get(ctx, lexiconVersionKey).Result()
	if err != nil {
		return nil, "", 0, false, err
	}
	
	// Load count
	countStr, err := r.client.Get(ctx, lexiconCountKey).Result()
	if err != nil {
		return nil, "", 0, false, err
	}
	count, _ := strconv.Atoi(countStr)
	
	// Deserialize rows
	var rows []LexiconRow
	if err := json.Unmarshal([]byte(data), &rows); err != nil {
		return nil, "", 0, false, err
	}
	
	return rows, version, count, true, nil
}

// InvalidateLexiconCache clears the lexicon cache from Redis.
func (r *RedisClient) InvalidateLexiconCache(ctx context.Context) error {
	if !r.Enabled() {
		return nil
	}
	_, err := r.client.Del(ctx, lexiconDataKey, lexiconVersionKey, lexiconCountKey).Result()
	return err
}

// GetLexiconCacheInfo returns cache metadata (version, count) if cache exists.
func (r *RedisClient) GetLexiconCacheInfo(ctx context.Context) (version string, count int, exists bool) {
	if !r.Enabled() {
		return "", 0, false
	}
	
	existsKey, err := r.client.Exists(ctx, lexiconDataKey).Result()
	if err != nil || existsKey == 0 {
		return "", 0, false
	}
	
	version, _ = r.client.Get(ctx, lexiconVersionKey).Result()
	countStr, _ := r.client.Get(ctx, lexiconCountKey).Result()
	count, _ = strconv.Atoi(countStr)
	
	return version, count, true
}

