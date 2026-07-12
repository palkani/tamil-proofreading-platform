package models

import (
	"time"
)

// ActivityEventType represents different types of user activities
type ActivityEventType string

const (
	EventRegister         ActivityEventType = "register"
	EventLogin            ActivityEventType = "login"
	// EventLoginFailed captures wrong-password / user-not-found / disabled-account
	// attempts. Written for a matched user_id when we can find one by email;
	// dropped when the email doesn't correspond to any user (to avoid
	// creating log rows that leak "this email exists in our DB" via a
	// UserID lookup). Used by the admin dashboard to spot brute-force
	// patterns and by support to investigate "I can't log in" tickets.
	EventLoginFailed      ActivityEventType = "login_failed"
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

// AnonymousSubmissionEvent captures homepage/demo proofreading attempts.
// Authenticated workspace autosaves land in the submissions table; this
// table is specifically for the anonymous fast-path in SubmitText which
// intentionally skips DB writes for performance.
//
// Without this table, homepage demo activity is invisible to product
// analytics — the audit_log stream in Cloud Run is queryable but not
// aggregatable in the admin dashboard. This lets us count demo attempts
// per day, see word-count distribution, correction rates, and rough
// geographic reach without changing the fast-path latency budget.
type AnonymousSubmissionEvent struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	RequestID       string    `gorm:"size:64;index" json:"request_id"`
	TextLength      int       `gorm:"not null" json:"text_length"`      // raw byte length
	WordCount       int       `gorm:"not null;index" json:"word_count"`
	CorrectionCount int       `gorm:"not null" json:"correction_count"`
	CacheHit        bool      `gorm:"not null;default:false;index" json:"cache_hit"`
	CountryCode     string    `gorm:"size:2;index" json:"country_code,omitempty"`
	TruncatedIP     string    `gorm:"size:20" json:"truncated_ip,omitempty"`   // first 3 octets, privacy
	UserAgentHash   string    `gorm:"size:64" json:"user_agent_hash,omitempty"` // hashed for privacy
	Referrer        string    `gorm:"size:500" json:"referrer,omitempty"`
	OccurredAt      time.Time `gorm:"index;not null" json:"occurred_at"`
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
