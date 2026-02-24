package models

import (
	"time"

	"gorm.io/gorm"
)

// AIContentDraft stores AI Content Writer generated content separately from proofreading drafts (submissions).
// Users can list, edit, and delete these; optionally "Copy to My Drafts" to proofread in Workspace.
type AIContentDraft struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	UserID         uint           `gorm:"not null;index:idx_ai_content_drafts_user_id" json:"user_id"`
	Title          string         `gorm:"size:255;not null" json:"title"`
	Content        string         `gorm:"type:text;not null" json:"content"`
	Prompt         string         `gorm:"type:text" json:"prompt,omitempty"`           // original prompt used to generate
	ContentType    string         `gorm:"size:64" json:"content_type,omitempty"`       // blog, essay, article, story
	Language       string         `gorm:"size:32" json:"language,omitempty"`         // tamil, english, bilingual
	Tone           string         `gorm:"size:32" json:"tone,omitempty"`             // professional, casual, etc.
	MetaDescription string        `gorm:"type:text" json:"meta_description,omitempty"`
	Keywords       string         `gorm:"type:text" json:"keywords,omitempty"`
	WordCount      int            `gorm:"default:0" json:"word_count"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
