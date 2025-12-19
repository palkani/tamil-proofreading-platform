package ime

import (
	"sync"
	"time"
)

type cacheEntry struct {
	value      []Candidate
	expiration time.Time
}

type Cache struct {
	mu    sync.Mutex
	data  map[string]cacheEntry
	ttl   time.Duration
	clock func() time.Time
}

func NewCache(ttl time.Duration) *Cache {
	return &Cache{
		data:  make(map[string]cacheEntry),
		ttl:   ttl,
		clock: time.Now,
	}
}

func (c *Cache) Get(key string) (hits []Candidate, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.data == nil {
		return nil, false
	}
	entry, exists := c.data[key]
	if !exists || c.clock().After(entry.expiration) {
		if exists {
			delete(c.data, key)
		}
		return nil, false
	}
	return entry.value, true
}

func (c *Cache) Set(key string, value []Candidate) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.data == nil {
		c.data = make(map[string]cacheEntry)
	}
	c.data[key] = cacheEntry{
		value:      value,
		expiration: c.clock().Add(c.ttl),
	}
}
