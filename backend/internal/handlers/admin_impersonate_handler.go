package handlers

import (
	"net/http"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/datatypes"
)

// impersonationTokenTTL bounds the maximum time an admin can impersonate
// another user. Short by design — impersonation is for triaging a bug
// report or reproducing a user issue, not for daily use. The admin can
// re-issue if they need more time.
const impersonationTokenTTL = 30 * time.Minute

// AdminStartImpersonation issues a short-lived JWT that lets the admin
// browse the site as a specific user. The token carries an
// `impersonated_by` claim so the audit trail records every action taken
// during the session.
//
// Security constraints enforced here:
//
//   - Target must exist, be active, and NOT be an admin themselves
//     (never allow an admin to impersonate another admin — the target's
//     admin privileges would apply, and it becomes a confused-deputy
//     footgun).
//   - Actor must be the admin (already enforced by AdminMiddleware
//     upstream; we re-read the user_id from context here for the audit
//     log).
//   - Token TTL is fixed at 30 min; the frontend enforces this too.
//
// POST /admin/users/:id/impersonate
// Returns: { access_token, expires_at, target: { id, email, name } }
func (h *Handlers) AdminStartImpersonation(c *gin.Context) {
	targetIDStr := c.Param("id")
	targetID, err := strconv.ParseUint(targetIDStr, 10, 64)
	if err != nil || targetID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var target models.User
	if err := h.db.First(&target, targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "target user not found"})
		return
	}
	if !target.IsActive {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "target user is disabled"})
		return
	}
	if target.Role == models.RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot impersonate another admin"})
		return
	}

	actorID := toUint(func() any { v, _ := c.Get("user_id"); return v }())
	if actorID == 0 || uint64(actorID) == targetID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot impersonate yourself"})
		return
	}

	// Issue the impersonation JWT. Same shape as GenerateAccessToken so
	// existing AuthMiddleware validates it transparently, PLUS an
	// impersonated_by claim so audit paths can distinguish real user
	// activity from admin-driven activity.
	expiresAt := time.Now().Add(impersonationTokenTTL)
	claims := jwt.MapClaims{
		"user_id":         target.ID,
		"email":           target.Email,
		"role":            string(target.Role),
		"exp":             expiresAt.Unix(),
		"iat":             time.Now().Unix(),
		"impersonated_by": actorID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token sign failed"})
		return
	}

	// Audit
	audit := models.BillingAuditLog{
		ActorUserID:  actorID,
		Action:       "admin_impersonation_started",
		TargetUserID: uintPtr(uint(targetID)),
		ResourceType: "user",
		NewValue:     datatypes.JSON(`{"ttl_minutes":30}`),
		IPAddress:    c.ClientIP(),
		UserAgent:    c.GetHeader("User-Agent"),
	}
	if err := h.db.Create(&audit).Error; err != nil {
		// Non-fatal for the session start; log inline for ops.
		c.JSON(http.StatusOK, gin.H{
			"access_token": signed,
			"expires_at":   expiresAt,
			"target": gin.H{"id": target.ID, "email": target.Email, "name": target.Name},
			"audit_logged": false,
			"audit_error":  err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": signed,
		"expires_at":   expiresAt,
		"target":       gin.H{"id": target.ID, "email": target.Email, "name": target.Name},
		"audit_logged": true,
	})
}

// AdminEndImpersonation logs the end-of-session for audit. The actual
// cookie swap happens on the frontend; this endpoint exists so the
// audit trail is symmetric (start + end pair).
//
// POST /admin/impersonation/end
// Body: { target_id }
func (h *Handlers) AdminEndImpersonation(c *gin.Context) {
	// The actor here is the ADMIN, not the impersonated user — this
	// endpoint is called from the admin console after the cookie has
	// been swapped back to the admin's original token. See the frontend
	// wiring for the swap logic.
	var body struct {
		TargetID uint `json:"target_id"`
	}
	_ = c.ShouldBindJSON(&body)
	actorID := toUint(func() any { v, _ := c.Get("user_id"); return v }())

	audit := models.BillingAuditLog{
		ActorUserID:  actorID,
		Action:       "admin_impersonation_ended",
		TargetUserID: &body.TargetID,
		ResourceType: "user",
		IPAddress:    c.ClientIP(),
		UserAgent:    c.GetHeader("User-Agent"),
	}
	if err := h.db.Create(&audit).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"audit_logged": false, "audit_error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"audit_logged": true})
}
