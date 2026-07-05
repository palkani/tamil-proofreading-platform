package models

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ==================== ENUMS ====================

// PaymentProvider represents supported payment gateways
type PaymentProvider string

const (
	PaymentProviderStripe   PaymentProvider = "stripe"
	PaymentProviderRazorpay PaymentProvider = "razorpay"
	PaymentProviderDodo     PaymentProvider = "dodo"
)

// BillingSubscriptionStatus represents the state of a billing subscription
type BillingSubscriptionStatus string

const (
	BillingSubStatusTrialing   BillingSubscriptionStatus = "trialing"
	BillingSubStatusActive     BillingSubscriptionStatus = "active"
	BillingSubStatusPastDue    BillingSubscriptionStatus = "past_due"
	BillingSubStatusCanceled   BillingSubscriptionStatus = "canceled"
	BillingSubStatusIncomplete BillingSubscriptionStatus = "incomplete"
	BillingSubStatusExpired    BillingSubscriptionStatus = "expired"
)

// InvoiceStatus represents the state of an invoice
type InvoiceStatus string

const (
	InvoiceStatusOpen          InvoiceStatus = "open"
	InvoiceStatusPaid          InvoiceStatus = "paid"
	InvoiceStatusVoid          InvoiceStatus = "void"
	InvoiceStatusUncollectible InvoiceStatus = "uncollectible"
	InvoiceStatusRefunded      InvoiceStatus = "refunded"
	InvoiceStatusFailed        InvoiceStatus = "failed"
)

// PaymentEventStatus represents webhook event processing status
type PaymentEventStatus string

const (
	PaymentEventStatusReceived  PaymentEventStatus = "received"
	PaymentEventStatusProcessed PaymentEventStatus = "processed"
	PaymentEventStatusFailed    PaymentEventStatus = "failed"
)

// ==================== MODELS ====================

// Plan represents a subscription plan with pricing
type Plan struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	Code            string         `gorm:"size:50;uniqueIndex;not null" json:"code"` // e.g., PRO_MONTHLY
	Name            string         `gorm:"size:100;not null" json:"name"`
	Description     string         `gorm:"type:text" json:"description,omitempty"`
	BaseCurrency    string         `gorm:"size:3;not null;default:'USD'" json:"base_currency"`
	BasePriceUSD             int     `gorm:"not null" json:"base_price_usd_cents"`                       // Price in cents (e.g., 1200 = $12.00)
	IndiaMultiplier          float64 `gorm:"type:decimal(5,4);not null;default:0.75" json:"india_multiplier"`
	IndiaFixedPriceINRCents  int     `gorm:"default:0" json:"india_fixed_price_inr_cents,omitempty"`     // When > 0, overrides USD×multiplier×FX calc (e.g., 59900 = ₹599.00)
	BillingInterval string         `gorm:"size:20;not null;default:'month'" json:"billing_interval"` // month, year
	Active          bool           `gorm:"not null;default:true" json:"active"`
	TrialDays       int            `gorm:"default:0" json:"trial_days"`
	Features        string         `gorm:"type:jsonb" json:"features,omitempty"` // JSON array of features
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

// FXRate stores daily foreign exchange rates
type FXRate struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	BaseCurrency  string    `gorm:"size:3;not null;default:'USD'" json:"base_currency"`
	QuoteCurrency string    `gorm:"size:3;not null" json:"quote_currency"` // e.g., INR
	Rate          float64   `gorm:"type:decimal(16,6);not null" json:"rate"`
	AsOfDate      time.Time `gorm:"type:date;not null;uniqueIndex:idx_fx_rate_date" json:"as_of_date"`
	Source        string    `gorm:"size:50" json:"source"` // e.g., "exchangerate-api", "stripe"
	CreatedAt     time.Time `json:"created_at"`
}

// TableName specifies the table name for FXRate
func (FXRate) TableName() string {
	return "fx_rates"
}

