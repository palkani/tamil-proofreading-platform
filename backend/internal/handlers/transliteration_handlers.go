package handlers

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/ime"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/translit"
	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
)

type TransliterateRequest struct {
	Text string `json:"text" binding:"required"`
}

type TransliterateResponse struct {
	Success     bool                  `json:"success"`
	Suggestions []translit.Suggestion `json:"suggestions"`
	Error       string                `json:"error,omitempty"`
}

type TransliterateSuggestResponse struct {
	Success     bool                     `json:"success"`
	Query       string                   `json:"query"`
	Suggestions []map[string]interface{} `json:"suggestions"`
	Error       string                   `json:"error,omitempty"`
}

type ValidateRequest struct {
	Text string `json:"text" binding:"required"`
	Mode string `json:"mode"`
}

type ValidateTokenSuggestion struct {
	Original    string                   `json:"original"`
	Start       int                      `json:"start"`
	End         int                      `json:"end"`
	Category    string                   `json:"category"`
	Severity    string                   `json:"severity"`
	Suggestions []map[string]interface{} `json:"suggestions"`
}

type ValidateResponse struct {
	Success bool                      `json:"success"`
	Summary map[string]interface{}    `json:"summary,omitempty"`
	Tokens  []ValidateTokenSuggestion `json:"tokens"`
	Error   string                    `json:"error,omitempty"`
}

// Transliterate handles English to Tamil transliteration
func (h *Handlers) Transliterate(c *gin.Context) {
	log.Printf("[TRANSLIT-HANDLER] Received transliteration request")

	var req TransliterateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[TRANSLIT-HANDLER] ERROR: Invalid JSON: %v", err)
		c.JSON(http.StatusBadRequest, TransliterateResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	englishText := strings.TrimSpace(req.Text)
	log.Printf("[TRANSLIT-HANDLER] Input text: %q (len=%d)", englishText, len(englishText))

	if englishText == "" {
		log.Printf("[TRANSLIT-HANDLER] ERROR: Empty text")
		c.JSON(http.StatusBadRequest, TransliterateResponse{
			Success: false,
			Error:   "Text is required",
		})
		return
	}

	if len(englishText) > 40 {
		log.Printf("[TRANSLIT-HANDLER] ERROR: Text too long: %d chars", len(englishText))
		c.JSON(http.StatusBadRequest, TransliterateResponse{
			Success: false,
			Error:   "Text must be 40 characters or less",
		})
		return
	}

	// Get in-memory transliteration suggestions
	suggestions := translit.GetSuggestions(englishText)
	if len(suggestions) == 0 {
		log.Printf("[TRANSLIT-HANDLER] No suggestions found for %q", englishText)
		c.JSON(http.StatusOK, TransliterateResponse{
			Success:     true,
			Suggestions: []translit.Suggestion{},
		})
		return
	}

	log.Printf("[TRANSLIT-HANDLER] SUCCESS: %d suggestions for %q", len(suggestions), englishText)
	c.JSON(http.StatusOK, TransliterateResponse{
		Success:     true,
		Suggestions: suggestions,
	})
}

// TransliterateSuggest handles GET /transliterate/suggest?q=...
func (h *Handlers) TransliterateSuggest(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	mode := strings.ToLower(strings.TrimSpace(c.Query("mode")))
	prev := strings.TrimSpace(c.Query("prev"))
	usageLabel := map[string]string{
		"spoken":   "Spoken",
		"formal":   "Written / Formal",
		"academic": "Academic",
	}[mode]
	if usageLabel == "" {
		usageLabel = "Both"
	}
	limitStr := strings.TrimSpace(c.Query("limit"))
	// UI policy: Google-IME-like depth (ranked). Default 10, allow up to 20.
	limit := 10
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			if v > 20 {
				v = 20
			}
			limit = v
		}
	}

	// Allow per-letter IME suggestions (n -> na -> nam -> ...).
	// Keep empty query fast-path.
	if len(q) < 1 {
		c.JSON(http.StatusOK, TransliterateSuggestResponse{
			Success:     true,
			Query:       q,
			Suggestions: []map[string]interface{}{},
		})
		return
	}

	// Step 0: Try Node suggest service (primary) if configured.
	if h.cfg != nil && strings.TrimSpace(h.cfg.SuggestServiceURL) != "" {
		if out, ok := h.tryNodeSuggest(c, q, prev, mode, limit, usageLabel); ok {
			c.JSON(http.StatusOK, out)
			return
		}
	}

	// Step 0.5: Fallback to ProofTamilRunner suggest API (production IME behavior).
	if h.cfg != nil && strings.TrimSpace(h.cfg.TransliteratorBaseURL) != "" {
		if out, ok := h.tryRunnerSuggest(c, q, prev, mode, limit, usageLabel); ok {
			c.JSON(http.StatusOK, out)
			return
		}
	}

	// Step 0.6: Fallback to Aksharamukha-backed IME service (older IME path) if enabled.
	if h.imeSvc != nil && h.imeEnabled {
		ctx := c.Request.Context()
		if reqID := c.GetString("request_id"); reqID != "" {
			ctx = context.WithValue(ctx, "request_id", reqID)
		}
		cands, _ := h.imeSvc.Suggest(ctx, q, mode, limit)
		if len(cands) > 0 {
			mapped := mapCandidatesToSuggestResponse(q, usageLabel, cands)
			c.JSON(http.StatusOK, mapped)
			return
		}
	}

	suggestions := translit.GetSuggestions(q)
	if len(suggestions) > limit {
		suggestions = suggestions[:limit]
	}

	// Normalize scores so the top suggestion is always 1.0 (stable ranking for clients).
	maxScore := 0.0
	for _, s := range suggestions {
		if s.Score > maxScore {
			maxScore = s.Score
		}
	}
	if maxScore > 0 {
		for i := range suggestions {
			suggestions[i].Score = math.Round((suggestions[i].Score/maxScore)*100) / 100
			if i == 0 {
				suggestions[i].Score = 1.0
			}
		}
	}

	// Map to rich metadata
	mapped := make([]map[string]interface{}, 0, len(suggestions))
	for idx, s := range suggestions {
		mapped = append(mapped, map[string]interface{}{
			"word":   s.Word,
			"ta":     s.Word,
			"score":  s.Score,
			"rank":   idx + 1,
			"label":  "Recommended",
			"usage":  usageLabel,
			"reason": "Standard transliteration match",
		})
	}

	// Avoid logging raw user tokens in production logs.
	log.Printf("[SUGGEST] len=%d count=%d mode=%s", len(q), len(suggestions), mode)

	c.JSON(http.StatusOK, TransliterateSuggestResponse{
		Success:     true,
		Query:       q,
		Suggestions: mapped,
	})
}

