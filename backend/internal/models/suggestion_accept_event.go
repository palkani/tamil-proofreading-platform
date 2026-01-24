package models

import "time"

// SuggestionAcceptEvent stores token-level acceptance telemetry for improving IME ranking.
// Privacy: do NOT store full editor text; only per-token and optional prev token.
type SuggestionAcceptEvent struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    *uint     `gorm:"index:idx_suggest_accept_user" json:"user_id,omitempty"`
	Query     string    `gorm:"type:text;not null;index:idx_suggest_accept_query" json:"q"`
	Selected  string    `gorm:"type:text;not null;index:idx_suggest_accept_selected" json:"selected"`
	Prev      *string   `gorm:"type:text" json:"prev,omitempty"`
	Mode      string    `gorm:"type:varchar(32);not null;default:'spoken';index:idx_suggest_accept_mode" json:"mode"`
	CreatedAt time.Time `gorm:"index:idx_suggest_accept_created_at" json:"created_at"`
}

func (SuggestionAcceptEvent) TableName() string {
	return "suggestion_accept_events"
}


