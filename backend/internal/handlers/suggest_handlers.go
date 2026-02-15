package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"tamil-proofreading-platform/backend/internal/cache"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/suggest"
	"tamil-proofreading-platform/backend/internal/translit"

	"github.com/gin-gonic/gin"
)

type SuggestSelectRequest struct {
	UID          string `json:"uid"`
	Prefix       string `json:"prefix"`
	SuggestionID int32  `json:"suggestionId"`
}

// SuggestAPIResponse is the exact response format for auto-suggest API: only success and suggestions with word and score.
type SuggestAPIResponse struct {
	Success     bool              `json:"success"`
	Suggestions []SuggestAPIItem  `json:"suggestions"`
}

type SuggestAPIItem struct {
	Word  string  `json:"word"`
	Score float64 `json:"score"`
}

// Suggest handles GET /api/suggest. When SUGGEST_USE_DB=true, uses HotCache then Postgres RPC (suggest_tamil);
// otherwise uses in-process trie + IME + translit fallbacks. Response: { "success": true, "suggestions": [ { "word", "score": 0-1 } ] }.
func (h *Handlers) Suggest(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300")
	c.Header("Vary", "Accept-Encoding")

	qTrim := strings.TrimSpace(c.Query("q"))
	q := qTrim
	uid := strings.TrimSpace(c.Query("uid"))
	limit := parseLimit(c.Query("limit"))
	if limit <= 0 {
		limit = 8
	}
	if limit > 20 {
		limit = 20
	}

	// DB path: HotCache then SuggestRepo (when SUGGEST_USE_DB=true)
	if h.suggestRepo != nil && q != "" {
		if h.hotCache != nil {
			cached := h.hotCache.Lookup(q)
			if len(cached) >= limit {
				items := normalizeScoredWordsToAPI(cached, limit)
				c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: items})
				return
			}
		}
		prevWord := strings.TrimSpace(c.Query("prev"))
		results, err := h.suggestRepo.Suggest(c.Request.Context(), q, limit, prevWord)
		if err == nil && len(results) > 0 {
			items := make([]SuggestAPIItem, 0, len(results))
			for i, s := range results {
				if i >= limit {
					break
				}
				word := strings.TrimSpace(s.TamilText)
				if word == "" {
					continue
				}
				score := 1.0
				if len(results) > 1 && i > 0 {
					maxScore := results[0].Score
					if maxScore > 0 {
						score = float64(s.Score) / float64(maxScore)
						if score > 1 {
							score = 1
						}
						if score < 0.5 {
							score = 0.5
						}
					}
				}
				items = append(items, SuggestAPIItem{Word: word, Score: score})
			}
			if len(items) > 0 {
				c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: items})
				return
			}
		}
	}

	// Legacy path: in-process engine + IME + translit
	engine := h.getSuggestEngine()
	if engine == nil {
		c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: []SuggestAPIItem{}})
		return
	}

	out, err := engine.Suggest(c.Request.Context(), suggest.SuggestRequest{
		Query: q,
		UID:   uid,
		Limit: limit,
	})
	if err != nil {
		c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: []SuggestAPIItem{}})
		return
	}
	// Transliteration fallback: when trie returns no suggestions, use IME (corpus + Aksharamukha)
	if len(out.Suggestions) == 0 && q != "" && h.imeSvc != nil && h.imeEnabled {
		ctx := c.Request.Context()
		if c.GetString("request_id") != "" {
			ctx = context.WithValue(ctx, "request_id", c.GetString("request_id"))
		}
		lim := limit
		if lim <= 0 {
			lim = 5
		}
		cands, _ := h.imeSvc.Suggest(ctx, q, "spoken", lim)
		if len(cands) > 0 {
			suggestions := make([]suggest.Suggestion, 0, len(cands))
			for i, c := range cands {
				score := 0.9 - float64(i)*0.05
				if score < 0.5 {
					score = 0.5
				}
				suggestions = append(suggestions, suggest.Suggestion{
					Text:  c.Word,
					Word:  c.Word,
					Latin: "",
					Score: score,
					Type:  "transliteration",
				})
			}
			out.Suggestions = suggestions
			out.Source = "transliteration"
		}
	}
	items := make([]SuggestAPIItem, 0, len(out.Suggestions))
	for _, s := range out.Suggestions {
		word := strings.TrimSpace(s.Word)
		if word == "" {
			word = strings.TrimSpace(s.Text)
		}
		if word == "" {
			continue
		}
		score := s.Score
		if score <= 0 || score > 1 {
			score = 1.0
		}
		items = append(items, SuggestAPIItem{Word: word, Score: score})
	}

	// Translit fallback: when trie and IME return no suggestions, use in-memory translit lexicon
	// (same as GET /api/v1/transliterate/suggest) so queries like "tamil" get Tamil suggestions.
	if len(items) == 0 && q != "" {
		translitCands := translit.GetSuggestions(q)
		for _, s := range translitCands {
			word := strings.TrimSpace(s.Word)
			if word == "" {
				continue
			}
			score := s.Score
			if score <= 0 || score > 1 {
				score = 1.0
			}
			items = append(items, SuggestAPIItem{Word: word, Score: score})
		}
		if len(items) > limit {
			items = items[:limit]
		}
	}
	if len(items) > limit {
		items = items[:limit]
	}

	c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: items})
}

