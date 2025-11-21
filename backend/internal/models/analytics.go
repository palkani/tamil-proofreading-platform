package models

import (
	"time"
)

// ActivityEventType represents different types of user activities
type ActivityEventType string

const (
	EventRegister         ActivityEventType = "register"
	EventLogin            ActivityEventType = "login"
	EventLogout           ActivityEventType = "logout"
	EventDraftCreate      ActivityEventType = "draft_create"
	EventDraftUpdate      ActivityEventType = "draft_update"
	EventDraftDelete      ActivityEventType = "draft_delete"
	EventAIRequest        ActivityEventType = "ai_request"
	EventSuggestionAccept ActivityEventType = "suggestion_accept"
	EventSuggestionReject ActivityEventType = "suggestion_reject"
)

// VisitEvent tracks page views and visitor sessions
type VisitEvent struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	SessionID      string    `gorm:"size:64;index;not null" json:"session_id"`
	UserID         *uint     `gorm:"index" json:"user_id,omitempty"`
	Route          string    `gorm:"size:255;not null" json:"route"`
	Referrer       string    `gorm:"size:500" json:"referrer,omitempty"`
	TruncatedIP    string    `gorm:"size:20" json:"truncated_ip,omitempty"`    // First 3 octets for privacy
	UserAgentHash  string    `gorm:"size:64;index" json:"user_agent_hash"`     // Hashed for privacy
	CountryCode    string    `gorm:"size:2" json:"country_code,omitempty"`
	DeviceType     string    `gorm:"size:20" json:"device_type,omitempty"`     // mobile, desktop, tablet
	OccurredAt     time.Time `gorm:"index;not null" json:"occurred_at"`
	
	// Relationships
	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// ActivityEvent tracks specific user actions
type ActivityEvent struct {
	ID         uint              `gorm:"primaryKey" json:"id"`
	UserID     uint              `gorm:"index;not null" json:"user_id"`
	EventType  ActivityEventType `gorm:"size:50;index;not null" json:"event_type"`
	Metadata   string            `gorm:"type:jsonb" json:"metadata,omitempty"` // Flexible JSON data
	OccurredAt time.Time         `gorm:"index;not null" json:"occurred_at"`
	
	// Relationships
	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// DailyVisitStats stores aggregated daily visit metrics (materialized view)
type DailyVisitStats struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Date          time.Time `gorm:"uniqueIndex;type:date;not null" json:"date"`
	TotalVisits   int       `gorm:"not null;default:0" json:"total_visits"`
	UniqueVisitors int      `gorm:"not null;default:0" json:"unique_visitors"`
	UniqueUsers   int       `gorm:"not null;default:0" json:"unique_users"`        // Authenticated users
	BounceRate    float64   `gorm:"default:0" json:"bounce_rate"`
	AvgSessionTime float64  `gorm:"default:0" json:"avg_session_time"`             // in seconds
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// DailyActivityStats stores aggregated daily activity metrics
type DailyActivityStats struct {
	ID                   uint      `gorm:"primaryKey" json:"id"`
	Date                 time.Time `gorm:"uniqueIndex;type:date;not null" json:"date"`
	Registrations        int       `gorm:"not null;default:0" json:"registrations"`
	Logins               int       `gorm:"not null;default:0" json:"logins"`
	DraftsCreated        int       `gorm:"not null;default:0" json:"drafts_created"`
	AIRequests           int       `gorm:"not null;default:0" json:"ai_requests"`
	SuggestionsAccepted  int       `gorm:"not null;default:0" json:"suggestions_accepted"`
	AvgAILatency         float64   `gorm:"default:0" json:"avg_ai_latency"`           // in milliseconds
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}
