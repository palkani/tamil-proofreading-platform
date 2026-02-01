package billing

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

var (
	ErrUserNotFound         = errors.New("user not found")
	ErrSubscriptionNotFound = errors.New("subscription not found")
	ErrEventAlreadyProcessed = errors.New("event already processed")
)

// BillingService orchestrates all billing operations
type BillingService struct {
	db              *gorm.DB
	pricingService  *PricingService
	stripeAdapter   *StripeAdapter
	razorpayAdapter *RazorpayAdapter
}

// NewBillingService creates a new billing service
func NewBillingService(db *gorm.DB, pricingService *PricingService, stripeAdapter *StripeAdapter, razorpayAdapter *RazorpayAdapter) *BillingService {
	return &BillingService{
		db:              db,
		pricingService:  pricingService,
		stripeAdapter:   stripeAdapter,
		razorpayAdapter: razorpayAdapter,
	}
}

// CheckoutRequest represents a request to start checkout
type CheckoutRequest struct {
	PlanCode    string `json:"plan_code" binding:"required"`
	SuccessURL  string `json:"success_url,omitempty"`
	CancelURL   string `json:"cancel_url,omitempty"`
	CountryCode string `json:"country_code,omitempty"` // Optional override
}

// CheckoutResponse represents the response from checkout initiation
type CheckoutResponse struct {
	Provider        string                   `json:"provider"`
	CheckoutURL     string                   `json:"checkout_url,omitempty"`     // For Stripe
	RazorpayPayload *RazorpayCheckoutPayload `json:"razorpay_payload,omitempty"` // For Razorpay
	Quote           *models.PricingQuote     `json:"quote"`
}

// CreateCheckoutSession creates a checkout session based on user's country
func (s *BillingService) CreateCheckoutSession(userID uint, req CheckoutRequest) (*CheckoutResponse, error) {
	// Get user
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	
	// Determine country code
	countryCode := req.CountryCode
	if countryCode == "" && user.CountryCode != nil {
		countryCode = *user.CountryCode
	}
	if countryCode == "" {
		// Default to US if not specified
		countryCode = "US"
	}
	
	// Calculate pricing
	quote, err := s.pricingService.CalculatePricing(req.PlanCode, countryCode)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate pricing: %w", err)
	}
	
	// Get plan
	plan, err := s.pricingService.GetPlan(req.PlanCode)
	if err != nil {
		return nil, err
	}
	
	response := &CheckoutResponse{
		Provider: quote.Provider,
		Quote:    quote,
	}
	
	if s.pricingService.IsIndiaUser(countryCode) {
		// Use Razorpay
		order, err := s.razorpayAdapter.CreateOrder(&user, quote)
		if err != nil {
			return nil, fmt.Errorf("failed to create razorpay order: %w", err)
		}
		
		callbackURL := req.SuccessURL
		if callbackURL == "" {
			callbackURL = "https://prooftamil.com/billing/success"
		}
		
		response.RazorpayPayload = s.razorpayAdapter.BuildCheckoutPayload(&user, quote, order, plan, callbackURL)
	} else {
		// Use Stripe
		session, err := s.stripeAdapter.CreateCheckoutSession(&user, quote, plan)
		if err != nil {
			return nil, fmt.Errorf("failed to create stripe session: %w", err)
		}
		
		response.CheckoutURL = session.URL
	}
	
	log.Printf("[BILLING] Created checkout for user %d: provider=%s plan=%s country=%s",
		userID, quote.Provider, req.PlanCode, countryCode)
	
	return response, nil
}

// GetBillingStatus returns the user's current billing status
func (s *BillingService) GetBillingStatus(userID uint) (*models.BillingStatus, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	
	status := &models.BillingStatus{
		PremiumOverride:      user.PremiumOverride,
		GlobalPremiumEnabled: s.IsGlobalPremiumEnabled(),
	}
	
	if user.CountryCode != nil {
		status.CountryCode = *user.CountryCode
	}
	
	// Get active subscription
	var subscription models.Subscription
	if err := s.db.Where("user_id = ? AND status IN ?", userID,
		[]models.BillingSubscriptionStatus{models.BillingSubStatusActive, models.BillingSubStatusTrialing}).
		Preload("Plan").
		Order("created_at DESC").
		First(&subscription).Error; err == nil {
		
		status.HasActiveSubscription = true
		status.Subscription = &subscription
		status.Plan = &subscription.Plan
		status.CurrentPeriodEnd = subscription.CurrentPeriodEnd
		status.Provider = subscription.Provider
	}
	
	// Determine premium status
	if status.GlobalPremiumEnabled {
		if status.HasActiveSubscription {
			status.IsPremium = true
			status.PremiumSource = "subscription"
		} else if user.PremiumOverride {
			status.IsPremium = true
			status.PremiumSource = "admin_override"
		}
	}
	
	return status, nil
}

