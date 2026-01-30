package models

import (
	"time"

	"gorm.io/gorm"
)

// SubscriptionStatus represents the status of a newsletter subscription
type SubscriptionStatus string

const (
	StatusPending      SubscriptionStatus = "pending"      // Awaiting email confirmation
	StatusConfirmed    SubscriptionStatus = "confirmed"    // Email confirmed, active subscriber
	StatusUnsubscribed SubscriptionStatus = "unsubscribed" // User unsubscribed
)

// SubscriptionSource tracks where the subscription came from
type SubscriptionSource string

const (
	SourceFooter   SubscriptionSource = "footer"
	SourcePopup    SubscriptionSource = "popup"
	SourceHomepage SubscriptionSource = "homepage"
	SourceBlog     SubscriptionSource = "blog"
	SourceManual   SubscriptionSource = "manual" // Admin added
)

// NewsletterSubscriber stores email subscribers for the Tamil newsletter
// This is separate from the User table to allow non-registered visitors to subscribe
type NewsletterSubscriber struct {
	ID                uint               `gorm:"primaryKey" json:"id"`
	Email             string             `gorm:"uniqueIndex;not null;size:255" json:"email"`
	Name              string             `gorm:"size:255" json:"name,omitempty"`
	Status            SubscriptionStatus `gorm:"default:'pending';not null;index" json:"status"`
	Source            SubscriptionSource `gorm:"default:'footer'" json:"source"`
	ConfirmationToken string             `gorm:"size:64;index" json:"-"`
	UnsubscribeToken  string             `gorm:"size:64;index" json:"-"`
	
	// Preferences for newsletter content
	PreferWeeklyDigest bool `gorm:"default:true" json:"prefer_weekly_digest"`
	PreferNewStories   bool `gorm:"default:true" json:"prefer_new_stories"`
	PreferTips         bool `gorm:"default:true" json:"prefer_tips"`
	
	// Language preference (for future multi-language support)
	PreferredLanguage string `gorm:"default:'ta';size:5" json:"preferred_language"` // ta=Tamil, en=English
	
	// Timestamps
	SubscribedAt   time.Time      `gorm:"not null" json:"subscribed_at"`
	ConfirmedAt    *time.Time     `json:"confirmed_at,omitempty"`
	UnsubscribedAt *time.Time     `json:"unsubscribed_at,omitempty"`
	LastEmailedAt  *time.Time     `json:"last_emailed_at,omitempty"`
	
	// Tracking
	IPAddress      string         `gorm:"size:45" json:"-"` // IPv6 can be up to 45 chars
	UserAgent      string         `gorm:"size:500" json:"-"`
	
	// Standard GORM fields
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName specifies the table name for GORM
func (NewsletterSubscriber) TableName() string {
	return "newsletter_subscribers"
}

// IsActive returns true if the subscriber can receive emails
func (n *NewsletterSubscriber) IsActive() bool {
	return n.Status == StatusConfirmed && n.DeletedAt.Time.IsZero()
}
