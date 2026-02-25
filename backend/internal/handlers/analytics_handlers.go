package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// LogActivityRequest represents a user activity event
type LogActivityRequest struct {
	EventType string                 `json:"event_type" binding:"required"`
	Metadata  map[string]interface{} `json:"metadata"`
}

// LogActivity logs a user activity event
func (h *Handlers) LogActivity(c *gin.Context) {
	var req LogActivityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Get user ID (required for activity events)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	uid, ok := userID.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID"})
		return
	}

	// Convert metadata to JSON
	metadataJSON, err := json.Marshal(req.Metadata)
	if err != nil {
		metadataJSON = []byte("{}")
	}

	activityEvent := models.ActivityEvent{
		UserID:     uid,
		EventType:  models.ActivityEventType(req.EventType),
		Metadata:   string(metadataJSON),
		OccurredAt: time.Now(),
	}

	if err := h.db.Create(&activityEvent).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"logged": false})
		return
	}

	c.JSON(http.StatusOK, gin.H{"logged": true})
}

// GetAnalyticsDashboard returns analytics data for admin dashboard
func (h *Handlers) GetAnalyticsDashboard(c *gin.Context) {
	// Get date range from query params (default: last 30 days)
	days := 30
	if daysParam := c.Query("days"); daysParam != "" {
		if d, err := strconv.Atoi(daysParam); err == nil && d > 0 {
			days = d
		}
	}

	startDate := time.Now().AddDate(0, 0, -days)

	// Get daily visit stats
	var dailyVisitStats []models.DailyVisitStats
	h.db.Where("date >= ?", startDate).Order("date ASC").Find(&dailyVisitStats)

	// Get daily activity stats
	var dailyActivityStats []models.DailyActivityStats
	h.db.Where("date >= ?", startDate).Order("date ASC").Find(&dailyActivityStats)

	// Get recent visits (last 100)
	var recentVisits []models.VisitEvent
	h.db.Preload("User").Order("occurred_at DESC").Limit(100).Find(&recentVisits)

	// Get recent activities (last 100)
	var recentActivities []models.ActivityEvent
	h.db.Preload("User").Order("occurred_at DESC").Limit(100).Find(&recentActivities)

	// Get summary stats
	var totalVisits int64
	var totalActivities int64
	var uniqueUsers int64

	h.db.Model(&models.VisitEvent{}).Where("occurred_at >= ?", startDate).Count(&totalVisits)
	h.db.Model(&models.ActivityEvent{}).Where("occurred_at >= ?", startDate).Count(&totalActivities)
	h.db.Model(&models.User{}).Where("created_at >= ?", startDate).Count(&uniqueUsers)

	// Get top pages
	type PageStats struct {
		Route string
		Count int64
	}
	var topPages []PageStats
	h.db.Model(&models.VisitEvent{}).
		Select("route, COUNT(*) as count").
		Where("occurred_at >= ?", startDate).
		Group("route").
		Order("count DESC").
		Limit(10).
		Scan(&topPages)

	// Get active users count (users who logged in today)
	var activeUsersToday int64
	today := time.Now().Truncate(24 * time.Hour)
	h.db.Model(&models.ActivityEvent{}).
		Where("event_type = ? AND occurred_at >= ?", models.EventLogin, today).
		Distinct("user_id").
		Count(&activeUsersToday)

	c.JSON(http.StatusOK, gin.H{
		"summary": gin.H{
			"total_visits":       totalVisits,
			"total_activities":   totalActivities,
			"new_users":          uniqueUsers,
			"active_users_today": activeUsersToday,
		},
		"daily_visits":      dailyVisitStats,
		"daily_activities":  dailyActivityStats,
		"recent_visits":     recentVisits,
		"recent_activities": recentActivities,
		"top_pages":         topPages,
	})
}

// NOTE: Visit logging endpoint (/api/v1/events/visit) has been removed.
// Any remaining analytics features are based on activity events only.