// IsGlobalPremiumEnabled checks if premium is globally enabled
func (s *BillingService) IsGlobalPremiumEnabled() bool {
	var flag models.FeatureFlag
	if err := s.db.Where("key = ?", "premium_enabled").First(&flag).Error; err != nil {
		// Default to enabled if flag doesn't exist
		return true
	}
	return flag.Enabled
}

// RecordPaymentEvent records a webhook event for idempotency
func (s *BillingService) RecordPaymentEvent(provider models.PaymentProvider, eventID, eventType string, payload []byte) (*models.PaymentEvent, error) {
	// Hash the payload for deduplication
	hash := sha256.Sum256(payload)
	hashStr := hex.EncodeToString(hash[:])
	
	event := &models.PaymentEvent{
		Provider:        provider,
		ProviderEventID: eventID,
		EventType:       eventType,
		ReceivedAt:      time.Now(),
		Status:          models.PaymentEventStatusReceived,
		RawPayloadHash:  hashStr,
	}
	
	// Use upsert to handle duplicate events
	result := s.db.Where("provider_event_id = ?", eventID).FirstOrCreate(event)
	if result.Error != nil {
		return nil, result.Error
	}
	
	// If event already exists and was processed, return error
	if result.RowsAffected == 0 {
		if event.Status == models.PaymentEventStatusProcessed {
			return event, ErrEventAlreadyProcessed
		}
	}
	
	return event, nil
}

// MarkEventProcessed marks a payment event as processed
func (s *BillingService) MarkEventProcessed(eventID uint, err error) {
	updates := map[string]interface{}{
		"processed_at": time.Now(),
		"status":       models.PaymentEventStatusProcessed,
	}
	
	if err != nil {
		updates["status"] = models.PaymentEventStatusFailed
		updates["error"] = err.Error()
	}
	
	s.db.Model(&models.PaymentEvent{}).Where("id = ?", eventID).Updates(updates)
}

// CreateOrUpdateSubscription creates or updates a subscription record
func (s *BillingService) CreateOrUpdateSubscription(sub *models.Subscription) error {
	return s.db.Save(sub).Error
}

// GetSubscriptionByProviderID gets a subscription by provider subscription ID
func (s *BillingService) GetSubscriptionByProviderID(providerSubID string) (*models.Subscription, error) {
	var sub models.Subscription
	if err := s.db.Where("provider_subscription_id = ?", providerSubID).First(&sub).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSubscriptionNotFound
		}
		return nil, err
	}
	return &sub, nil
}

// CreateInvoice creates an invoice record
func (s *BillingService) CreateInvoice(invoice *models.Invoice) error {
	return s.db.Create(invoice).Error
}

// UpdateInvoiceStatus updates an invoice's status
func (s *BillingService) UpdateInvoiceStatus(providerInvoiceID string, status models.InvoiceStatus, paidAt *time.Time) error {
	updates := map[string]interface{}{
		"status": status,
	}
	if paidAt != nil {
		updates["paid_at"] = paidAt
	}
	
	return s.db.Model(&models.Invoice{}).
		Where("provider_invoice_id = ?", providerInvoiceID).
		Updates(updates).Error
}

// UpdateUserPremiumStatus updates a user's premium status after payment
func (s *BillingService) UpdateUserPremiumStatus(userID uint, isPremium bool) error {
	updates := map[string]interface{}{}
	
	if isPremium {
		updates["subscription"] = models.PlanPro
	} else {
		updates["subscription"] = models.PlanFree
	}
	
	// Increment token version to force token refresh
	return s.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(updates).
		UpdateColumn("token_version", gorm.Expr("token_version + 1")).Error
}

