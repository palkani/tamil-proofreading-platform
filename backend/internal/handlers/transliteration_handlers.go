package handlers

import (
        "log"
        "net/http"
        "strconv"
        "strings"
        "time"

        "tamil-proofreading-platform/backend/internal/translit"

        "github.com/gin-gonic/gin"
)

type TransliterateRequest struct {
        Text string `json:"text" binding:"required"`
}

type TransliterateResponse struct {
        Success     bool                   `json:"success"`
        Suggestions []translit.Suggestion  `json:"suggestions"`
        Error       string                 `json:"error,omitempty"`
}

type TransliterateSuggestResponse struct {
	Success     bool                      `json:"success"`
	Query       string                    `json:"query"`
	Suggestions []map[string]interface{}  `json:"suggestions"`
	Error       string                    `json:"error,omitempty"`
}

type ValidateRequest struct {
	Text string `json:"text" binding:"required"`
	Mode string `json:"mode"`
}

type ValidateTokenSuggestion struct {
	Original    string                    `json:"original"`
	Start       int                       `json:"start"`
	End         int                       `json:"end"`
	Category    string                    `json:"category"`
	Severity    string                    `json:"severity"`
	Suggestions []map[string]interface{}  `json:"suggestions"`
}

type ValidateResponse struct {
	Success bool                     `json:"success"`
	Summary map[string]interface{}   `json:"summary,omitempty"`
	Tokens  []ValidateTokenSuggestion `json:"tokens"`
	Error   string                   `json:"error,omitempty"`
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
	usageLabel := map[string]string{
		"spoken":   "Spoken",
		"formal":   "Written / Formal",
		"academic": "Academic",
	}[mode]
	if usageLabel == "" {
		usageLabel = "Both"
	}
	limitStr := strings.TrimSpace(c.Query("limit"))
	limit := 8
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 20 {
			limit = v
		}
	}

	if len(q) < 2 {
		c.JSON(http.StatusOK, TransliterateSuggestResponse{
			Success:     true,
			Query:       q,
			Suggestions: []translit.Suggestion{},
		})
		return
	}

	suggestions := translit.GetSuggestions(q)
	if len(suggestions) > limit {
		suggestions = suggestions[:limit]
	}

	// Map to rich metadata
	mapped := make([]map[string]interface{}, 0, len(suggestions))
	for idx, s := range suggestions {
		mapped = append(mapped, map[string]interface{}{
			"ta":     s.Word,
			"score":  s.Score,
			"rank":   idx + 1,
			"label":  "Recommended",
			"usage":  usageLabel,
			"reason": "Standard transliteration match",
		})
	}

	log.Printf("[SUGGEST] q=%q count=%d", q, len(suggestions))

	c.JSON(http.StatusOK, TransliterateSuggestResponse{
		Success:     true,
		Query:       q,
		Suggestions: mapped,
	})
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
					"ta":     s.Word,
					"score":  s.Score,
					"reason": "Transliteration improvement",
					"example": "",
					"usage":  usageLabel,
					"label":  "Recommended",
					"rank":   idx + 1,
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
		Tokens:  tokens,
        })
}
