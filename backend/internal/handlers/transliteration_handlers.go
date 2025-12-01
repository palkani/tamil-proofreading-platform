package handlers

import (
        "log"
        "net/http"
        "strings"

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
