package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminGetActivity returns a paginated, filterable feed of ActivityEvent
// rows joined against the users table so the admin console can render
// "user X did Y at time Z" without a per-row lookup.
//
// Query params:
//
//	event_type   partial match, case-insensitive (e.g. 'login', 'ai_')
//	user_id      exact match
//	email        partial match on users.email (case-insensitive)
//	since_hours  restrict to events in the last N hours (default 168 = 7 days)
//	limit        default 50, capped at 200
//	offset       default 0
//
// Response shape is optimized for direct table rendering — flat rows
// with user identity denormalized in.
func (h *Handlers) AdminGetActivity(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}

	sinceHours, _ := strconv.Atoi(c.DefaultQuery("since_hours", "168"))
	if sinceHours < 1 {
		sinceHours = 168
	}
	if sinceHours > 24*365 {
		sinceHours = 24 * 365 // hard cap at 1 year
	}
	since := time.Now().Add(-time.Duration(sinceHours) * time.Hour)

	// Base query — join once so the row rendering doesn't fan out into
	// per-event user lookups.
	base := h.db.Table("activity_events").
		Joins("LEFT JOIN users ON users.id = activity_events.user_id").
		Where("activity_events.occurred_at >= ?", since)

	if v := strings.TrimSpace(c.Query("event_type")); v != "" {
		base = base.Where("activity_events.event_type ILIKE ?", "%"+v+"%")
	}
	if v := strings.TrimSpace(c.Query("email")); v != "" {
		base = base.Where("users.email ILIKE ?", "%"+v+"%")
	}
	if v := strings.TrimSpace(c.Query("user_id")); v != "" {
		if id, err := strconv.ParseUint(v, 10, 64); err == nil && id > 0 {
			base = base.Where("activity_events.user_id = ?", id)
		}
	}

	var total int64
	base.Session(&gorm.Session{}).Count(&total)

	type row struct {
		ID         uint      `json:"id"`
		UserID     uint      `json:"user_id"`
		Email      string    `json:"email"`
		EventType  string    `json:"event_type"`
		Metadata   string    `json:"metadata,omitempty"`
		OccurredAt time.Time `json:"occurred_at"`
	}
	var rows []row
	base.
		Select("activity_events.id, activity_events.user_id, users.email, activity_events.event_type, activity_events.metadata::text AS metadata, activity_events.occurred_at").
		Order("activity_events.occurred_at DESC").
		Limit(limit).
		Offset(offset).
		Scan(&rows)

	c.JSON(http.StatusOK, gin.H{
		"activity":     rows,
		"total":        total,
		"limit":        limit,
		"offset":       offset,
		"since_hours":  sinceHours,
	})
}
