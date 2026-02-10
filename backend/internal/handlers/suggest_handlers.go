package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/suggest"

	"github.com/gin-gonic/gin"
)

type SuggestSelectRequest struct {
	UID          string `json:"uid"`
	Prefix       string `json:"prefix"`
	SuggestionID int32  `json:"suggestionId"`
}

// Suggest handles GET /api/suggest (in-process hybrid trie engine).
// OPTIMIZED for <100ms latency with aggressive caching.
func (h *Handlers) Suggest(c *gin.Context) {
	// OPTIMIZATION: Set cache headers for edge caching (Vercel, CloudFlare, etc.)
	// This allows the edge to cache identical requests, reducing backend load
	c.Header("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300")
	c.Header("Vary", "Accept-Encoding")
	
	engine := h.getSuggestEngine()
	if engine == nil {
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"q":           strings.TrimSpace(c.Query("q")),
			"normalized":  "",
			"suggestions": []suggest.Suggestion{},
			"source":      "disabled",
			"timing":      gin.H{"total_ms": 0},
			"meta":        gin.H{"lexicon_count": 0, "trie_version": ""},
		})
		return
	}
	q := strings.TrimSpace(c.Query("q"))
	uid := strings.TrimSpace(c.Query("uid"))
	limit := parseLimit(c.Query("limit"))

	out, err := engine.Suggest(c.Request.Context(), suggest.SuggestRequest{
		Query: q,
		UID:   uid,
		Limit: limit,
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"q":           q,
			"normalized":  "",
			"suggestions": []suggest.Suggestion{},
			"source":      "error",
			"timing":      gin.H{"total_ms": 0},
			"meta":        gin.H{"error": err.Error()},
		})
		return
	}
	c.JSON(http.StatusOK, out)
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
