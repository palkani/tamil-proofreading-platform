package models

import (
	"time"

	"gorm.io/gorm"
)

// AffiliateStatus represents the status of an affiliate account
type AffiliateStatus string

const (
	AffiliateStatusActive AffiliateStatus = "active"
	AffiliateStatusPaused AffiliateStatus = "paused"
)

// ReferralStatus represents the status of a referral
type ReferralStatus string

const (
	ReferralStatusPending   ReferralStatus = "pending"   // Signed up but no payment yet
	ReferralStatusActive    ReferralStatus = "active"    // Has made a payment
	ReferralStatusCancelled ReferralStatus = "cancelled" // Cancelled/churned
)

// EarningStatus represents the status of an affiliate earning
type EarningStatus string

const (
	EarningStatusPending EarningStatus = "pending" // Awaiting lock period
	EarningStatusLocked  EarningStatus = "locked"  // Locked for payout
	EarningStatusPaid    EarningStatus = "paid"    // Paid out
	EarningStatusVoided  EarningStatus = "voided"  // Voided due to refund
)

// Affiliate represents an affiliate user who can refer others
type Affiliate struct {
	ID             uint            `gorm:"primaryKey" json:"id"`
	UserID         uint            `gorm:"not null;uniqueIndex" json:"user_id"`
	AffiliateCode  string          `gorm:"size:20;not null;uniqueIndex" json:"affiliate_code"`
	CommissionRate float64         `gorm:"not null;default:0.25" json:"commission_rate"` // 25% default
	Status         AffiliateStatus `gorm:"size:16;not null;default:'active'" json:"status"`
	TotalEarnings  float64         `gorm:"not null;default:0" json:"total_earnings"`
	PaidEarnings   float64         `gorm:"not null;default:0" json:"paid_earnings"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	DeletedAt      gorm.DeletedAt  `gorm:"index" json:"-"`

	// Relationships
	User      User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Referrals []Referral `gorm:"foreignKey:AffiliateID" json:"referrals,omitempty"`
	Earnings  []AffiliateEarning `gorm:"foreignKey:AffiliateID" json:"earnings,omitempty"`
}

// Referral tracks users who signed up via an affiliate link
type Referral struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	AffiliateID      uint           `gorm:"not null;index" json:"affiliate_id"`
	ReferredUserID   uint           `gorm:"not null;uniqueIndex" json:"referred_user_id"` // Each user can only be referred once
	SignupDate       time.Time      `gorm:"not null" json:"signup_date"`
	FirstPaymentDate *time.Time     `json:"first_payment_date,omitempty"`
	Status           ReferralStatus `gorm:"size:16;not null;default:'pending'" json:"status"`
	CommissionEndDate *time.Time    `json:"commission_end_date,omitempty"` // 12 months from first payment
	DiscountEndDate  *time.Time     `json:"discount_end_date,omitempty"`   // 3 months from first payment
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`

	// Relationships
	Affiliate    Affiliate `gorm:"foreignKey:AffiliateID" json:"affiliate,omitempty"`
	ReferredUser User      `gorm:"foreignKey:ReferredUserID" json:"referred_user,omitempty"`
}

// AffiliateEarning represents a commission earned by an affiliate (immutable ledger)
type AffiliateEarning struct {
	ID             uint          `gorm:"primaryKey" json:"id"`
	AffiliateID    uint          `gorm:"not null;index" json:"affiliate_id"`
	ReferredUserID uint          `gorm:"not null;index" json:"referred_user_id"`
	PaymentID      uint          `gorm:"not null;index" json:"payment_id"`
	Amount         float64       `gorm:"not null" json:"amount"`           // Commission amount
	Currency       string        `gorm:"size:3;not null;default:'INR'" json:"currency"`
	EarningMonth   string        `gorm:"size:7;not null;index" json:"earning_month"` // Format: YYYY-MM
	Status         EarningStatus `gorm:"size:16;not null;default:'pending'" json:"status"`
	VoidedAt       *time.Time    `json:"voided_at,omitempty"`
	VoidReason     string        `gorm:"size:255" json:"void_reason,omitempty"`
	CreatedAt      time.Time     `json:"created_at"`

	// Relationships (read-only, no cascading updates)
	Affiliate    Affiliate `gorm:"foreignKey:AffiliateID" json:"affiliate,omitempty"`
	ReferredUser User      `gorm:"foreignKey:ReferredUserID" json:"referred_user,omitempty"`
	Payment      Payment   `gorm:"foreignKey:PaymentID" json:"payment,omitempty"`
}

// AffiliateAuditLog tracks admin actions on affiliates
type AffiliateAuditLog struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	AdminUserID uint      `gorm:"not null;index" json:"admin_user_id"`
	AffiliateID uint      `gorm:"not null;index" json:"affiliate_id"`
	Action      string    `gorm:"size:50;not null" json:"action"` // e.g., "created", "status_changed", "code_regenerated"
	OldValue    string    `gorm:"type:text" json:"old_value,omitempty"`
	NewValue    string    `gorm:"type:text" json:"new_value,omitempty"`
	IPAddress   string    `gorm:"size:45" json:"ip_address,omitempty"`
	UserAgent   string    `gorm:"size:255" json:"user_agent,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// AffiliateStats is a view model for affiliate statistics (not a DB table)
type AffiliateStats struct {
	TotalSignups      int64   `json:"total_signups"`
	PaidUsers         int64   `json:"paid_users"`
	FreeUsers         int64   `json:"free_users"`
	TotalCommission   float64 `json:"total_commission"`
	PendingCommission float64 `json:"pending_commission"`
	PaidCommission    float64 `json:"paid_commission"`
}

// MonthlyEarning is a view model for monthly breakdown
type MonthlyEarning struct {
	Month           string  `json:"month"` // YYYY-MM format
	Amount          float64 `json:"amount"`
	TransactionCount int64  `json:"transaction_count"`
	Status          string  `json:"status"` // aggregated status
}