// Subscription represents a user's subscription (provider-agnostic)
type Subscription struct {
	ID                     uint                      `gorm:"primaryKey" json:"id"`
	UserID                 uint                      `gorm:"not null;index" json:"user_id"`
	PlanCode               string                    `gorm:"size:50;not null" json:"plan_code"`
	Provider               PaymentProvider           `gorm:"size:20;not null" json:"provider"`
	ProviderCustomerID     string                    `gorm:"size:100" json:"provider_customer_id"`
	ProviderSubscriptionID string                    `gorm:"size:100;index" json:"provider_subscription_id"`
	Status                 BillingSubscriptionStatus `gorm:"size:20;not null;default:'incomplete'" json:"status"`
	CountryCode            string             `gorm:"size:2" json:"country_code"`
	CurrentPeriodStart     *time.Time         `json:"current_period_start,omitempty"`
	CurrentPeriodEnd       *time.Time         `json:"current_period_end,omitempty"`
	CanceledAt             *time.Time         `json:"canceled_at,omitempty"`
	CancelReason           string             `gorm:"type:text" json:"cancel_reason,omitempty"`
	TrialEndsAt            *time.Time         `json:"trial_ends_at,omitempty"`
	Metadata               datatypes.JSON     `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt              time.Time          `json:"created_at"`
	UpdatedAt              time.Time          `json:"updated_at"`
	DeletedAt              gorm.DeletedAt     `gorm:"index" json:"-"`

	// Relationships
	User     User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Plan     Plan      `gorm:"foreignKey:PlanCode;references:Code" json:"plan,omitempty"`
	Invoices []Invoice `gorm:"foreignKey:SubscriptionID" json:"invoices,omitempty"`
}

// Invoice represents a billing invoice (immutable ledger)
type Invoice struct {
	ID                      uint            `gorm:"primaryKey" json:"id"`
	UserID                  uint            `gorm:"not null;index" json:"user_id"`
	SubscriptionID          *uint           `gorm:"index" json:"subscription_id,omitempty"`
	Provider                PaymentProvider `gorm:"size:20;not null" json:"provider"`
	ProviderInvoiceID       string          `gorm:"size:100;uniqueIndex:idx_invoice_provider" json:"provider_invoice_id"`
	ProviderPaymentIntentID string          `gorm:"size:100" json:"provider_payment_intent_id,omitempty"`
	AmountCents             int             `gorm:"not null" json:"amount_cents"`
	Currency                string          `gorm:"size:3;not null" json:"currency"`
	FXRateUsed              *float64        `gorm:"type:decimal(16,6)" json:"fx_rate_used,omitempty"`
	BasePriceUSDCents       int             `json:"base_price_usd_cents"`
	IndiaPriceUSDEquiv      int             `json:"india_price_usd_equiv_cents,omitempty"`
	Status                  InvoiceStatus   `gorm:"size:20;not null;default:'open'" json:"status"`
	PaidAt                  *time.Time      `json:"paid_at,omitempty"`
	RefundedAt              *time.Time      `json:"refunded_at,omitempty"`
	RefundAmountCents       *int            `json:"refund_amount_cents,omitempty"`
	FailureReason           string          `gorm:"type:text" json:"failure_reason,omitempty"`
	Metadata                datatypes.JSON  `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt               time.Time       `json:"created_at"`
	UpdatedAt               time.Time       `json:"updated_at"`

	// Relationships
	User         User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Subscription *Subscription `gorm:"foreignKey:SubscriptionID" json:"subscription,omitempty"`
}

