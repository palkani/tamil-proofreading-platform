package handlers

import (
        "crypto/sha256"
        "encoding/hex"
        "encoding/json"
        "net/http"
        "strings"
        "time"

        "tamil-proofreading-platform/backend/internal/models"

        "github.com/gin-gonic/gin"
)

// LogVisitRequest represents a page visit event
type LogVisitRequest struct {
        Route      string `json:"route" binding:"required"`
        Referrer   string `json:"referrer"`
        UserAgent  string `json:"user_agent"`
        DeviceType string `json:"device_type"`
        UserID     *uint  `json:"user_id"` // Optional user ID from session
}

// LogActivityRequest represents a user activity event
type LogActivityRequest struct {
        EventType string                 `json:"event_type" binding:"required"`
        Metadata  map[string]interface{} `json:"metadata"`
}

// LogVisit logs a page visit event
func (h *Handlers) LogVisit(c *gin.Context) {
        var req LogVisitRequest
        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
                return
        }

        // Get session ID from cookie or generate new one
        sessionID, err := c.Cookie("session_id")
        if err != nil || sessionID == "" {
                // Generate new session ID
                sessionID = generateSessionID()
                c.SetCookie("session_id", sessionID, 3600*24*30, "/", "", false, true)
        }

        // Get user ID from request body (from session) or context
        var userID *uint
        if req.UserID != nil {
                userID = req.UserID
        } else if uid, exists := c.Get("user_id"); exists {
                if id, ok := uid.(uint); ok {
                        userID = &id
                }
        }

        // Truncate IP for privacy (first 3 octets only)
        truncatedIP := truncateIP(c.ClientIP())

        // Hash user agent for privacy
        userAgentHash := hashString(req.UserAgent)

        // Clean referrer (remove query params)
        referrer := cleanReferrer(req.Referrer)

        visitEvent := models.VisitEvent{
                SessionID:     sessionID,
                UserID:        userID,
                Route:         req.Route,
                Referrer:      referrer,
                TruncatedIP:   truncatedIP,
                UserAgentHash: userAgentHash,
                DeviceType:    req.DeviceType,
                OccurredAt:    time.Now(),
        }

        if err := h.db.Create(&visitEvent).Error; err != nil {
                // Log error but don't fail the request
                c.JSON(http.StatusOK, gin.H{"logged": false})
                return
        }

        c.JSON(http.StatusOK, gin.H{"logged": true})
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
                if d, err := time.ParseDuration(daysParam + "h"); err == nil {
                        days = int(d.Hours() / 24)
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
                        "total_visits":      totalVisits,
                        "total_activities":  totalActivities,
                        "new_users":         uniqueUsers,
                        "active_users_today": activeUsersToday,
                },
                "daily_visits":      dailyVisitStats,
                "daily_activities":  dailyActivityStats,
                "recent_visits":     recentVisits,
                "recent_activities": recentActivities,
                "top_pages":         topPages,
        })
}

// Helper functions

func generateSessionID() string {
        // Generate a simple session ID based on timestamp and random component
        return hashString(time.Now().String() + string(time.Now().UnixNano()))
}

func hashString(s string) string {
        hash := sha256.Sum256([]byte(s))
        return hex.EncodeToString(hash[:])
}

func truncateIP(ip string) string {
        // Truncate IPv4 to first 3 octets (e.g., "192.168.1.100" -> "192.168.1")
        parts := strings.Split(ip, ".")
        if len(parts) >= 3 {
                return strings.Join(parts[:3], ".")
        }
        // For IPv6, take first 48 bits
        if strings.Contains(ip, ":") {
                parts := strings.Split(ip, ":")
                if len(parts) >= 3 {
                        return strings.Join(parts[:3], ":")
                }
        }
        return ""
}

func cleanReferrer(referrer string) string {
        // Remove query parameters from referrer for privacy
        if idx := strings.Index(referrer, "?"); idx > 0 {
                return referrer[:idx]
        }
        // Limit length
        if len(referrer) > 500 {
                return referrer[:500]
        }
        return referrer
}
