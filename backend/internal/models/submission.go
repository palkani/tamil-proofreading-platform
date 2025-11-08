package models

import (
	"time"

	"gorm.io/gorm"
)

type SubmissionStatus string

const (
	StatusPending    SubmissionStatus = "pending"
	StatusProcessing SubmissionStatus = "processing"
	StatusCompleted  SubmissionStatus = "completed"
	StatusFailed     SubmissionStatus = "failed"
)

type ModelType string

const (
	ModelA ModelType = "model_a" // Lightweight, <500 words
	ModelB ModelType = "model_b" // Deep model, 500+ words
)

type Submission struct {
	ID                uint             `gorm:"primaryKey" json:"id"`
	UserID            uint             `gorm:"not null;index" json:"user_id"`
	OriginalText      string           `gorm:"type:text;not null" json:"original_text"`
	ProofreadText     string           `gorm:"type:text" json:"proofread_text,omitempty"`
	WordCount         int              `gorm:"not null" json:"word_count"`
	ModelUsed         ModelType        `gorm:"not null" json:"model_used"`
	Status            SubmissionStatus `gorm:"default:'pending'" json:"status"`
	Suggestions       string           `gorm:"type:jsonb" json:"suggestions,omitempty"` // JSON array of suggestions
	Alternatives      string           `gorm:"type:jsonb" json:"alternatives,omitempty"`
	IncludeAlternatives bool           `gorm:"default:false" json:"include_alternatives"`
	Error             string           `gorm:"type:text" json:"error,omitempty"`
	ProcessingTime    *float64         `json:"processing_time,omitempty"`
	Cost              float64          `gorm:"default:0" json:"cost"`
	CreatedAt         time.Time        `json:"created_at"`
	UpdatedAt         time.Time        `json:"updated_at"`
	DeletedAt         gorm.DeletedAt   `gorm:"index" json:"-"`
	
	// Relationships
	User              User             `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

