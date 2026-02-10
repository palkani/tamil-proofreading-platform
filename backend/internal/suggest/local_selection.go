package suggest

import "sync"

// LocalSelectionStore is an in-memory store for suggest personalization (user/global selection counts).
// Used when Redis is not configured; provides per-instance personalization without Redis.
type LocalSelectionStore struct {
	mu   sync.RWMutex
	data map[string]map[string]float64 // key -> member -> score
}

// NewLocalSelectionStore creates an in-memory selection store.
func NewLocalSelectionStore() *LocalSelectionStore {
	return &LocalSelectionStore{
		data: make(map[string]map[string]float64),
	}
}

func (s *LocalSelectionStore) keyUserSel(uid string) string   { return "u:" + uid + ":sel" }
func (s *LocalSelectionStore) keyUserPref(uid, norm string) string { return "u:" + uid + ":p:" + norm }
func (s *LocalSelectionStore) keyGlobal() string            { return "g:sel" }

// Record records a selection: increments user selection, user prefix preference, and global selection.
func (s *LocalSelectionStore) Record(uid, prefixNorm, member string) {
	if uid == "" || member == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	inc := func(key string) {
		if s.data[key] == nil {
			s.data[key] = make(map[string]float64)
		}
		s.data[key][member]++
	}
	inc(s.keyUserSel(uid))
	if prefixNorm != "" {
		inc(s.keyUserPref(uid, prefixNorm))
	}
	inc(s.keyGlobal())
}

// GetScores returns user selection scores, user prefix scores, and global scores for the given member IDs.
// Keys in the returned maps are member strings (e.g. "123"); values are counts.
func (s *LocalSelectionStore) GetScores(uid, prefixNorm string, memberIDs []string) (userSel, userPref, globalSel map[string]float64) {
	userSel = make(map[string]float64, len(memberIDs))
	userPref = make(map[string]float64, len(memberIDs))
	globalSel = make(map[string]float64, len(memberIDs))
	if len(memberIDs) == 0 {
		return userSel, userPref, globalSel
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	kSel := s.keyUserSel(uid)
	kPref := s.keyUserPref(uid, prefixNorm)
	kGlobal := s.keyGlobal()
	for _, m := range memberIDs {
		if set := s.data[kSel]; set != nil {
			if v := set[m]; v > 0 {
				userSel[m] = v
			}
		}
		if set := s.data[kPref]; set != nil {
			if v := set[m]; v > 0 {
				userPref[m] = v
			}
		}
		if set := s.data[kGlobal]; set != nil {
			if v := set[m]; v > 0 {
				globalSel[m] = v
			}
		}
	}
	return userSel, userPref, globalSel
}
