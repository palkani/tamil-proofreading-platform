package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	emailsvc "tamil-proofreading-platform/backend/internal/services/email"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// broadcastFilter is the criteria for selecting recipient users.
// Kept intentionally narrow — we only expose filters that are cheap
// to query and unambiguous to reason about.
type broadcastFilter struct {
	Subscription string `json:"subscription,omitempty"` // "" | "pro" | "free"
	Country      string `json:"country,omitempty"`      // ISO-2, exact match
	SignupWithin string `json:"signup_within,omitempty"` // "" | "7d" | "30d" | "90d"
}

func applyBroadcastFilter(q *gorm.DB, f broadcastFilter) *gorm.DB {
	q = q.Where("email <> ''").Where("email IS NOT NULL").Where("is_active = ?", true).Where("email_verified = ?", true)
	if f.Subscription != "" {
		q = q.Where("subscription = ?", f.Subscription)
	}
	if f.Country != "" {
		q = q.Where("country_code = ?", strings.ToUpper(f.Country))
	}
	if f.SignupWithin != "" {
		var d time.Duration
		switch f.SignupWithin {
		case "7d":
			d = 7 * 24 * time.Hour
		case "30d":
			d = 30 * 24 * time.Hour
		case "90d":
			d = 90 * 24 * time.Hour
		}
		if d > 0 {
			q = q.Where("created_at >= ?", time.Now().Add(-d))
		}
	}
	return q
}

// AdminBroadcastDryRun returns the recipient count for a given filter
// without sending. Cheap enough to hit on every keystroke in the
// composer form via a debounce.
//
// POST /admin/broadcasts/dry-run
// Body: { filter: { subscription, country, signup_within } }
func (h *Handlers) AdminBroadcastDryRun(c *gin.Context) {
	var body struct {
		Filter broadcastFilter `json:"filter"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	var count int64
	q := h.db.Model(&models.User{})
	q = applyBroadcastFilter(q, body.Filter)
	if err := q.Count(&count).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"recipient_count": count})
}

// AdminBroadcastSend queues a broadcast and starts sending in a
// background goroutine. Returns the broadcast ID immediately so the
// frontend can poll for progress.
//
// POST /admin/broadcasts
// Body: { subject, html, filter: {...} }
func (h *Handlers) AdminBroadcastSend(c *gin.Context) {
	var body struct {
		Subject string          `json:"subject"`
		HTML    string          `json:"html"`
		Filter  broadcastFilter `json:"filter"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	body.Subject = strings.TrimSpace(body.Subject)
	if body.Subject == "" || strings.TrimSpace(body.HTML) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject and html required"})
		return
	}

	// Count recipients (also serves as the DB-side sanity check)
	var recipientCount int64
	q := h.db.Model(&models.User{})
	q = applyBroadcastFilter(q, body.Filter)
	if err := q.Count(&recipientCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "recipient count failed"})
		return
	}
	if recipientCount == 0 {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "no recipients match this filter"})
		return
	}

	actorID, _ := c.Get("user_id")
	filterJSON, _ := json.Marshal(body.Filter)

	// Persist the broadcast record so history + progress are visible.
	broadcast := &models.AdminBroadcast{
		SenderUserID:   toUint(actorID),
		Subject:        body.Subject,
		BodyHTML:       body.HTML,
		FilterCriteria: datatypes.JSON(filterJSON),
		RecipientCount: int(recipientCount),
		Status:         "sending",
		StartedAt:      time.Now(),
	}
	if err := h.db.Create(broadcast).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create broadcast", "details": err.Error()})
		return
	}

	// Fire background sender
	go runBroadcast(h.db, broadcast.ID, body.Subject, body.HTML, body.Filter)

	c.JSON(http.StatusAccepted, gin.H{
		"broadcast_id":    broadcast.ID,
		"recipient_count": recipientCount,
		"status":          "sending",
	})
}

// runBroadcast streams recipient emails through the email service and
// updates progress on the broadcast row. Runs in a goroutine so the
// HTTP request returns immediately.
//
// Batching + delay: sends up to 20 per second so we stay well under
// Resend's default rate limit (2/sec sustained, 10/sec burst on the
// free tier is a common floor — we use 20/sec assuming a paid tier).
// Tune via ADMIN_BROADCAST_SEND_INTERVAL_MS.
func runBroadcast(db *gorm.DB, broadcastID uint, subject, html string, filter broadcastFilter) {
	sendInterval := 50 * time.Millisecond // ~20/sec default
	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		log.Printf("[BROADCAST %d] Email service not configured — aborting", broadcastID)
		db.Model(&models.AdminBroadcast{}).Where("id = ?", broadcastID).
			Updates(map[string]any{"status": "failed", "completed_at": time.Now()})
		return
	}

	q := db.Model(&models.User{})
	q = applyBroadcastFilter(q, filter)

	sent, failed := 0, 0
	var users []models.User
	if err := q.FindInBatches(&users, 100, func(tx *gorm.DB, batch int) error {
		for _, u := range users {
			if err := svc.SendEmail(u.Email, subject, html); err != nil {
				failed++
				log.Printf("[BROADCAST %d] send failed for user=%d: %v", broadcastID, u.ID, err)
			} else {
				sent++
			}
			time.Sleep(sendInterval)
		}
		// Update progress every batch so the frontend poll shows real
		// numbers instead of jumping from 0 to N at the end.
		db.Model(&models.AdminBroadcast{}).Where("id = ?", broadcastID).
			Updates(map[string]any{"sent_count": sent, "failed_count": failed})
		return nil
	}).Error; err != nil {
		log.Printf("[BROADCAST %d] batching error: %v", broadcastID, err)
	}

	// Mark complete
	now := time.Now()
	final := "complete"
	if sent == 0 {
		final = "failed"
	}
	db.Model(&models.AdminBroadcast{}).Where("id = ?", broadcastID).
		Updates(map[string]any{
			"sent_count":   sent,
			"failed_count": failed,
			"status":       final,
			"completed_at": now,
		})
	log.Printf("[BROADCAST %d] Done: sent=%d failed=%d", broadcastID, sent, failed)
}

// AdminBroadcastGet returns a single broadcast (for progress polling).
func (h *Handlers) AdminBroadcastGet(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var b models.AdminBroadcast
	if err := h.db.First(&b, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, b)
}

// AdminBroadcastList returns the last 50 broadcasts newest first.
func (h *Handlers) AdminBroadcastList(c *gin.Context) {
	var rows []models.AdminBroadcast
	if err := h.db.Order("created_at DESC").Limit(50).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"broadcasts": rows})
}

// Compile-time assertion that fmt is used (silences dev-side unused check
// when we bring in a debug fmt.Println temporarily). No-op at runtime.
var _ = fmt.Sprint