// LockBillingCountry locks a user's billing country after first payment
func (s *BillingService) LockBillingCountry(userID uint, countryCode string) error {
	return s.db.Model(&models.User{}).
		Where("id = ? AND billing_country_locked = ?", userID, false).
		Updates(map[string]interface{}{
			"country_code":           countryCode,
			"billing_country_locked": true,
		}).Error
}

// SetAdminPremiumOverride sets admin premium override for a user
func (s *BillingService) SetAdminPremiumOverride(adminUserID, targetUserID uint, enabled bool, reason string) error {
	now := time.Now()
	updates := map[string]interface{}{
		"premium_override":          enabled,
		"premium_override_reason":   reason,
		"premium_override_by_admin": adminUserID,
		"premium_override_at":       now,
	}
	
	// Start transaction
	tx := s.db.Begin()
	
	// Get old value for audit
	var user models.User
	if err := tx.First(&user, targetUserID).Error; err != nil {
		tx.Rollback()
		return err
	}
	
	oldValue, _ := json.Marshal(map[string]interface{}{
		"premium_override": user.PremiumOverride,
	})
	newValue, _ := json.Marshal(map[string]interface{}{
		"premium_override": enabled,
		"reason":           reason,
	})
	
	// Update user
	if err := tx.Model(&models.User{}).Where("id = ?", targetUserID).Updates(updates).
		UpdateColumn("token_version", gorm.Expr("token_version + 1")).Error; err != nil {
		tx.Rollback()
		return err
	}
	
	// Create audit log
	auditLog := &models.BillingAuditLog{
		ActorUserID:  adminUserID,
		Action:       "premium_override_changed",
		TargetUserID: &targetUserID,
		ResourceType: "user",
		ResourceID:   &targetUserID,
		OldValue:     string(oldValue),
		NewValue:     string(newValue),
	}
	if err := tx.Create(auditLog).Error; err != nil {
		tx.Rollback()
		return err
	}
	
	return tx.Commit().Error
}

// SetGlobalPremiumEnabled sets the global premium enabled flag
func (s *BillingService) SetGlobalPremiumEnabled(adminUserID uint, enabled bool, reason string) error {
	tx := s.db.Begin()
	
	// Get or create flag
	var flag models.FeatureFlag
	if err := tx.Where("key = ?", "premium_enabled").First(&flag).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			flag = models.FeatureFlag{
				Key:            "premium_enabled",
				Enabled:        enabled,
				UpdatedByAdmin: adminUserID,
				Reason:         reason,
			}
			if err := tx.Create(&flag).Error; err != nil {
				tx.Rollback()
				return err
			}
		} else {
			tx.Rollback()
			return err
		}
	} else {
		// Update existing
		oldValue, _ := json.Marshal(map[string]interface{}{"enabled": flag.Enabled})
		newValue, _ := json.Marshal(map[string]interface{}{"enabled": enabled, "reason": reason})
		
		flag.Enabled = enabled
		flag.UpdatedByAdmin = adminUserID
		flag.Reason = reason
		if err := tx.Save(&flag).Error; err != nil {
			tx.Rollback()
			return err
		}
		
		// Create audit log
		auditLog := &models.BillingAuditLog{
			ActorUserID:  adminUserID,
			Action:       "global_premium_toggle",
			ResourceType: "feature_flag",
			ResourceID:   &flag.ID,
			OldValue:     string(oldValue),
			NewValue:     string(newValue),
		}
		if err := tx.Create(auditLog).Error; err != nil {
			tx.Rollback()
			return err
		}
	}
	
	return tx.Commit().Error
}

// CancelSubscription cancels a user's subscription
func (s *BillingService) CancelSubscription(userID uint, immediate bool) error {
	var subscription models.Subscription
	if err := s.db.Where("user_id = ? AND status = ?", userID, models.BillingSubStatusActive).
		First(&subscription).Error; err != nil {
		return err
	}
	
	switch subscription.Provider {
	case models.PaymentProviderStripe:
		if err := s.stripeAdapter.CancelSubscription(subscription.ProviderSubscriptionID, immediate); err != nil {
			return err
		}
	case models.PaymentProviderRazorpay:
		if err := s.razorpayAdapter.CancelSubscription(subscription.ProviderSubscriptionID, !immediate); err != nil {
			return err
		}
	}
	
	// Update local status
	now := time.Now()
	subscription.CanceledAt = &now
	if immediate {
		subscription.Status = models.BillingSubStatusCanceled
	}
	
	return s.db.Save(&subscription).Error
}
