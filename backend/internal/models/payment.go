package models

import (
	"time"

	"gorm.io/gorm"
)

type PaymentStatus string

const (
	PaymentStatusPending    PaymentStatus = "pending"
	PaymentStatusProcessing PaymentStatus = "processing"
	PaymentStatusCompleted  PaymentStatus = "completed"
	PaymentStatusFailed     PaymentStatus = "failed"
	PaymentStatusRefunded   PaymentStatus = "refunded"
)

type PaymentMethod string

const (
	PaymentMethodStripe   PaymentMethod = "stripe"
	PaymentMethodRazorpay PaymentMethod = "razorpay"
)

type PaymentType string

const (
	PaymentTypePayPerUse PaymentType = "pay_per_use"
	PaymentTypeSubscription PaymentType = "subscription"
)

type Payment struct {
	ID                uint          `gorm:"primaryKey" json:"id"`
	UserID            uint          `gorm:"not null;index" json:"user_id"`
	Amount            float64       `gorm:"not null" json:"amount"`
	Currency          string        `gorm:"default:'INR'" json:"currency"`
	Status            PaymentStatus `gorm:"default:'pending'" json:"status"`
	PaymentMethod     PaymentMethod `gorm:"not null" json:"payment_method"`
	PaymentType       PaymentType   `gorm:"not null" json:"payment_type"`
	TransactionID     string        `gorm:"uniqueIndex" json:"transaction_id"`
	GatewayPaymentID  string        `json:"gateway_payment_id,omitempty"`
	InvoiceNumber     string        `gorm:"uniqueIndex" json:"invoice_number,omitempty"`
	InvoiceURL        string        `json:"invoice_url,omitempty"`
	Description       string        `gorm:"type:text" json:"description,omitempty"`
	Metadata          string        `gorm:"type:jsonb" json:"metadata,omitempty"` // Additional data
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         time.Time     `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
	
	// Relationships
	User              User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

