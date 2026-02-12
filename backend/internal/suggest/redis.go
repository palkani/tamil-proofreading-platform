package suggest

import (
	"context"
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