package models

import (
	"time"

	"gorm.io/gorm"
)

type UserRole string

const (
	RoleWriter  UserRole = "writer"
	RoleReviewer UserRole = "reviewer"
	RoleAdmin   UserRole = "admin"
)

type SubscriptionPlan string

const (
	PlanFree       SubscriptionPlan = "free"
	PlanBasic      SubscriptionPlan = "basic"
	PlanPro        SubscriptionPlan = "pro"
	PlanEnterprise SubscriptionPlan = "enterprise"
)

type User struct {
	ID             uint             `gorm:"primaryKey" json:"id"`
	Email          string           `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash   string           `gorm:"not null" json:"-"`
	Name           string           `json:"name"`
	Role           UserRole         `gorm:"default:'writer'" json:"role"`
	Subscription   SubscriptionPlan `gorm:"default:'free'" json:"subscription"`
	SubscriptionEnd *time.Time      `json:"subscription_end,omitempty"`
	IsActive       bool             `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
	DeletedAt      gorm.DeletedAt   `gorm:"index" json:"-"`
	
	// Relationships
	Submissions    []Submission     `gorm:"foreignKey:UserID" json:"-"`
	Payments       []Payment        `gorm:"foreignKey:UserID" json:"-"`
	Usage          []Usage          `gorm:"foreignKey:UserID" json:"-"`
}

