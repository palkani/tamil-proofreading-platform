package models

import (
	"time"

	"gorm.io/gorm"
)

// DraftGroup is a user-named container for organizing drafts (submissions).
type DraftGroup struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"not null;index:idx_draft_groups_user_id" json:"user_id"`
	Name      string         `gorm:"size:255;not null" json:"name"`
	SortOrder int            `gorm:"default:0" json:"sort_order"` // for display order
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	User        User          `gorm:"foreignKey:UserID" json:"-"`
	Submissions []Submission  `gorm:"foreignKey:GroupID" json:"-"`
}
