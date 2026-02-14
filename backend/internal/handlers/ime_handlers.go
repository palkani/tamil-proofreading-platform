package handlers

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"

	"tamil-proofreading-platform/backend/internal/ime"
	"tamil-proofreading-platform/backend/internal/suggest"

	"github.com/gin-gonic/gin"
)

// IMEService provides transliteration suggestions (Aksharamukha-backed).
type IMEService interface {
	Suggest(ctx context.Context, q, mode string, limit int) ([]ime.Candidate, map[string]interface{})
}

type IMEHandler struct {
	svc     *ime.Service
	enabled bool
}

func NewIMEHandler(svc *ime.Service, enabled bool) *IMEHandler {
	return &IMEHandler{svc: svc, enabled: enabled}
}

// IMESuggest handles GET /api/v1/ime/suggest
func (h *Handlers) IMESuggest(c *gin.Context) {
	reqID := c.GetString("request_id")
	q := strings.TrimSpace(c.Query("q"))
	mode := strings.TrimSpace(c.Query("mode"))
	if mode == "" {
		mode = "spoken"
	}
	limitStr := strings.TrimSpace(c.Query("limit"))
	limit := 8
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil {
			if v < 1 {
				v = 1
			}
			if v > 12 {
				v = 12
			}
			limit = v
		}
	}

	ctx := c.Request.Context()
	if reqID != "" {
		ctx = context.WithValue(ctx, "request_id", reqID)
	}

	var cands []ime.Candidate
	var meta map[string]interface{}

	if h.imeSvc != nil && h.imeEnabled {
		// Use in-process IME service (Aksharamukha-backed + corpus).
		cands, meta = h.imeSvc.Suggest(ctx, q, mode, limit)
	} else {
		log.Printf(`[IME] event=disabled request_id=%s q=%q, using suggest-engine fallback`, reqID, q)
		meta = map[string]interface{}{
			"cache": "miss", "latency_ms": 0, "engine": "disabled",
		}
	}

	// Fallback: when IME disabled or returned no candidates, use in-process suggest engine (lexicon/trie).
	if len(cands) == 0 {
		if suggestions, _ := h.imeSuggestFromEngine(c, q, limit); len(suggestions) > 0 {
			log.Printf(`[IME] event=fallback request_id=%s q=%q count=%d`, reqID, q, len(suggestions))
			items := make([]SuggestAPIItem, 0, len(suggestions))
			for _, s := range suggestions {
				word, _ := s["word"].(string)
				if word == "" {
					word, _ = s["ta"].(string)
				}
				word = strings.TrimSpace(word)
				if word == "" {
					continue
				}
				score := 0.9
				if v, ok := s["score"].(float64); ok && v > 0 && v <= 1 {
					score = v
				}
				items = append(items, SuggestAPIItem{Word: word, Score: score})
			}
			c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: items})
			return
		}
	}

	if meta == nil {
		meta = map[string]interface{}{"cache": "miss", "latency_ms": 0, "engine": "none"}
	}
	cacheState, _ := meta["cache"]
	log.Printf(`[IME] event=response request_id=%s q=%q mode=%s limit=%d cache=%v count=%d`,
		reqID, q, mode, limit, cacheState, len(cands))

	items := make([]SuggestAPIItem, 0, len(cands))
	for _, cnd := range cands {
		word := strings.TrimSpace(cnd.Word)
		if word == "" {
			continue
		}
		score := cnd.Score
		if score <= 0 || score > 1 {
			score = 1.0
		}
		items = append(items, SuggestAPIItem{Word: word, Score: score})
	}

	c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: items})
}

// imeSuggestFromEngine returns IME-style suggestions (word, ta, score, ...) from the in-process suggest engine.
func (h *Handlers) imeSuggestFromEngine(c *gin.Context, q string, limit int) ([]map[string]interface{}, map[string]interface{}) {
	engine := h.getSuggestEngine()
	if engine == nil {
		return nil, nil
	}
	out, err := engine.Suggest(c.Request.Context(), suggest.SuggestRequest{
		Query: strings.TrimSpace(q),
		Limit: limit,
	})
	if err != nil || out == nil || len(out.Suggestions) == 0 {
		return nil, nil
	}
	mapped := make([]map[string]interface{}, 0, len(out.Suggestions))
	for i, s := range out.Suggestions {
		score := s.Score
		if score <= 0 {
			score = 1.0 - (float64(i) * 0.05)
			if score < 0.3 {
				score = 0.3
			}
		}
		mapped = append(mapped, map[string]interface{}{
			"word":        s.Text,
			"ta":          s.Text,
			"score":      score,
			"source":     "suggest_engine",
			"rank_reason": "trie",
		})
	}
	meta := map[string]interface{}{
		"cache": "miss", "latency_ms": 0, "engine": "suggest_engine", "request_id": c.GetString("request_id"),
	}
	if out.Timing != nil {
		if v, ok := out.Timing["total_ms"]; ok {
			meta["latency_ms"] = v
		}
	}
	return mapped, meta
}
