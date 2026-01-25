package handlers

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/ime"

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
	prev := strings.TrimSpace(c.Query("prev")) // NEW: For context awareness
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

	if h.imeSvc == nil || !h.imeEnabled {
		log.Printf(`[IME] event=disabled request_id=%s q=%q`, reqID, q)
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"query":       q,
			"mode":        mode,
			"suggestions": []map[string]interface{}{},
			"meta": gin.H{
				"cache":      "miss",
				"latency_ms": 0,
				"engine":     "disabled",
				"request_id": reqID,
			},
		})
		return
	}

	start := time.Now()
	ctx := c.Request.Context()
	if reqID != "" {
		ctx = context.WithValue(ctx, "request_id", reqID)
	}

	// Try advanced service first if enabled
	var cands []ime.Candidate
	var meta map[string]interface{}
	usedAdvanced := false

	if h.useAdvancedSuggest && h.advancedClient != nil {
		advCands, advMeta, err := h.advancedClient.Suggest(ctx, q, prev, limit)
		if err == nil && len(advCands) > 0 {
			// Success! Use advanced suggestions
			cands = advCands
			meta = advMeta
			usedAdvanced = true
			log.Printf(`[IME] event=advanced_success request_id=%s q=%q prev=%q count=%d latency_ms=%v`,
				reqID, q, prev, len(cands), meta["latency_ms"])
		} else {
			// Advanced failed, log and fallback
			log.Printf(`[IME] event=advanced_fallback request_id=%s q=%q error=%v - using basic service`,
				reqID, q, err)
		}
	}

	// Fallback to existing Aksharamukha service if advanced not used/failed
	if !usedAdvanced {
		cands, meta = h.imeSvc.Suggest(ctx, q, mode, limit)
	}

	meta["request_id"] = reqID
	meta["duration_ms"] = time.Since(start).Milliseconds()
	meta["used_advanced"] = usedAdvanced
	cacheState, _ := meta["cache"]
	log.Printf(`[IME] event=response request_id=%s q=%q mode=%s limit=%d cache=%v count=%d latency_ms=%v advanced=%v`,
		reqID, q, mode, limit, cacheState, len(cands), meta["latency_ms"], usedAdvanced)

	suggestions := make([]map[string]interface{}, 0, len(cands))
	for _, cnd := range cands {
		suggestions = append(suggestions, map[string]interface{}{
			"word":        cnd.Word,
			"ta":          cnd.Word, // backward compatibility
			"score":       cnd.Score,
			"source":      cnd.Source,
			"rank_reason": cnd.RankReason,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"query":       q,
		"mode":        mode,
		"suggestions": suggestions,
		"candidates":  suggestions, // backward compatibility
		"meta":        meta,
	})
}