// PaymentEvent tracks webhook events for idempotency
type PaymentEvent struct {
	ID              uint               `gorm:"primaryKey" json:"id"`
	Provider        PaymentProvider    `gorm:"size:20;not null" json:"provider"`
	ProviderEventID string             `gorm:"size:100;uniqueIndex" json:"provider_event_id"`
	EventType       string             `gorm:"size:100" json:"event_type"`
	ReceivedAt      time.Time          `gorm:"not null" json:"received_at"`
	ProcessedAt     *time.Time         `json:"processed_at,omitempty"`
	Status          PaymentEventStatus `gorm:"size:20;not null;default:'received'" json:"status"`
	RawPayloadHash  string             `gorm:"size:64" json:"raw_payload_hash"` // SHA-256 hash
	Error           string             `gorm:"type:text" json:"error,omitempty"`
	CreatedAt       time.Time          `json:"created_at"`
}

// FeatureFlag represents a global feature toggle
type FeatureFlag struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	Key            string    `gorm:"size:100;uniqueIndex;not null" json:"key"` // e.g., "premium_enabled"
	Enabled        bool      `gorm:"not null;default:true" json:"enabled"`
	Description    string    `gorm:"type:text" json:"description,omitempty"`
	UpdatedByAdmin uint      `gorm:"not null" json:"updated_by_admin_id"`
	Reason         string    `gorm:"type:text" json:"reason,omitempty"`
	UpdatedAt      time.Time `json:"updated_at"`
	CreatedAt      time.Time `json:"created_at"`
}

// BillingAuditLog tracks admin actions on billing/entitlements
type BillingAuditLog struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ActorUserID  uint      `gorm:"not null;index" json:"actor_user_id"`
	Action       string    `gorm:"size:100;not null;index" json:"action"`
	TargetUserID *uint     `gorm:"index" json:"target_user_id,omitempty"`
	ResourceType string    `gorm:"size:50" json:"resource_type,omitempty"` // subscription, invoice, feature_flag, user
	ResourceID   *uint     `json:"resource_id,omitempty"`
	OldValue     datatypes.JSON `gorm:"type:jsonb" json:"old_value,omitempty"`
	NewValue     datatypes.JSON `gorm:"type:jsonb" json:"new_value,omitempty"`
	Metadata     datatypes.JSON `gorm:"type:jsonb" json:"metadata,omitempty"`
	IPAddress    string    `gorm:"size:45" json:"ip_address,omitempty"`
	UserAgent    string    `gorm:"size:255" json:"user_agent,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// ==================== HELPER TYPES ====================

// PricingQuote represents a calculated price for checkout
type PricingQuote struct {
	PlanCode            string  `json:"plan_code"`
	BasePriceUSDCents   int     `json:"base_price_usd_cents"`
	FinalPriceUSDCents  int     `json:"final_price_usd_cents"` // After India discount if applicable
	FinalPriceCents     int     `json:"final_price_cents"`     // In target currency
	Currency            string  `json:"currency"`
	CountryCode         string  `json:"country_code"`
	IsIndiaPrice        bool    `json:"is_india_price"`
	FXRate              float64 `json:"fx_rate,omitempty"`
	FXRateAsOfDate      string  `json:"fx_rate_as_of_date,omitempty"`
	DiscountPercent     int     `json:"discount_percent,omitempty"`
	Provider            string  `json:"provider"`
	ValidUntil          string  `json:"valid_until"`
	QuoteSignature      string  `json:"quote_signature,omitempty"` // HMAC for tamper protection
}

// BillingStatus represents user's current billing state
type BillingStatus struct {
	HasActiveSubscription bool               `json:"has_active_subscription"`
	IsPremium             bool               `json:"is_premium"`
	PremiumSource         string             `json:"premium_source,omitempty"` // subscription, admin_override
	Subscription          *Subscription      `json:"subscription,omitempty"`
	Plan                  *Plan              `json:"plan,omitempty"`
	CurrentPeriodEnd      *time.Time         `json:"current_period_end,omitempty"`
	Provider              PaymentProvider    `json:"provider,omitempty"`
	CountryCode           string             `json:"country_code,omitempty"`
	PremiumOverride       bool               `json:"premium_override"`
	GlobalPremiumEnabled  bool               `json:"global_premium_enabled"`
}
