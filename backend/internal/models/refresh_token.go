package models

import (
	"time"
)

type RefreshToken struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"index;not null" json:"user_id"`
	TokenHash string     `gorm:"size:128;uniqueIndex;not null" json:"-"`
	UserAgent string     `gorm:"size:255" json:"user_agent,omitempty"`
	IPAddress string     `gorm:"size:64" json:"ip_address,omitempty"`
	ExpiresAt time.Time  `json:"expires_at"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