// normalizeScoredWordsToAPI converts cache.ScoredWord (Tamil, Frequency) to API items with score 0-1.
func normalizeScoredWordsToAPI(cached []cache.ScoredWord, limit int) []SuggestAPIItem {
	if len(cached) == 0 {
		return nil
	}
	if limit <= 0 {
		limit = 8
	}
	maxFreq := int64(0)
	for _, w := range cached {
		if w.Frequency > maxFreq {
			maxFreq = w.Frequency
		}
	}
	items := make([]SuggestAPIItem, 0, limit)
	for i := 0; i < len(cached) && i < limit; i++ {
		w := cached[i]
		word := strings.TrimSpace(w.Tamil)
		if word == "" {
			continue
		}
		score := 1.0
		if maxFreq > 0 && i > 0 {
			score = float64(w.Frequency) / float64(maxFreq)
			if score < 0.5 {
				score = 0.5
			}
		}
		items = append(items, SuggestAPIItem{Word: word, Score: score})
	}
	return items
}

// SuggestSelect handles POST /api/select (selection logging + personalization).
func (h *Handlers) SuggestSelect(c *gin.Context) {
	engine := h.getSuggestEngine()
	if engine == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "error": "suggest engine disabled"})
		return
	}
	var req SuggestSelectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
		return
	}
	if req.SuggestionID <= 0 || strings.TrimSpace(req.Prefix) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid selection"})
		return
	}

	// Redis personalization (best-effort)
	if engine.RedisEnabled() {
		engine.RecordSelection(c.Request.Context(), req.UID, req.Prefix, req.SuggestionID)
		c.JSON(http.StatusOK, gin.H{"success": true, "source": "redis"})
		return
	}

	// Fallback: persist selection event asynchronously in Postgres
	if h.db != nil {
		selected := strconv.Itoa(int(req.SuggestionID))
		if data := engine.Data(); data != nil && data.Tables != nil {
			if int(req.SuggestionID) < len(data.Tables.TamilByID) {
				if t := strings.TrimSpace(data.Tables.TamilByID[req.SuggestionID]); t != "" {
					selected = t
				}
			}
		}
		ev := models.SuggestionAcceptEvent{
			Query:    req.Prefix,
			Selected: selected,
		}
		go func() { _ = h.db.Create(&ev).Error }()
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "source": "db"})
}

// SuggestMetrics handles GET /metrics-lite.
func (h *Handlers) SuggestMetrics(c *gin.Context) {
	engine := h.getSuggestEngine()
	if engine == nil {
		c.JSON(http.StatusOK, gin.H{"ready": false})
		return
	}
	c.JSON(http.StatusOK, engine.MetricsSnapshot())
}

// SuggestHealth handles GET /healthz.
func (h *Handlers) SuggestHealth(c *gin.Context) {
	meta := gin.H{"ready": false, "lexicon_count": 0}
	if engine := h.getSuggestEngine(); engine != nil && engine.Data() != nil {
		data := engine.Data()
		meta["ready"] = true
		meta["lexicon_count"] = data.LexiconCount
		meta["trie_version"] = data.TrieVersion
	}
	c.JSON(http.StatusOK, meta)
}

// SuggestLexiconCount returns the current suggest engine lexicon count (0 if not loaded).
func (h *Handlers) SuggestLexiconCount() int {
	if engine := h.getSuggestEngine(); engine != nil {
		if data := engine.Data(); data != nil {
			return data.LexiconCount
		}
	}
	return 0
}

func parseLimit(raw string) int {
	if raw == "" {
		return 0
	}
	n := 0
	for _, r := range raw {
		if r < '0' || r > '9' {
			continue
		}
		n = n*10 + int(r-'0')
	}
	if n <= 0 {
		return 0
	}
	if n > 10 {
		return 10
	}
	return n
}
