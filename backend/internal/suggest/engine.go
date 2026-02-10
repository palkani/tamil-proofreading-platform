package suggest

import (
	"context"
	"errors"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"gorm.io/gorm"
)

type Engine struct {
	db            *gorm.DB
	cache         *LRUCache[*SuggestResponse]
	metrics       *LatencyMetrics
	redis         *RedisClient
	localSel      *LocalSelectionStore // in-memory personalization when Redis is disabled
	minLen        int
	limitDefault  int
	maxTopPerNode int
	refreshSec    int
	vowelCollapse bool
	redisTimeout  time.Duration

	data atomic.Value // *SuggestData
}

type SuggestRequest struct {
	Query string
	UID   string
	Limit int
}

type SuggestResponse struct {
	Success     bool                   `json:"success"`
	Q           string                 `json:"q"`
	Normalized  string                 `json:"normalized"`
	Suggestions []Suggestion           `json:"suggestions"`
	Source      string                 `json:"source"`
	Timing      map[string]float64     `json:"timing"`
	Meta        map[string]interface{} `json:"meta"`
}

type Suggestion struct {
	ID    int32   `json:"id"`
	Text  string  `json:"text"`
	Latin string  `json:"latin"`
	Score float64 `json:"score"`
}

type scoredEntry struct {
	id    int32
	score float64
}

type EngineOptions struct {
	MinLen         int
	LimitDefault   int
	MaxTopPerNode  int
	CacheEntries   int
	CacheTTL       time.Duration
	RefreshSec     int
	VowelCollapse  bool
	RedisURL       string
	RedisTimeoutMs int
}

func NewEngine(db *gorm.DB, opts EngineOptions) (*Engine, error) {
	if opts.MinLen < 1 {
		opts.MinLen = 2
	}
	if opts.LimitDefault <= 0 {
		opts.LimitDefault = 5
	}
	if opts.MaxTopPerNode <= 0 {
		opts.MaxTopPerNode = 15
	}
	if opts.CacheEntries <= 0 {
		opts.CacheEntries = 3000 // LRU response cache for lower latency
	}
	if opts.CacheTTL <= 0 {
		opts.CacheTTL = 5 * time.Minute // Extended TTL for better hit rate
	}
	if opts.RedisTimeoutMs <= 0 {
		opts.RedisTimeoutMs = 15 // OPTIMIZED: Reduced from 25ms for faster response
	}

	redisClient := NewRedisClient(opts.RedisURL)
	e := &Engine{
		db:            db,
		cache:         NewLRUCache[*SuggestResponse](opts.CacheEntries, opts.CacheTTL),
		metrics:       NewLatencyMetrics(1000),
		redis:         redisClient,
		localSel:      nil,
		minLen:        opts.MinLen,
		limitDefault:  opts.LimitDefault,
		maxTopPerNode: opts.MaxTopPerNode,
		refreshSec:    opts.RefreshSec,
		vowelCollapse: opts.VowelCollapse,
		redisTimeout:  time.Duration(opts.RedisTimeoutMs) * time.Millisecond,
	}
	if redisClient == nil || !redisClient.Enabled() {
		e.localSel = NewLocalSelectionStore()
	}

	if err := e.reload(context.Background()); err != nil {
		return nil, err
	}
	if e.refreshSec > 0 {
		go e.refreshLoop()
	}
	return e, nil
}

