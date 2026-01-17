package models

import (
	"time"

	"gorm.io/gorm"
)

type BlogPostStatus string

const (
	BlogStatusDraft     BlogPostStatus = "draft"
	BlogStatusPublished BlogPostStatus = "published"
)

// BlogPost is a user-owned public blog post hosted by this app.
// ContentHTML is optional; pages can render ContentText safely if needed.
type BlogPost struct {
	ID uint `gorm:"primaryKey" json:"id"`

	UserID uint `gorm:"not null;index" json:"user_id"`
	User   User `gorm:"foreignKey:UserID" json:"user,omitempty"`

	Title string `gorm:"size:255;not null" json:"title"`
	Slug  string `gorm:"size:255;not null;uniqueIndex" json:"slug"`

	Language string `gorm:"size:32;not null;default:'tamil'" json:"language"`

	ContentHTML string `gorm:"type:text" json:"content_html,omitempty"`
	ContentText string `gorm:"type:text;not null" json:"content_text"`

	Excerpt         string `gorm:"type:text" json:"excerpt,omitempty"`
	MetaDescription string `gorm:"type:text" json:"meta_description,omitempty"`
	Keywords        string `gorm:"type:text" json:"keywords,omitempty"`

	Status      BlogPostStatus `gorm:"size:16;not null;default:'draft';index" json:"status"`
	PublishedAt *time.Time     `gorm:"index" json:"published_at,omitempty"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}


