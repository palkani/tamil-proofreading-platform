package ime

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"
)

var tamilRegex = regexp.MustCompile("^[\u0B80-\u0BFF\\s]+$")
var latinRegex = regexp.MustCompile("^[A-Za-z\\s]+$")

type Service struct {
	client   *Client
	cache    *Cache
	freq     freqDict
	basePath string
	enabled  bool
}

func NewService(basePath, aksharaURL string, enabled bool) *Service {
	return &Service{
		client:   NewClient(aksharaURL),
		cache:    NewCache(6 * time.Hour),
		freq:     loadFreqDict(basePath),
		basePath: basePath,
		enabled:  enabled,
	}
}

func (s *Service) key(mode string, q string, limit int) string {
	return mode + ":" + q + ":" + strconvI(limit)
}

func strconvI(i int) string {
	return fmt.Sprintf("%d", i)
}

// normalizePhonetic splits latin input into simple CV-ish units to aid Aksharamukha.
func normalizePhonetic(q string) string {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return q
	}
	vowels := "aeiou"
	var parts []string
	var curr strings.Builder
	for i := 0; i < len(q); i++ {
		ch := q[i]
		curr.WriteByte(ch)
		// break after vowel
		if strings.ContainsRune(vowels, rune(ch)) {
			parts = append(parts, curr.String())
			curr.Reset()
		}
	}
	if curr.Len() > 0 {
		parts = append(parts, curr.String())
	}
	return strings.Join(parts, " ")
}

// Suggest returns ranked candidates; never errors.
func (s *Service) Suggest(ctx context.Context, q, mode string, limit int) (cands []Candidate, meta map[string]interface{}) {
	start := time.Now()
	meta = map[string]interface{}{
		"engine":     "aksharamukha",
		"cache":      "miss",
		"latency_ms": 0,
	}

	if limit < 1 {
		limit = 8
	}
	if limit > 12 {
		limit = 12
	}
	q = strings.TrimSpace(q)
	if !latinRegex.MatchString(q) || len(q) == 0 {
		return []Candidate{}, meta
	}

	if !s.enabled || s.client == nil || s.client.BaseURL == "" {
		meta["engine"] = "disabled"
		return []Candidate{}, meta
	}

	if cached, ok := s.cache.Get(s.key(mode, q, limit)); ok {
		meta["cache"] = "hit"
		meta["latency_ms"] = time.Since(start).Milliseconds()
		return cached, meta
	}

	phonetic := normalizePhonetic(q)
	words, err := s.client.Transliterate(ctx, phonetic, mode)
	if err != nil {
		log.Printf("[IME] aksharamukha error q=%q err=%v", q, err)
		meta["engine"] = "aksharamukha_error"
		meta["latency_ms"] = time.Since(start).Milliseconds()
		return []Candidate{}, meta
	}

	seen := make(map[string]bool)
	for _, w := range words {
		w = strings.TrimSpace(w)
		if w == "" || !tamilRegex.MatchString(w) || seen[w] {
			continue
		}
		seen[w] = true
		base := 0.75
		freqScore := s.freq.Score(w)
		final := 0.65*base + 0.35*freqScore
		cands = append(cands, Candidate{
			Word:       w,
			Score:      final,
			Source:     "aksharamukha",
			RankReason: strings.TrimSpace(fmt.Sprintf("base=%.2f freq=%.2f final=%.2f", base, freqScore, final)),
		})
	}

	sort.Slice(cands, func(i, j int) bool {
		return cands[i].Score > cands[j].Score
	})
	if len(cands) > limit {
		cands = cands[:limit]
	}
	s.cache.Set(s.key(mode, q, limit), cands)
	meta["latency_ms"] = time.Since(start).Milliseconds()
	return cands, meta
}