// NewEngineWithEmptyData creates an engine with empty lexicon and starts a background reload.
// The engine is usable immediately (returns empty suggestions); once reload completes, suggestions are populated.
// Use this so the API never returns source "disabled" (engine is never nil).
func NewEngineWithEmptyData(db *gorm.DB, opts EngineOptions) *Engine {
	if opts.MinLen < 1 {
		opts.MinLen = 2
	}
	if opts.LimitDefault <= 0 {
		opts.LimitDefault = 5
	}
	if opts.MaxTopPerNode <= 0 {
		opts.MaxTopPerNode = 15
	}
	if opts.CacheEntries <= 0 {
		opts.CacheEntries = 3000
	}
	if opts.CacheTTL <= 0 {
		opts.CacheTTL = 5 * time.Minute
	}
	if opts.RedisTimeoutMs <= 0 {
		opts.RedisTimeoutMs = 15
	}
	redisClient := NewRedisClient(opts.RedisURL)
	e := &Engine{
		db:            db,
		cache:         NewLRUCache[*SuggestResponse](opts.CacheEntries, opts.CacheTTL),
		metrics:       NewLatencyMetrics(1000),
		redis:         redisClient,
		localSel:      nil,
		minLen:        opts.MinLen,
		limitDefault:  opts.LimitDefault,
		maxTopPerNode: opts.MaxTopPerNode,
		refreshSec:    opts.RefreshSec,
		vowelCollapse: opts.VowelCollapse,
		redisTimeout:  time.Duration(opts.RedisTimeoutMs) * time.Millisecond,
	}
	if redisClient == nil || !redisClient.Enabled() {
		e.localSel = NewLocalSelectionStore()
	}
	empty := &SuggestData{
		Tables:       NewIDTables(1),
		Trie:         NewTrie(opts.MaxTopPerNode, NewIDTables(1)),
		LexiconCount: 0,
		LoadedAt:     time.Now(),
		TrieVersion:  time.Now().UTC().Format(time.RFC3339),
	}
	e.data.Store(empty)
	go func() {
		// 15 min timeout for initial load of large lexicon (227k+ rows) over pooler
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()
		if err := e.reload(ctx); err != nil {
			return
		}
		if e.refreshSec > 0 {
			go e.refreshLoop()
		}
	}()
	return e
}

func (e *Engine) reload(ctx context.Context) error {
	data, err := LoadSuggestData(ctx, e.db, LoaderOptions{
		MaxTopPerNode:      e.maxTopPerNode,
		EnableVowelCollapse: e.vowelCollapse,
		RedisClient:        e.redis,
		UseRedisCache:      e.redis != nil && e.redis.Enabled(), // Use cache if Redis is enabled
	})
	if err != nil {
		return err
	}
	e.data.Store(data)
	return nil
}

func (e *Engine) refreshLoop() {
	ticker := time.NewTicker(time.Duration(e.refreshSec) * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		_ = e.reload(context.Background())
	}
}

func (e *Engine) Data() *SuggestData {
	v := e.data.Load()
	if v == nil {
		return nil
	}
	return v.(*SuggestData)
}

func (e *Engine) RedisEnabled() bool {
	return e.redis != nil && e.redis.Enabled()
}

func (e *Engine) RecordSelection(ctx context.Context, uid, prefix string, id int32) {
	if uid == "" || id <= 0 {
		return
	}
	norm := NormalizeRoman(prefix, NormalizeOptions{EnableVowelCollapse: e.vowelCollapse})
	member := idToMember(id)
	if e.RedisEnabled() {
		e.redis.ZIncrBy(ctx, "sg:u:"+uid+":sel", member, 1)
		e.redis.ZIncrBy(ctx, "sg:u:"+uid+":p:"+norm, member, 1)
		e.redis.ZIncrBy(ctx, "sg:g:sel", member, 1)
		return
	}
	if e.localSel != nil {
		e.localSel.Record(uid, norm, member)
	}
}

func (e *Engine) Suggest(ctx context.Context, req SuggestRequest) (*SuggestResponse, error) {
	start := time.Now()
	qRaw := strings.TrimSpace(req.Query)
	norm := NormalizeRoman(qRaw, NormalizeOptions{EnableVowelCollapse: e.vowelCollapse})
	if norm == "" || len(norm) < e.minLen {
		return &SuggestResponse{
			Success:     true,
			Q:           qRaw,
			Normalized:  norm,
			Suggestions: []Suggestion{},
			Source:      "trie",
			Timing:      map[string]float64{"total_ms": 0},
			Meta:        e.meta(),
		}, nil
	}
	limit := req.Limit
	if limit <= 0 {
		limit = e.limitDefault
	}
	if limit > 10 {
		limit = 10
	}

	cacheKey := norm + "|" + req.UID + "|" + strconvI(limit)
	if cached, ok := e.cache.Get(cacheKey); ok {
		cached.Timing = map[string]float64{"total_ms": msSince(start), "cache": 1}
		cached.Source = "lru"
		e.metrics.Add(msSince(start))
		return cached, nil
	}

	data := e.Data()
	// When in-memory cache (trie) is not loaded yet, fallback to DB so suggestions still work
	if data == nil || data.Trie == nil || data.LexiconCount == 0 {
		return e.suggestFromDB(ctx, start, qRaw, norm, limit)
	}

	trieStart := time.Now()
	ids := data.Trie.Lookup(norm, 25)
	trieMs := msSince(trieStart)

	suggestions, redisMs := e.buildSuggestions(ctx, norm, ids, req.UID)
	source := "trie"
	if redisMs > 0 {
		source = "redis"
	}
	out := &SuggestResponse{
		Success:     true,
		Q:           qRaw,
		Normalized:  norm,
		Suggestions: suggestions,
		Source:      source,
		Timing: map[string]float64{
			"total_ms": msSince(start),
			"trie_ms":  trieMs,
			"redis_ms": redisMs,
		},
		Meta: e.meta(),
	}
	e.cache.Set(cacheKey, out)
	e.metrics.Add(msSince(start))
	return out, nil
}