type nodeSuggestResp struct {
	Suggestions []struct {
		Text  string  `json:"text"`
		Score float64 `json:"score"`
	} `json:"suggestions"`
	Meta map[string]interface{} `json:"meta"`
}

func (h *Handlers) tryNodeSuggest(c *gin.Context, q, prev, mode string, limit int, usageLabel string) (TransliterateSuggestResponse, bool) {
	base := strings.TrimSpace(h.cfg.SuggestServiceURL)
	if base == "" {
		return TransliterateSuggestResponse{}, false
	}

	u, err := url.Parse(base)
	if err != nil {
		return TransliterateSuggestResponse{}, false
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/api/suggest"
	qs := u.Query()
	qs.Set("q", q)
	qs.Set("limit", strconv.Itoa(limit))
	if mode != "" {
		qs.Set("mode", mode)
	}
	if strings.TrimSpace(prev) != "" {
		qs.Set("prev", prev)
	}
	u.RawQuery = qs.Encode()

	client := &http.Client{Timeout: 250 * time.Millisecond}
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, u.String(), nil)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil || resp == nil {
		auditlog.Warn(c, "ime.node_suggest_error", map[string]any{"error": safeErr(err)})
		return TransliterateSuggestResponse{}, false
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		auditlog.Warn(c, "ime.node_suggest_status", map[string]any{"status": resp.StatusCode})
		return TransliterateSuggestResponse{}, false
	}

	var parsed nodeSuggestResp
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		auditlog.Warn(c, "ime.node_suggest_decode_error", map[string]any{"error": safeErr(err)})
		return TransliterateSuggestResponse{}, false
	}
	if len(parsed.Suggestions) == 0 {
		return TransliterateSuggestResponse{}, false
	}

	// Convert scores to stable 0..1 scale (top=1.0)
	max := 0.0
	for _, s := range parsed.Suggestions {
		if s.Score > max {
			max = s.Score
		}
	}
	mapped := make([]map[string]interface{}, 0, len(parsed.Suggestions))
	for idx, s := range parsed.Suggestions {
		word := strings.TrimSpace(s.Text)
		if word == "" {
			continue
		}
		sc := s.Score
		if max > 0 {
			sc = sc / max
		}
		// Round to 2 decimals for stable clients
		sc = math.Round(sc*100) / 100
		if idx == 0 {
			sc = 1.0
		}
		mapped = append(mapped, map[string]interface{}{
			"word":   word,
			"ta":     word,
			"score":  sc,
			"rank":   idx + 1,
			"label":  "Recommended",
			"usage":  usageLabel,
			"reason": "Corpus-ranked suggestion",
		})
		if len(mapped) >= limit {
			break
		}
	}
	if len(mapped) == 0 {
		return TransliterateSuggestResponse{}, false
	}

	return TransliterateSuggestResponse{Success: true, Query: q, Suggestions: mapped}, true
}

