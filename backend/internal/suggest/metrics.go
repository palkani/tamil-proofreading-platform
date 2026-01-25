package suggest

import (
	"sort"
	"sync"
)

type LatencyMetrics struct {
	mu       sync.Mutex
	values   []float64
	capacity int
	idx      int
	filled   bool
}

func NewLatencyMetrics(capacity int) *LatencyMetrics {
	if capacity < 100 {
		capacity = 100
	}
	return &LatencyMetrics{
		values:   make([]float64, capacity),
		capacity: capacity,
	}
}

func (m *LatencyMetrics) Add(ms float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.values[m.idx] = ms
	m.idx++
	if m.idx >= m.capacity {
		m.idx = 0
		m.filled = true
	}
}

func (m *LatencyMetrics) Snapshot() (p50, p95 float64, count int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	size := m.idx
	if m.filled {
		size = m.capacity
	}
	if size == 0 {
		return 0, 0, 0
	}
	cp := make([]float64, size)
	copy(cp, m.values[:size])
	sort.Float64s(cp)
	p50 = cp[int(float64(size-1)*0.50)]
	p95 = cp[int(float64(size-1)*0.95)]
	return p50, p95, size
}

