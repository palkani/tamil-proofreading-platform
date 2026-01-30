package models

import (
	"time"

	"gorm.io/gorm"
)

type Usage struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"not null;index" json:"user_id"`
	WordCount     int       `gorm:"not null" json:"word_count"`
	// TokenCount stores Gemini token usage (prompt + output) for quota enforcement.
	// This is the source of truth for the "15000 tokens/day" limit.
	TokenCount    int       `gorm:"not null;default:0" json:"token_count"`
	ModelUsed     ModelType `gorm:"not null" json:"model_used"`
	SubmissionID  *uint     `json:"submission_id,omitempty"`
	Date          time.Time `gorm:"index" json:"date"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
	
	// Relationships
	User          User      `gorm:"foreignKey:UserID" json:"-"`
	Submission    *Submission `gorm:"foreignKey:SubmissionID" json:"-"`
}