type runnerSuggestResp struct {
	Success     bool `json:"success"`
	Suggestions []struct {
		Word  string  `json:"word"`
		Score float64 `json:"score"`
	} `json:"suggestions"`
	Meta map[string]interface{} `json:"meta"`
}

func (h *Handlers) tryRunnerSuggest(c *gin.Context, q, prev, mode string, limit int, usageLabel string) (TransliterateSuggestResponse, bool) {
	base := strings.TrimSpace(h.cfg.TransliteratorBaseURL)
	if base == "" {
		return TransliterateSuggestResponse{}, false
	}
	base = strings.TrimRight(base, "/")
	// Keep compatibility: runner exposes /api/v1/transliterate/suggest
	if !strings.HasSuffix(base, "/api/v1") {
		base = base + "/api/v1"
	}

	u, err := url.Parse(base)
	if err != nil {
		return TransliterateSuggestResponse{}, false
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/transliterate/suggest"
	qs := u.Query()
	qs.Set("q", q)
	qs.Set("limit", strconv.Itoa(limit))
	if mode != "" {
		qs.Set("mode", mode)
	}
	if strings.TrimSpace(prev) != "" {
		qs.Set("prev", prev)
	}
	u.RawQuery = qs.Encode()

	// Runner suggest can take >1s on cold starts and for longer tokens.
	// If this timeout is too aggressive, we silently fall back to the local lexicon,
	// which dramatically reduces suggestion quality (e.g., "amma" -> only "ஆ").
	client := &http.Client{Timeout: 4 * time.Second}
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, u.String(), nil)
	req.Header.Set("Accept", "application/json")
	// ProofTamilRunner requires auth headers on all endpoints except /health.
	// Keep the same env var names as the IME client:
	// - RUNNER_CLIENT_ID / CLIENT_ID
	// - RUNNER_API_KEY / API_KEY
	clientID := strings.TrimSpace(os.Getenv("RUNNER_CLIENT_ID"))
	if clientID == "" {
		clientID = strings.TrimSpace(os.Getenv("CLIENT_ID"))
	}
	if clientID == "" {
		clientID = "prooftamil-backend"
	}
	apiKey := strings.TrimSpace(os.Getenv("RUNNER_API_KEY"))
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("API_KEY"))
	}
	if clientID != "" {
		req.Header.Set("X-Client-Id", clientID)
	}
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}

	resp, err := client.Do(req)
	if err != nil || resp == nil {
		auditlog.Warn(c, "ime.runner_suggest_error", map[string]any{"error": safeErr(err)})
		return TransliterateSuggestResponse{}, false
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		auditlog.Warn(c, "ime.runner_suggest_status", map[string]any{"status": resp.StatusCode})
		return TransliterateSuggestResponse{}, false
	}

	var parsed runnerSuggestResp
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		auditlog.Warn(c, "ime.runner_suggest_decode_error", map[string]any{"error": safeErr(err)})
		return TransliterateSuggestResponse{}, false
	}
	if !parsed.Success || len(parsed.Suggestions) == 0 {
		return TransliterateSuggestResponse{}, false
	}

	// Normalize scores so top=1.0 (stable for clients)
	max := 0.0
	for _, s := range parsed.Suggestions {
		if s.Score > max {
			max = s.Score
		}
	}
	mapped := make([]map[string]interface{}, 0, len(parsed.Suggestions))
	for idx, s := range parsed.Suggestions {
		word := strings.TrimSpace(s.Word)
		if word == "" {
			continue
		}
		sc := s.Score
		if max > 0 {
			sc = sc / max
		}
		sc = math.Round(sc*100) / 100
		if idx == 0 {
			sc = 1.0
		}
		mapped = append(mapped, map[string]interface{}{
			"word":   word,
			"ta":     word,
			"score":  sc,
			"rank":   idx + 1,
			"label":  "Recommended",
			"usage":  usageLabel,
			"reason": "Runner IME suggestion",
		})
		if len(mapped) >= limit {
			break
		}
	}
	if len(mapped) == 0 {
		return TransliterateSuggestResponse{}, false
	}
	return TransliterateSuggestResponse{Success: true, Query: q, Suggestions: mapped}, true
}

