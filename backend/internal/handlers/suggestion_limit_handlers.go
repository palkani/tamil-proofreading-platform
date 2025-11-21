package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"tamil-proofreading-platform/backend/internal/models"
)

// GetOrCreateSuggestionLimit gets or creates a suggestion limit record for the current 30-day period
func (h *Handlers) GetOrCreateSuggestionLimit(userID uint) (*models.SuggestionLimit, error) {
	now := time.Now()
	
	var sl models.SuggestionLimit
	
	// Find existing valid period
	err := h.DB.Where("user_id = ? AND period_start_date <= ? AND period_end_date >= ?", userID, now, now).
		First(&sl).Error
	
	if err == nil {
		// Found valid period
		return &sl, nil
	}
	
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	
	// Create new period (30 days from today)
	periodStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	periodEnd := periodStart.AddDate(0, 0, 30)
	
	sl = models.SuggestionLimit{
		UserID:          userID,
		SuggestionsUsed: 0,
		DailyLimit:      30,
		PeriodStartDate: periodStart,
		PeriodEndDate:   periodEnd,
	}
	
	if err := h.DB.Create(&sl).Error; err != nil {
		return nil, err
	}
	
	return &sl, nil
}

// CheckSuggestionLimit checks if user can make an AI request
func (h *Handlers) CheckSuggestionLimit(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	sl, err := h.GetOrCreateSuggestionLimit(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check suggestion limit"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"can_use":    sl.CanUseSuggestion(),
		"used":       sl.SuggestionsUsed,
		"remaining":  sl.GetRemainingCount(),
		"limit":      sl.DailyLimit,
		"period_end": sl.PeriodEndDate,
	})
}

// IncrementSuggestionUsage increments suggestion count after successful AI request
func (h *Handlers) IncrementSuggestionUsage(userID uint) error {
	sl, err := h.GetOrCreateSuggestionLimit(userID)
	if err != nil {
		return err
	}
	
	if !sl.CanUseSuggestion() {
		return gorm.ErrRecordNotFound // Indicates limit exceeded
	}
	
	sl.IncrementSuggestionsUsed()
	return h.DB.Save(sl).Error
}
