package handlers

import "sync"

type submissionEvent struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

type submissionBroadcaster struct {
	mu      sync.RWMutex
	clients map[chan submissionEvent]struct{}
}

func newSubmissionBroadcaster() *submissionBroadcaster {
	return &submissionBroadcaster{
		clients: make(map[chan submissionEvent]struct{}),
	}
}

func (b *submissionBroadcaster) addListener() (chan submissionEvent, func()) {
	ch := make(chan submissionEvent, 8)

	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()

	return ch, func() {
		b.mu.Lock()
		if _, ok := b.clients[ch]; ok {
			delete(b.clients, ch)
			close(ch)
		}
		b.mu.Unlock()
	}
}

func (b *submissionBroadcaster) broadcast(event submissionEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for ch := range b.clients {
		select {
		case ch <- event:
		default:
			// drop if slow consumer
		}
	}
}

func (b *submissionBroadcaster) closeAll() {
	b.mu.Lock()
	defer b.mu.Unlock()

	for ch := range b.clients {
		close(ch)
		delete(b.clients, ch)
	}
}

type submissionStreamHub struct {
	mu      sync.RWMutex
	streams map[uint]*submissionBroadcaster
}

func newSubmissionStreamHub() *submissionStreamHub {
	return &submissionStreamHub{
		streams: make(map[uint]*submissionBroadcaster),
	}
}

func (h *submissionStreamHub) register(submissionID uint) (chan submissionEvent, func()) {
	h.mu.Lock()
	broadcaster, ok := h.streams[submissionID]
	if !ok {
		broadcaster = newSubmissionBroadcaster()
		h.streams[submissionID] = broadcaster
	}
	h.mu.Unlock()

	listener, cancel := broadcaster.addListener()
	unsubscribe := func() {
		cancel()

		h.mu.Lock()
		if len(broadcaster.clients) == 0 {
			delete(h.streams, submissionID)
		}
		h.mu.Unlock()
	}

	return listener, unsubscribe
}

func (h *submissionStreamHub) broadcast(submissionID uint, event submissionEvent) {
	h.mu.RLock()
	broadcaster, ok := h.streams[submissionID]
	h.mu.RUnlock()
	if !ok {
		return
	}

	broadcaster.broadcast(event)
}

func (h *submissionStreamHub) close(submissionID uint) {
	h.mu.Lock()
	broadcaster, ok := h.streams[submissionID]
	if ok {
		delete(h.streams, submissionID)
	}
	h.mu.Unlock()

	if ok {
		broadcaster.closeAll()
	}
}