func mapCandidatesToSuggestResponse(q, usageLabel string, cands []ime.Candidate) TransliterateSuggestResponse {
	mapped := make([]map[string]interface{}, 0, len(cands))
	max := 0.0
	for _, c := range cands {
		if c.Score > max {
			max = c.Score
		}
	}
	for idx, cnd := range cands {
		word := strings.TrimSpace(cnd.Word)
		if word == "" {
			continue
		}
		sc := cnd.Score
		if max > 0 {
			sc = sc / max
		}
		sc = math.Round(sc*100) / 100
		if idx == 0 {
			sc = 1.0
		}
		mapped = append(mapped, map[string]interface{}{
			"word":   word,
			"ta":     word,
			"score":  sc,
			"rank":   idx + 1,
			"label":  "Recommended",
			"usage":  usageLabel,
			"reason": "IME fallback suggestion",
		})
	}
	return TransliterateSuggestResponse{Success: true, Query: q, Suggestions: mapped}
}

func safeErr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

type TransliterateAcceptRequest struct {
	Query    string  `json:"q" binding:"required"`
	Selected string  `json:"selected" binding:"required"`
	Prev     *string `json:"prev"`
	Mode     string  `json:"mode"`
}

// TransliterateAccept records a token-level suggestion acceptance event.
// Privacy: does NOT store full editor text.
func (h *Handlers) TransliterateAccept(c *gin.Context) {
	var req TransliterateAcceptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"logged": false, "error": "Invalid request"})
		return
	}

	q := strings.TrimSpace(req.Query)
	selected := strings.TrimSpace(req.Selected)
	if q == "" || selected == "" || len(q) > 60 || len(selected) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"logged": false, "error": "Invalid values"})
		return
	}

	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "spoken"
	}

	var uidPtr *uint
	if v, ok := c.Get("user_id"); ok {
		if uid, ok2 := v.(uint); ok2 && uid > 0 {
			uidPtr = &uid
		}
	}

	// DB optional: never break UX if DB is down.
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"logged": false})
		return
	}

	ev := models.SuggestionAcceptEvent{
		UserID:    uidPtr,
		Query:     q,
		Selected:  selected,
		Prev:      req.Prev,
		Mode:      mode,
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&ev).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"logged": false})
		return
	}

	// Also log to the generic activity table (best-effort) for dashboard metrics.
	if uidPtr != nil {
		meta, _ := json.Marshal(map[string]any{
			"q":        q,
			"selected": selected,
			"prev":     req.Prev,
			"mode":     mode,
		})
		_ = h.db.Create(&models.ActivityEvent{
			UserID:     *uidPtr,
			EventType:  models.EventSuggestionAccept,
			Metadata:   string(meta),
			OccurredAt: time.Now(),
		}).Error
	}

	c.JSON(http.StatusOK, gin.H{"logged": true})
}

// ValidateText handles POST /validate to return per-token Tamil suggestions
func (h *Handlers) ValidateText(c *gin.Context) {
	start := time.Now()

	var req ValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ValidateResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		c.JSON(http.StatusBadRequest, ValidateResponse{
			Success: false,
			Error:   "Text is required",
		})
		return
	}

	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "spoken"
	}
	usageLabel := map[string]string{
		"spoken":   "Spoken",
		"formal":   "Written / Formal",
		"academic": "Academic",
	}[strings.ToLower(mode)]
	if usageLabel == "" {
		usageLabel = "Both"
	}

	var tokens []ValidateTokenSuggestion
	words := strings.Fields(text)
	pos := 0
	for _, w := range words {
		startIdx := strings.Index(text[pos:], w)
		if startIdx < 0 {
			continue
		}
		startIdx += pos
		endIdx := startIdx + len(w)
		pos = endIdx

		// Skip very short tokens
		if len(w) < 2 {
			continue
		}

		suggestions := translit.GetSuggestions(w)
		if len(suggestions) > 0 {
			mapped := make([]map[string]interface{}, 0, len(suggestions))
			for idx, s := range suggestions {
				mapped = append(mapped, map[string]interface{}{
					"ta":      s.Word,
					"score":   s.Score,
					"reason":  "Transliteration improvement",
					"example": "",
					"usage":   usageLabel,
					"label":   "Recommended",
					"rank":    idx + 1,
				})
			}

			tokens = append(tokens, ValidateTokenSuggestion{
				Original:    w,
				Start:       startIdx,
				End:         endIdx,
				Category:    "Transliteration",
				Severity:    "High",
				Suggestions: mapped,
			})
		}
	}

	elapsed := time.Since(start).Milliseconds()
	log.Printf("[VALIDATE] tokens=%d time_ms=%d", len(tokens), elapsed)

	c.JSON(http.StatusOK, ValidateResponse{
		Success: true,
		Summary: map[string]interface{}{
			"total_tokens": len(words),
			"issues_found": len(tokens),
			"confidence":   "High",
			"mode":         req.Mode,
		},
		Tokens: tokens,
	})
}