// suggestFromDB returns suggestions by querying tamil_words when in-memory cache is not loaded yet.
func (e *Engine) suggestFromDB(ctx context.Context, start time.Time, qRaw, norm string, limit int) (*SuggestResponse, error) {
	if e.db == nil {
		return &SuggestResponse{
			Success:     true,
			Q:           qRaw,
			Normalized:  norm,
			Suggestions: []Suggestion{},
			Source:      "db",
			Timing:      map[string]float64{"total_ms": msSince(start)},
			Meta:        e.meta(),
		}, nil
	}
	prefixPattern := norm + "%"
	var rows []LexiconRow
	err := e.db.WithContext(ctx).Table("tamil_words").
		Select("id, tamil_text, transliteration, frequency, user_confirmed").
		Where("transliteration ILIKE ?", prefixPattern).
		Order("frequency DESC, user_confirmed DESC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return &SuggestResponse{
			Success:     true,
			Q:           qRaw,
			Normalized:  norm,
			Suggestions: []Suggestion{},
			Source:      "db",
			Timing:      map[string]float64{"total_ms": msSince(start)},
			Meta:        e.meta(),
		}, nil
	}
	suggestions := make([]Suggestion, 0, len(rows))
	for _, r := range rows {
		score := float64(r.Frequency) + float64(r.UserConfirmed)*0.5
		suggestions = append(suggestions, Suggestion{
			ID:    int32(r.ID),
			Text:  strings.TrimSpace(r.TamilText),
			Latin: strings.TrimSpace(r.Transliteration),
			Score: score,
		})
	}
	out := &SuggestResponse{
		Success:     true,
		Q:           qRaw,
		Normalized:  norm,
		Suggestions: suggestions,
		Source:      "db",
		Timing:      map[string]float64{"total_ms": msSince(start)},
		Meta:        e.meta(),
	}
	e.metrics.Add(msSince(start))
	return out, nil
}

