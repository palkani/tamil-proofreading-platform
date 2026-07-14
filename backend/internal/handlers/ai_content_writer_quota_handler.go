package handlers

import (
	"net/http"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/billing"

	"github.com/gin-gonic/gin"
)

// AI Content Writer weekly quota. Free users get 2 successful generations
// per rolling ISO week (Monday 00:00 UTC → next Monday 00:00 UTC). Pro
// users effectively unlimited (a high sentinel the UI can treat as "no
// badge, no counter").
//
// Rationale for 2/week (see docs/AI_CONTENT_WRITER_FREEMIUM.md §1):
//   - 1/day is too generous — users never feel the paywall pressure.
//   - 5/month has no clean reset date.
//   - 2/week is the sweet spot: enough for a real draft + revision
//     workflow, hard enough that heavy users hit the paywall within
//     4 days.
const (
	contentWriterFreeWeeklyLimit = 2
	contentWriterProWeeklyLimit  = 9999
)

// contentWriterQuotaResponse mirrors the shape usage/today returns for
// proofreading, but keyed on a weekly window instead of daily. The
// frontend can treat both endpoints the same way: read is_pro to decide
// whether to render the badge at all, read remaining to render the
// countdown, read resets_at to render the reset-date copy.
type contentWriterQuotaResponse struct {
	IsPro     bool      `json:"is_pro"`
	Used      int64     `json:"used"`
	Limit     int       `json:"limit"`
	Remaining int       `json:"remaining"`
	ResetsAt  time.Time `json:"resets_at"` // start of next ISO week (UTC)
	WeekStart time.Time `json:"week_start"`
}

// startOfISOWeek returns the Monday 00:00 UTC that begins the ISO week
// containing t. Sunday belongs to the *preceding* week (ISO 8601), so
// a Sunday call returns the previous Monday, not the following one.
func startOfISOWeek(t time.Time) time.Time {
	utc := t.UTC()
	// Sunday=0..Saturday=6 in Go's Weekday. Convert so Monday=0 by
	// treating Sunday as day 6 of the previous week.
	weekday := int(utc.Weekday()) - 1
	if weekday < 0 {
		weekday = 6
	}
	monday := time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC).
		Add(-time.Duration(weekday) * 24 * time.Hour)
	return monday
}

// GetAIContentWriterQuota returns the caller's current weekly quota
// window for the AI Content Writer. Called by:
//   - Express /api/ai-content-writer/generate-content BEFORE calling
//     Gemini, to decide whether to 402 the request
//   - Frontend on page load, to render the "2 of 2 free left" badge
//
// GET /api/v1/ai-content-writer/quota  (auth required)
func (h *Handlers) GetAIContentWriterQuota(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	isPro := billing.IsUserPro(h.db, userID)

	weekStart := startOfISOWeek(time.Now())
	weekEnd := weekStart.Add(7 * 24 * time.Hour)

	// Count successful content-writer requests in the current week.
	// The event is only written on generation success, so this count IS
	// the quota consumed (failed calls don't count against the user).
	var used int64
	if err := h.db.Model(&models.ActivityEvent{}).
		Where("user_id = ? AND event_type = ? AND occurred_at >= ? AND occurred_at < ?",
			userID,
			models.EventAIContentWriterRequest,
			weekStart,
			weekEnd,
		).Count(&used).Error; err != nil {
		// Non-fatal — if the count fails, assume zero so we don't
		// accidentally lock the user out. The consume endpoint is the
		// authoritative write; this endpoint is advisory display state.
		used = 0
	}

	limit := contentWriterFreeWeeklyLimit
	if isPro {
		limit = contentWriterProWeeklyLimit
	}
	remaining := limit - int(used)
	if remaining < 0 {
		remaining = 0
	}

	c.JSON(http.StatusOK, contentWriterQuotaResponse{
		IsPro:     isPro,
		Used:      used,
		Limit:     limit,
		Remaining: remaining,
		ResetsAt:  weekEnd,
		WeekStart: weekStart,
	})
}

// ConsumeAIContentWriterQuota records ONE successful AI Content Writer
// generation for the caller. Written to activity_events as a
// fire-and-forget row so subsequent quota reads see the incremented
// count on the next weekly window query.
//
// Called by Express AFTER a successful generation. Not called for
// failed generations — those don't consume quota.
//
// POST /api/v1/ai-content-writer/consume  (auth required)
//
// Response is intentionally minimal — the client's next quota read
// picks up the new state. This keeps this endpoint idempotent-safe:
// a duplicate call from a retrying Express layer costs the user one
// extra quota unit but doesn't block them from anything they weren't
// already about to hit.
func (h *Handlers) ConsumeAIContentWriterQuota(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Optional payload for observability (content_type, language,
	// word_count). Not required — the row is written even without it.
	var payload struct {
		ContentType string `json:"content_type"`
		Language    string `json:"language"`
		WordCount   int    `json:"word_count"`
	}
	_ = c.ShouldBindJSON(&payload)

	metadata := map[string]any{
		"source": "ai_content_writer",
	}
	if payload.ContentType != "" {
		metadata["content_type"] = payload.ContentType
	}
	if payload.Language != "" {
		metadata["language"] = payload.Language
	}
	if payload.WordCount > 0 {
		metadata["word_count"] = payload.WordCount
	}

	h.activityLogger.Log(userID, models.EventAIContentWriterRequest, metadata)

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
