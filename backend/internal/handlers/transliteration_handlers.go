package handlers

import (
	"net/http"
	"strings"

	"tamil-proofreading-platform/backend/internal/services/llm"
	"github.com/gin-gonic/gin"
)

type TransliterateRequest struct {
	Text string `json:"text" binding:"required"`
}

type TransliterateResponse struct {
	Success      bool     `json:"success"`
	Suggestions  []string `json:"suggestions"`
	Error        string   `json:"error,omitempty"`
}

// Transliterate handles English to Tamil transliteration
func (h *Handlers) Transliterate(c *gin.Context) {
	var req TransliterateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, TransliterateResponse{
			Success: false,
			Error:   "Invalid request",
		})
		return
	}

	englishText := strings.TrimSpace(req.Text)
	if englishText == "" || len(englishText) < 1 {
		c.JSON(http.StatusBadRequest, TransliterateResponse{
			Success: false,
			Error:   "Text too short",
		})
		return
	}

	// Call Gemini transliteration
	suggestions, err := llm.CallGeminiTransliterate(englishText, h.cfg.GoogleGenAIKey)
	if err != nil {
		c.JSON(http.StatusOK, TransliterateResponse{
			Success:     true,
			Suggestions: []string{},
		})
		return
	}

	c.JSON(http.StatusOK, TransliterateResponse{
		Success:     true,
		Suggestions: suggestions,
	})
}
