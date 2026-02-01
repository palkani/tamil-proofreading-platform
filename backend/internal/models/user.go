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
        ID              uint             `gorm:"primaryKey" json:"id"`
        Email           string           `gorm:"uniqueIndex;not null" json:"email"`
        PasswordHash    string           `gorm:"not null" json:"-"`
        Name            string           `json:"name"`
        Role            UserRole         `gorm:"default:'writer'" json:"role"`
        Subscription    SubscriptionPlan `gorm:"default:'free'" json:"subscription"`
        SubscriptionEnd *time.Time       `json:"subscription_end,omitempty"`
        IsActive        bool             `gorm:"default:true" json:"is_active"`
        EmailVerified   bool             `gorm:"default:false" json:"email_verified"`
        
        // Referral tracking (immutable after signup)
        ReferredByUserID  *uint   `gorm:"index" json:"referred_by_user_id,omitempty"`
        AffiliateCodeUsed *string `gorm:"size:20;index" json:"affiliate_code_used,omitempty"`
        
        // Billing fields
        CountryCode             *string    `gorm:"size:2;index" json:"country_code,omitempty"`         // ISO 3166-1 alpha-2
        BillingCountryLocked    bool       `gorm:"default:false" json:"billing_country_locked"`       // Lock after first payment
        StripeCustomerID        *string    `gorm:"size:100;index" json:"stripe_customer_id,omitempty"`
        RazorpayCustomerID      *string    `gorm:"size:100;index" json:"razorpay_customer_id,omitempty"`
        
        // Premium override (admin-controlled)
        PremiumOverride         bool       `gorm:"default:false" json:"premium_override"`
        PremiumOverrideReason   *string    `gorm:"type:text" json:"premium_override_reason,omitempty"`
        PremiumOverrideByAdmin  *uint      `json:"premium_override_by_admin_id,omitempty"`
        PremiumOverrideAt       *time.Time `json:"premium_override_at,omitempty"`
        
        // Token version for forcing token refresh on entitlement changes
        TokenVersion            int        `gorm:"default:1;not null" json:"token_version"`
        
        CreatedAt       time.Time        `json:"created_at"`
        UpdatedAt       time.Time        `json:"updated_at"`
        DeletedAt       gorm.DeletedAt   `gorm:"index" json:"-"`
        
        // Relationships
        Submissions    []Submission     `gorm:"foreignKey:UserID" json:"-"`
        Payments       []Payment        `gorm:"foreignKey:UserID" json:"-"`
        Usage          []Usage          `gorm:"foreignKey:UserID" json:"-"`
}

// EmailVerification stores OTP codes for email verification
type EmailVerification struct {
        ID        uint      `gorm:"primaryKey" json:"id"`
        UserID    uint      `gorm:"not null;index" json:"user_id"`
        Email     string    `gorm:"not null" json:"email"`
        OTPCode   string    `gorm:"not null" json:"-"`
        ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
        Verified  bool      `gorm:"default:false" json:"verified"`
        CreatedAt time.Time `json:"created_at"`
}

