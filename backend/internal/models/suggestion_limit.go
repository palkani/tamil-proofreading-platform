package models

import (
        "time"
)

// SuggestionLimit tracks AI suggestions used per user per 30-day rolling period
type SuggestionLimit struct {
        ID               uint      `gorm:"primaryKey" json:"id"`
        UserID           uint      `gorm:"not null;index" json:"user_id"`
        SuggestionsUsed  int       `gorm:"default:0" json:"suggestions_used"`
        DailyLimit       int       `gorm:"default:30" json:"daily_limit"` // 30 suggestions per 30 days
        PeriodStartDate  time.Time `gorm:"not null;index" json:"period_start_date"`
        PeriodEndDate    time.Time `gorm:"not null;index" json:"period_end_date"`
        CreatedAt        time.Time `json:"created_at"`
        UpdatedAt        time.Time `json:"updated_at"`
        
        // Relationships
        User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// CheckAndIncrementSuggestions checks if user has suggestions left and increments if yes
func (sl *SuggestionLimit) CanUseSuggestion() bool {
        return sl.SuggestionsUsed < sl.DailyLimit
}

// IncrementSuggestionsUsed increments the suggestion count
func (sl *SuggestionLimit) IncrementSuggestionsUsed() {
        sl.SuggestionsUsed++
}

// IsExpired checks if the 30-day period has expired
func (sl *SuggestionLimit) IsExpired() bool {
        return time.Now().After(sl.PeriodEndDate)
}

// GetRemainingCount returns the remaining suggestions for this period
func (sl *SuggestionLimit) GetRemainingCount() int {
        remaining := sl.DailyLimit - sl.SuggestionsUsed
        if remaining < 0 {
                return 0
        }
        return remaining
}
