package handlers

import (
	"net/http"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// GetDashboardStats returns dashboard statistics for user
func (h *Handlers) GetDashboardStats(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	// Get total submissions
	var totalSubmissions int64
	h.db.Model(&models.Submission{}).Where("user_id = ?", userID).Count(&totalSubmissions)

	// Get monthly word usage
	var monthlyWordUsage int
	h.db.Model(&models.Usage{}).
		Where("user_id = ? AND date >= ?", userID, startOfMonth).
		Select("COALESCE(SUM(word_count), 0)").
		Scan(&monthlyWordUsage)

	// Get model usage breakdown
	var modelAUsage int
	var modelBUsage int
	h.db.Model(&models.Usage{}).
		Where("user_id = ? AND date >= ? AND model_used = ?", userID, startOfMonth, models.ModelA).
		Select("COALESCE(SUM(word_count), 0)").
		Scan(&modelAUsage)
	h.db.Model(&models.Usage{}).
		Where("user_id = ? AND date >= ? AND model_used = ?", userID, startOfMonth, models.ModelB).
		Select("COALESCE(SUM(word_count), 0)").
		Scan(&modelBUsage)

	// Get pending/completed submissions count
	var pendingCount int64
	var completedCount int64
	h.db.Model(&models.Submission{}).
		Where("user_id = ? AND status = ?", userID, models.StatusPending).
		Count(&pendingCount)
	h.db.Model(&models.Submission{}).
		Where("user_id = ? AND status = ?", userID, models.StatusCompleted).
		Count(&completedCount)

	// Get recent submissions
	var recentSubmissions []models.Submission
	h.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(5).
		Find(&recentSubmissions)

	// Get user subscription info
	var user models.User
	h.db.First(&user, userID)

	c.JSON(http.StatusOK, gin.H{
		"total_submissions":  totalSubmissions,
		"monthly_word_usage": monthlyWordUsage,
		"model_usage": gin.H{
			"model_a": modelAUsage,
			"model_b": modelBUsage,
		},
		"submissions_status": gin.H{
			"pending":   pendingCount,
			"completed": completedCount,
		},
		"recent_submissions": recentSubmissions,
		"subscription": gin.H{
			"plan":           user.Subscription,
			"subscription_end": user.SubscriptionEnd,
		},
	})
}

// GetUsage returns usage statistics
func (h *Handlers) GetUsage(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get usage for last 30 days
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)

	var usage []models.Usage
	h.db.Where("user_id = ? AND date >= ?", userID, thirtyDaysAgo).
		Order("date DESC").
		Find(&usage)

	c.JSON(http.StatusOK, gin.H{"usage": usage})
}

