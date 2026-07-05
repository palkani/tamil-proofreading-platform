package handlers

import (
	"net/http"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// AdminGetUsers returns a paginated, filterable list of users for the
// admin console. Never leaks password_hash or verification tokens.
//
// Query params:
//
//	email        partial, case-insensitive email match
//	subscription 'pro' | 'free' — exact match on users.subscription
//	country      ISO-2 country code, exact match
//	sort         'created_desc' (default) | 'created_asc' | 'email' | 'last_active'
//	limit        default 25, capped at 100
//	offset       default 0
//
// Rich response includes the fields the admin console needs to filter
// and act on a row without a follow-up request (subscription state,
// end date, country, active flag, verification, admin flag).
func (h *Handlers) AdminGetUsers(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	if limit < 1 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}

	query := h.db.Model(&models.User{})
	if v := c.Query("email"); v != "" {
		query = query.Where("LOWER(email) LIKE LOWER(?)", "%"+v+"%")
	}
	if v := c.Query("subscription"); v != "" {
		query = query.Where("subscription = ?", v)
	}
	if v := c.Query("country"); v != "" {
		query = query.Where("country_code = ?", v)
	}

	var total int64
	query.Count(&total)

	switch c.DefaultQuery("sort", "created_desc") {
	case "created_asc":
		query = query.Order("created_at ASC")
	case "email":
		query = query.Order("email ASC")
	case "last_active":
		// Left-join derived table would be more correct, but for now sort
		// by updated_at as a reasonable proxy (it moves on any user change,
		// including login token bumps).
		query = query.Order("updated_at DESC")
	default:
		query = query.Order("created_at DESC")
	}

	var users []models.User
	query.Limit(limit).Offset(offset).Find(&users)

	// Explicit response shape so we never accidentally serialize a new
	// sensitive field added to User later.
	type row struct {
		ID              uint      `json:"id"`
		Email           string    `json:"email"`
		Name            string    `json:"name"`
		Role            string    `json:"role"`
		Subscription    string    `json:"subscription"`
		SubscriptionEnd *time.Time `json:"subscription_end,omitempty"`
		CountryCode     string    `json:"country_code,omitempty"`
		IsActive        bool      `json:"is_active"`
		EmailVerified   bool      `json:"email_verified"`
		PremiumOverride bool      `json:"premium_override"`
		CreatedAt       time.Time `json:"created_at"`
	}
	out := make([]row, len(users))
	for i, u := range users {
		out[i] = row{
			ID:              u.ID,
			Email:           u.Email,
			Name:            u.Name,
			Role:            string(u.Role),
			Subscription:    string(u.Subscription),
			SubscriptionEnd: u.SubscriptionEnd,
			IsActive:        u.IsActive,
			EmailVerified:   u.EmailVerified,
			PremiumOverride: u.PremiumOverride,
			CreatedAt:       u.CreatedAt,
		}
		if u.CountryCode != nil {
			out[i].CountryCode = *u.CountryCode
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"users":  out,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// AdminUpdateUser updates a user (admin only)
func (h *Handlers) AdminUpdateUser(c *gin.Context) {
	userID := c.Param("id")

	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var updateData struct {
		Role         *models.UserRole         `json:"role"`
		Subscription *models.SubscriptionPlan `json:"subscription"`
		IsActive     *bool                    `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if updateData.Role != nil {
		user.Role = *updateData.Role
	}
	if updateData.Subscription != nil {
		user.Subscription = *updateData.Subscription
	}
	if updateData.IsActive != nil {
		user.IsActive = *updateData.IsActive
	}

	if err := h.db.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": user})
}

// AdminDeleteUser deletes a user (admin only)
func (h *Handlers) AdminDeleteUser(c *gin.Context) {
	userID := c.Param("id")

	if err := h.db.Delete(&models.User{}, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}

// AdminGetPayments retrieves all payments (admin only)
func (h *Handlers) AdminGetPayments(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "20")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)

	var payments []models.Payment
	var total int64

	h.db.Model(&models.Payment{}).Count(&total)
	h.db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&payments)

	c.JSON(http.StatusOK, gin.H{
		"payments": payments,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// AdminGetAnalytics returns analytics data (admin only)
func (h *Handlers) AdminGetAnalytics(c *gin.Context) {
	// Total users
	var totalUsers int64
	h.db.Model(&models.User{}).Count(&totalUsers)

	// Active users (last 30 days)
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
	var activeUsers int64
	h.db.Model(&models.Usage{}).
		Where("date >= ?", thirtyDaysAgo).
		Distinct("user_id").
		Count(&activeUsers)

	// Total submissions
	var totalSubmissions int64
	h.db.Model(&models.Submission{}).Count(&totalSubmissions)

	// Total revenue
	var totalRevenue float64
	h.db.Model(&models.Payment{}).
		Where("status = ?", models.PaymentStatusCompleted).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&totalRevenue)

	// Monthly revenue
	startOfMonth := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Now().Location())
	var monthlyRevenue float64
	h.db.Model(&models.Payment{}).
		Where("status = ? AND created_at >= ?", models.PaymentStatusCompleted, startOfMonth).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&monthlyRevenue)

	// Model usage
	var modelAUsage int64
	var modelBUsage int64
	h.db.Model(&models.Submission{}).
		Where("model_used = ?", models.ModelA).
		Count(&modelAUsage)
	h.db.Model(&models.Submission{}).
		Where("model_used = ?", models.ModelB).
		Count(&modelBUsage)

	c.JSON(http.StatusOK, gin.H{
		"total_users":      totalUsers,
		"active_users":     activeUsers,
		"total_submissions": totalSubmissions,
		"revenue": gin.H{
			"total":   totalRevenue,
			"monthly": monthlyRevenue,
		},
		"model_usage": gin.H{
			"model_a": modelAUsage,
			"model_b": modelBUsage,
		},
	})
}

// AdminGetModelLogs returns model performance logs (admin only)
func (h *Handlers) AdminGetModelLogs(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)

	var submissions []models.Submission
	h.db.Where("status = ?", models.StatusCompleted).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&submissions)

	c.JSON(http.StatusOK, gin.H{
		"logs": submissions,
		"limit": limit,
		"offset": offset,
	})
}

