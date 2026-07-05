package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"tamil-proofreading-platform/backend/internal/models"
	emailsvc "tamil-proofreading-platform/backend/internal/services/email"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
)

// AdminSendUserEmail sends a one-off email to a specific user from the
// admin console. Uses the existing Resend-backed email service (same
// transport as password reset + receipts).
//
// Always logs to BillingAuditLog for compliance — every email sent by
// an admin is captured with subject + who + when. Body is NOT stored
// (could be many KB, could contain user info we don't want persisted
// beyond the send).
//
// POST /admin/users/:id/email
// Body: { subject: string, html: string }
//
// Returns 200 { sent: true } on success. Failures return 5xx so the
// frontend can surface the error to the admin instead of silently
// pretending the email went out.
func (h *Handlers) AdminSendUserEmail(c *gin.Context) {
	idStr := c.Param("id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || targetID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var payload struct {
		Subject string `json:"subject"`
		HTML    string `json:"html"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}
	payload.Subject = strings.TrimSpace(payload.Subject)
	if payload.Subject == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject is required"})
		return
	}
	if strings.TrimSpace(payload.HTML) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "html body is required"})
		return
	}

	// Resolve target user
	var target models.User
	if err := h.db.First(&target, targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "target user not found"})
		return
	}
	if strings.TrimSpace(target.Email) == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "target user has no email"})
		return
	}

	// Actor (the admin) — set by AuthMiddleware upstream.
	actorID, _ := c.Get("user_id")
	actorEmail, _ := c.Get("user_email")

	// Send
	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "email service not configured"})
		return
	}
	if err := svc.SendEmail(target.Email, payload.Subject, payload.HTML); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "email send failed", "details": err.Error()})
		return
	}

	// Audit — best effort. If the write fails we don't unwind the send;
	// we log the audit failure and return success (the email did go out).
	audit := models.BillingAuditLog{
		ActorUserID:  toUint(actorID),
		Action:       "admin_email_sent",
		TargetUserID: uintPtr(uint(targetID)),
		ResourceType: "user",
		NewValue:     datatypes.JSON(fmt.Sprintf(`{"subject":%q,"actor_email":%q,"recipient_email":%q}`, payload.Subject, fmt.Sprint(actorEmail), target.Email)),
		IPAddress:    c.ClientIP(),
		UserAgent:    c.GetHeader("User-Agent"),
	}
	if err := h.db.Create(&audit).Error; err != nil {
		// Non-fatal for the admin flow but we surface it in the response
		// so ops can investigate if audit writes are broken.
		c.JSON(http.StatusOK, gin.H{
			"sent":         true,
			"audit_logged": false,
			"audit_error":  err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"sent": true, "audit_logged": true})
}

func toUint(v any) uint {
	if u, ok := v.(uint); ok {
		return u
	}
	if f, ok := v.(float64); ok {
		return uint(f)
	}
	return 0
}

func uintPtr(v uint) *uint { return &v }
