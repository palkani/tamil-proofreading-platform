package ime

import (
	"context"
	"database/sql"
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
	client       *Client
	cache        *Cache
	freq         freqDict
	db           *sql.DB // Database connection for corpus queries
	basePath     string
	enabled      bool
	cacheEnabled bool
}

// NewService creates IME service with optional database for corpus queries.
// Pass nil for db if corpus queries are not needed (will fallback to Aksharamukha only).
func NewService(basePath, aksharaURL string, enabled bool, cacheEnabled bool) *Service {
	return NewServiceWithDB(basePath, aksharaURL, nil, enabled, cacheEnabled)
}

// NewServiceWithDB creates IME service with database connection for corpus-first architecture.
func NewServiceWithDB(basePath, aksharaURL string, db *sql.DB, enabled bool, cacheEnabled bool) *Service {
	var cache *Cache
	if cacheEnabled {
		cache = NewCache(10 * time.Minute)
	}
	return &Service{
		client:       NewClient(aksharaURL),
		cache:        cache,
		freq:         loadFreqDict(basePath),
		db:           db,
		basePath:     basePath,
		enabled:      enabled,
		cacheEnabled: cacheEnabled,
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
// Architecture: Corpus-first, then Aksharamukha fallback.
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

	// Check cache first
	if s.cacheEnabled && s.cache != nil {
		if cached, ok := s.cache.Get(s.key(mode, q, limit)); ok {
			meta["cache"] = "hit"
			meta["latency_ms"] = time.Since(start).Milliseconds()
			meta["engine"] = "cache"
			return cached, meta
		}
	}
	meta["cache"] = "miss"

	// ========== NEW: CORPUS-FIRST ARCHITECTURE ==========
	// Step 1: Try corpus database first (fast, accurate, verified words)
	var corpusCands []Candidate
	var corpusErr error

	// Try phrase match first (if input has spaces)
	if strings.Contains(q, " ") {
		phraseCands, phraseErr := s.queryCorpusPhrases(ctx, q, mode, limit)
		if phraseErr == nil && len(phraseCands) > 0 {
			log.Printf("[IME] Corpus PHRASE hit: q=%q mode=%s count=%d", q, mode, len(phraseCands))
			meta["engine"] = "corpus_phrase"
			meta["latency_ms"] = time.Since(start).Milliseconds()
			if s.cacheEnabled && s.cache != nil {
				s.cache.Set(s.key(mode, q, limit), phraseCands)
			}
			return phraseCands, meta
		}
	}

	// Try word match
	corpusCands, corpusErr = s.queryCorpus(ctx, q, mode, limit)
	if corpusErr == nil && len(corpusCands) > 0 {
		// Corpus hit! Return immediately (no need to call Aksharamukha)
		log.Printf("[IME] Corpus WORD hit: q=%q mode=%s count=%d latency=%dms", 
			q, mode, len(corpusCands), time.Since(start).Milliseconds())
		meta["engine"] = "corpus"
		meta["latency_ms"] = time.Since(start).Milliseconds()
		
		// Cache the corpus results
		if s.cacheEnabled && s.cache != nil {
			s.cache.Set(s.key(mode, q, limit), corpusCands)
		}
		return corpusCands, meta
	}

	// Step 2: Corpus miss - fallback to Aksharamukha API
	log.Printf("[IME] Corpus miss for q=%q mode=%s, falling back to Aksharamukha", q, mode)
	// ========== END CORPUS-FIRST ARCHITECTURE ==========

	// Call transliterator in two ways:
	// - raw token (best when the backend already understands the token)
	// - phonetic-normalized token (helps Aksharamukha for some inputs)
	// Merge results for better coverage.
	rawWords, rawErr := s.client.Transliterate(ctx, q, mode, limit)
	phonetic := normalizePhonetic(q)
	var phonWords []string
	var phonErr error
	if phonetic != q {
		phonWords, phonErr = s.client.Transliterate(ctx, phonetic, mode, limit)
	}

	if rawErr != nil && phonErr != nil {
		log.Printf("[AKSHARA] request_id=%v q=%q raw_err=%v phon_err=%v", ctx.Value("request_id"), q, rawErr, phonErr)
		meta["engine"] = "aksharamukha_error"
		meta["latency_ms"] = time.Since(start).Milliseconds()
		return []Candidate{}, meta
	}

	words := make([]string, 0, len(rawWords)+len(phonWords))
	words = append(words, rawWords...)
	words = append(words, phonWords...)

	reqID := ctx.Value("request_id")
	cands = s.rankCandidates(words, q, limit, reqID)

	meta["engine"] = "aksharamukha_fallback"
	if s.cacheEnabled && s.cache != nil {
		s.cache.Set(s.key(mode, q, limit), cands)
	}
	meta["latency_ms"] = time.Since(start).Milliseconds()
	return cands, meta
}

func (s *Service) rankCandidates(words []string, original string, limit int, reqID interface{}) []Candidate {
	cands := []Candidate{}
	if len(words) == 0 {
		return cands
	}
	seen := make(map[string]float64)

	add := func(word string, score float64, reason string) {
		word = strings.TrimSpace(word)
		if word == "" || !tamilRegex.MatchString(word) {
			return
		}
		if prev, ok := seen[word]; ok && prev >= score {
			return
		}
		seen[word] = score
		cands = append(cands, Candidate{
			Word:       word,
			Score:      score,
			Source:     "aksharamukha",
			RankReason: reason,
		})
	}

	// base candidates
	for _, w := range words {
		add(w, 1.0, "base=1.0")
	}

	// common fixes
	common := map[string]string{
		"enathu":  "எனது",
		"enadu":   "எனது",
		"en":      "என்",
		"ena":     "என",
		"enbathu": "என்பது",
	}
	lower := strings.ToLower(strings.ReplaceAll(original, " ", ""))
	if fixed, ok := common[lower]; ok {
		add(fixed, 0.9, "common_map")
	}

	// punctuation and collapsed variants
	for _, w := range words {
		if strings.ContainsAny(original, ".!?") && !strings.HasSuffix(w, ".") {
			add(w+"...", 0.85, "punctuation_variant")
		}
		if strings.Contains(w, " ") {
			add(strings.ReplaceAll(w, " ", ""), 0.8, "collapsed_variant")
		}
	}

	log.Printf("[RANK] request_id=%v candidates_before=%d after_dedupe=%d returning=%d", reqID, len(words), len(seen), len(cands))

	sort.Slice(cands, func(i, j int) bool {
		return cands[i].Score > cands[j].Score
	})
	if len(cands) > limit {
		cands = cands[:limit]
	}
	return cands
}