func (e *Engine) buildSuggestions(ctx context.Context, prefix string, ids []int32, uid string) ([]Suggestion, float64) {
	data := e.Data()
	if data == nil || data.Tables == nil {
		return []Suggestion{}, 0
	}
	if len(ids) == 0 {
		return []Suggestion{}, 0
	}
	tables := data.Tables
	limit := e.limitDefault
	if limit > 10 {
		limit = 10
	}

	// Personalization: Redis or in-memory (when Redis disabled)
	userSel := map[string]float64{}
	userPref := map[string]float64{}
	globalSel := map[string]float64{}
	redisMs := 0.0
	memberIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		memberIDs = append(memberIDs, idToMember(id))
	}
	if e.redis.Enabled() && uid != "" {
		rctx, cancel := e.redis.WithTimeout(ctx, e.redisTimeout)
		defer cancel()
		rs := time.Now()
		userSel = e.redis.ZMScore(rctx, "sg:u:"+uid+":sel", memberIDs)
		userPref = e.redis.ZMScore(rctx, "sg:u:"+uid+":p:"+prefix, memberIDs)
		globalSel = e.redis.ZMScore(rctx, "sg:g:sel", memberIDs)
		redisMs = msSince(rs)
	} else if e.localSel != nil && uid != "" {
		userSel, userPref, globalSel = e.localSel.GetScores(uid, prefix, memberIDs)
	}

	scoredList := make([]scoredEntry, 0, len(ids))
	for _, id := range ids {
		if id <= 0 || int(id) >= len(tables.TamilByID) {
			continue
		}
		tamil := tables.TamilByID[id]
		latin := tables.LatinByID[id]
		if tamil == "" {
			continue
		}
		prefixMatch := 1.0
		freq := float64(tables.GlobalFreqByID[id])
		boost := float64(tables.BoostByID[id])

		userScore := 0.0
		prefScore := 0.0
		globalScore := 0.0
		if v, ok := userSel[idToMember(id)]; ok {
			userScore = v
		}
		if v, ok := userPref[idToMember(id)]; ok {
			prefScore = v
		}
		if v, ok := globalSel[idToMember(id)]; ok {
			globalScore = v
		}

		score := 1.00*prefixMatch +
			0.35*math.Log1p(freq) +
			0.80*math.Log1p(userScore) +
			0.25*math.Log1p(prefScore) +
			0.15*math.Log1p(globalScore) +
			0.10*boost

		scoredList = append(scoredList, scoredEntry{id: id, score: score})
		_ = latin
	}

	sortScored(scoredList)
	out := make([]Suggestion, 0, limit)
	for _, s := range scoredList {
		tamil := tables.TamilByID[s.id]
		latin := tables.LatinByID[s.id]
		if tamil == "" {
			continue
		}
		out = append(out, Suggestion{
			ID:    s.id,
			Text:  tamil,
			Latin: latin,
			Score: math.Round(s.score*100) / 100,
		})
		if len(out) >= limit {
			break
		}
	}
	if (e.redis.Enabled() || e.localSel != nil) && uid != "" && len(out) > 0 {
		out[0].Score = 1.0
	}
	return out, redisMs
}

func (e *Engine) meta() map[string]interface{} {
	data := e.Data()
	meta := map[string]interface{}{
		"lexicon_count": 0,
		"trie_version":  "",
	}
	if data != nil {
		meta["lexicon_count"] = data.LexiconCount
		meta["trie_version"] = data.TrieVersion
	}
	return meta
}

func (e *Engine) MetricsSnapshot() map[string]interface{} {
	p50, p95, count := e.metrics.Snapshot()
	return map[string]interface{}{
		"p50_ms":  p50,
		"p95_ms":  p95,
		"count":   count,
		"ready":   e.Data() != nil,
	}
}

// InvalidateLexiconCache clears the Redis lexicon cache, forcing next reload to use PostgreSQL.
func (e *Engine) InvalidateLexiconCache(ctx context.Context) error {
	if e.redis == nil || !e.redis.Enabled() {
		return nil
	}
	return e.redis.InvalidateLexiconCache(ctx)
}

// GetLexiconCacheInfo returns Redis cache metadata if available.
func (e *Engine) GetLexiconCacheInfo(ctx context.Context) (version string, count int, exists bool) {
	if e.redis == nil || !e.redis.Enabled() {
		return "", 0, false
	}
	return e.redis.GetLexiconCacheInfo(ctx)
}

// WarmLexiconCache pre-populates Redis cache from PostgreSQL.
// Useful for initial setup or cache warming after deployment.
func (e *Engine) WarmLexiconCache(ctx context.Context) error {
	if e.db == nil {
		return errors.New("database not available")
	}
	if e.redis == nil || !e.redis.Enabled() {
		return errors.New("redis not available")
	}
	
	// Load from PostgreSQL
	var rows []LexiconRow
	if err := e.db.WithContext(ctx).Table("tamil_words").
		Select("id, tamil_text, transliteration, alternate_spellings, frequency, user_confirmed").
		Find(&rows).Error; err != nil {
		return err
	}
	
	version := time.Now().UTC().Format(time.RFC3339)
	return e.redis.CacheLexiconRows(ctx, rows, version)
}

func msSince(t time.Time) float64 {
	return float64(time.Since(t).Microseconds()) / 1000.0
}

func strconvI(v int) string {
	return strconv.FormatInt(int64(v), 10)
}

func sortScored(list []scoredEntry) {
	sort.Slice(list, func(i, j int) bool {
		if list[i].score == list[j].score {
			return list[i].id < list[j].id
		}
		return list[i].score > list[j].score
	})
}
