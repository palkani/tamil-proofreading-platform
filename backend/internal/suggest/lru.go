package suggest

import (
	"container/list"
	"sync"
	"time"
)

type LRUCache[T any] struct {
	mu       sync.Mutex
	capacity int
	ttl      time.Duration
	items    map[string]*list.Element
	order    *list.List
}

type cacheEntry[T any] struct {
	key   string
	value T
	ts    time.Time
}

func NewLRUCache[T any](capacity int, ttl time.Duration) *LRUCache[T] {
	if capacity < 10 {
		capacity = 10
	}
	if ttl <= 0 {
		ttl = 2 * time.Minute
	}
	return &LRUCache[T]{
		capacity: capacity,
		ttl:      ttl,
		items:    make(map[string]*list.Element),
		order:    list.New(),
	}
}

func (c *LRUCache[T]) Get(key string) (T, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	var zero T
	el, ok := c.items[key]
	if !ok {
		return zero, false
	}
	entry := el.Value.(*cacheEntry[T])
	if time.Since(entry.ts) > c.ttl {
		c.order.Remove(el)
		delete(c.items, key)
		return zero, false
	}
	c.order.MoveToFront(el)
	return entry.value, true
}

func (c *LRUCache[T]) Set(key string, value T) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if el, ok := c.items[key]; ok {
		entry := el.Value.(*cacheEntry[T])
		entry.value = value
		entry.ts = time.Now()
		c.order.MoveToFront(el)
		return
	}
	entry := &cacheEntry[T]{key: key, value: value, ts: time.Now()}
	el := c.order.PushFront(entry)
	c.items[key] = el
	if c.order.Len() > c.capacity {
		oldest := c.order.Back()
		if oldest != nil {
			c.order.Remove(oldest)
			delete(c.items, oldest.Value.(*cacheEntry[T]).key)
		}
	}
}

