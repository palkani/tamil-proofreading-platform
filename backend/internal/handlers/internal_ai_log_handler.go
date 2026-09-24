package handlers

import (
	"net/http"
	"strings"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/observability"

	"github.com/gin-gonic/gin"
)

// logAIRequestFromExpressBody is the wire format the Express layer POSTs to
// /api/v1/internal/ai-log after every Gemini call it makes. Fields mirror
// observability.AIRequestLog, plus `Email` — the Express layer knows the
// caller by email (from the JWT), the Go side resolves that to user_id.
//
// The intent: after this endpoint is in place, EVERY Gemini call in the
// stack lands in ai_requests, regardless of whether it originated in the
// Go proofreading path (already logged directly) or the Express layer
// (previously silent, now logged via this bridge). The admin dashboard
// at /admin/ai-requests then becomes the single source of truth for
// Gemini spend, per-user usage, and cost attribution — closing the
// visibility gap uncovered by the 2026-09 abuse incident.
type logAIRequestFromExpressBody struct {
	RequestID    string `json:"request_id"`
	Email        string `json:"email"` // resolved to user_id server-side; nil if unknown
	Provider     string `json:"provider"`
	Model        string `json:"model"`
	ModelVersion string `json:"model_version"`
	Status       string `json:"status"`
	CacheHit     bool   `json:"cache_hit"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
	TotalTokens  int    `json:"total_tokens"`
	LatencyMS    int    `json:"latency_ms"`
	ErrorType    string `json:"error_type"`
	CountryCode  string `json:"country_code"`
}

// LogAIRequestFromExpress is POST /api/v1/internal/ai-log. Authenticated
// via the shared X-Job-Secret header (InternalJobSecretMiddleware). Never
// blocks — the underlying aiLogger.Log runs asynchronously and errors are
// swallowed, matching how the direct Go-side callers use it.
func (h *Handlers) LogAIRequestFromExpress(c *gin.Context) {
	var body logAIRequestFromExpressBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body: " + err.Error()})
		return
	}

	// Attribute to a user when possible. A miss is fine — an anonymous
	// call (or one from an account the Express layer knows by email but
	// the users table doesn't) still lands in the table with UserID=nil.
	// The admin-summary "top users by spend" query filters user_id NOT
	// NULL; per-day / per-model totals include the anonymous rows.
	var userIDPtr *uint
	if email := strings.ToLower(strings.TrimSpace(body.Email)); email != "" {
		var user models.User
		if err := h.db.Select("id").Where("LOWER(email) = ?", email).First(&user).Error; err == nil {
			id := user.ID
			userIDPtr = &id
		}
	}

	h.aiLogger.Log(observability.AIRequestLog{
		RequestID:    body.RequestID,
		UserID:       userIDPtr,
		Provider:     body.Provider,
		Model:        body.Model,
		ModelVersion: body.ModelVersion,
		Status:       body.Status,
		CacheHit:     body.CacheHit,
		InputTokens:  body.InputTokens,
		OutputTokens: body.OutputTokens,
		TotalTokens:  body.TotalTokens,
		LatencyMS:    body.LatencyMS,
		ErrorType:    body.ErrorType,
		CountryCode:  body.CountryCode,
	})

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
