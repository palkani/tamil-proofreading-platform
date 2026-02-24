package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/affiliate"

	"github.com/gin-gonic/gin"
)

// ==================== ADMIN ENDPOINTS ====================

// AdminCreateAffiliate creates a new affiliate from an existing user
// POST /admin/affiliates
func (h *Handlers) AdminCreateAffiliate(c *gin.Context) {
	var req struct {
		UserID         uint     `json:"user_id" binding:"required"`
		CommissionRate *float64 `json:"commission_rate"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	adminUserID, _ := getUserIDFromContext(c)
	
	svc := affiliate.NewAffiliateService(h.db)
	aff, err := svc.CreateAffiliate(adminUserID, req.UserID, req.CommissionRate)
	if err != nil {
		if errors.Is(err, affiliate.ErrUserNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		if errors.Is(err, affiliate.ErrUserAlreadyAffiliate) {
			c.JSON(http.StatusConflict, gin.H{"error": "User is already an affiliate"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create affiliate", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success":   true,
		"affiliate": aff,
		"referral_link": "https://prooftamil.com/?ref=" + aff.AffiliateCode,
	})
}

// AdminListAffiliates lists all affiliates with their stats
// GET /admin/affiliates
func (h *Handlers) AdminListAffiliates(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	svc := affiliate.NewAffiliateService(h.db)
	affiliates, total, err := svc.ListAffiliates(page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list affiliates"})
		return
	}

	// Enrich with stats
	type AffiliateWithStats struct {
		models.Affiliate
		Stats        *models.AffiliateStats `json:"stats"`
		ReferralLink string                 `json:"referral_link"`
	}

	enriched := make([]AffiliateWithStats, len(affiliates))
	for i, aff := range affiliates {
		stats, _ := svc.GetAffiliateStats(aff.ID)
		enriched[i] = AffiliateWithStats{
			Affiliate:    aff,
			Stats:        stats,
			ReferralLink: "https://prooftamil.com/?ref=" + aff.AffiliateCode,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"affiliates": enriched,
		"pagination": gin.H{
			"page":  page,
			"limit": limit,
			"total": total,
		},
	})
}

// AdminUpdateAffiliateStatus updates an affiliate's status
// PATCH /admin/affiliates/:id/status
func (h *Handlers) AdminUpdateAffiliateStatus(c *gin.Context) {
	idStr := c.Param("id")
	affiliateID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid affiliate ID"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	var status models.AffiliateStatus
	switch req.Status {
	case "active", "ACTIVE":
		status = models.AffiliateStatusActive
	case "paused", "PAUSED":
		status = models.AffiliateStatusPaused
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status. Must be 'active' or 'paused'"})
		return
	}

	adminUserID, _ := getUserIDFromContext(c)
	svc := affiliate.NewAffiliateService(h.db)

	if err := svc.UpdateStatus(adminUserID, uint(affiliateID), status); err != nil {
		if errors.Is(err, affiliate.ErrAffiliateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Affiliate not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "status": status})
}

// AdminRegenerateAffiliateCode generates a new code for an affiliate
// POST /admin/affiliates/:id/regenerate-code
func (h *Handlers) AdminRegenerateAffiliateCode(c *gin.Context) {
	idStr := c.Param("id")
	affiliateID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid affiliate ID"})
		return
	}

	adminUserID, _ := getUserIDFromContext(c)
	svc := affiliate.NewAffiliateService(h.db)

	aff, err := svc.RegenerateCode(adminUserID, uint(affiliateID))
	if err != nil {
		if errors.Is(err, affiliate.ErrAffiliateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Affiliate not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to regenerate code"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"new_code":      aff.AffiliateCode,
		"referral_link": "https://prooftamil.com/?ref=" + aff.AffiliateCode,
	})
}

// ==================== AFFILIATE USER ENDPOINTS ====================

// AffiliateGetMe gets the current user's affiliate info
// GET /affiliate/me
func (h *Handlers) AffiliateGetMe(c *gin.Context) {
	userID, ok := getUserIDFromContext(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	svc := affiliate.NewAffiliateService(h.db)
	aff, err := svc.GetAffiliateByUserID(userID)
	if err != nil {
		if errors.Is(err, affiliate.ErrAffiliateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "You are not an affiliate", "is_affiliate": false})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get affiliate info"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"is_affiliate":  true,
		"affiliate":     aff,
		"referral_link": "https://prooftamil.com/?ref=" + aff.AffiliateCode,
	})
}

// AffiliateGetStats gets the current user's affiliate statistics
// GET /affiliate/stats
func (h *Handlers) AffiliateGetStats(c *gin.Context) {
	userID, ok := getUserIDFromContext(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	svc := affiliate.NewAffiliateService(h.db)
	aff, err := svc.GetAffiliateByUserID(userID)
	if err != nil {
		if errors.Is(err, affiliate.ErrAffiliateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "You are not an affiliate"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get affiliate info"})
		return
	}

	stats, err := svc.GetAffiliateStats(aff.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get stats"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"affiliate":     aff,
		"stats":         stats,
		"referral_link": "https://prooftamil.com/?ref=" + aff.AffiliateCode,
	})
}

// AffiliateGetEarnings gets the current user's earnings breakdown
// GET /affiliate/earnings
func (h *Handlers) AffiliateGetEarnings(c *gin.Context) {
	userID, ok := getUserIDFromContext(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	months, _ := strconv.Atoi(c.DefaultQuery("months", "12"))

	svc := affiliate.NewAffiliateService(h.db)
	aff, err := svc.GetAffiliateByUserID(userID)
	if err != nil {
		if errors.Is(err, affiliate.ErrAffiliateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "You are not an affiliate"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get affiliate info"})
		return
	}

	earnings, err := svc.GetMonthlyEarnings(aff.ID, months)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get earnings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"total_earnings":  aff.TotalEarnings,
		"paid_earnings":   aff.PaidEarnings,
		"pending_earnings": aff.TotalEarnings - aff.PaidEarnings,
		"monthly_breakdown": earnings,
	})
}
