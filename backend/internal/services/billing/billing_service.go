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

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var (
	ErrUserNotFound         = errors.New("user not found")
	ErrSubscriptionNotFound = errors.New("subscription not found")
	ErrEventAlreadyProcessed = errors.New("event already processed")
)

// BillingService orchestrates all billing operations
type BillingService struct {
	db             *gorm.DB
	pricingService *PricingService
	dodoAdapter    *DodoAdapter
}

// NewBillingService creates a new billing service
func NewBillingService(db *gorm.DB, pricingService *PricingService, dodoAdapter *DodoAdapter) *BillingService {
	return &BillingService{
		db:             db,
		pricingService: pricingService,
		dodoAdapter:    dodoAdapter,
	}
}

// CheckoutRequest represents a request to start checkout
type CheckoutRequest struct {
	PlanCode     string `json:"plan_code" binding:"required"`
	SuccessURL   string `json:"success_url,omitempty"`
	CancelURL    string `json:"cancel_url,omitempty"`
	CountryCode string `json:"country_code,omitempty"` // Optional override
}

// CheckoutResponse represents the response from checkout initiation
type CheckoutResponse struct {
	Provider    string               `json:"provider"`
	CheckoutURL string               `json:"checkout_url,omitempty"`
	Quote       *models.PricingQuote `json:"quote"`
}

// ErrAlreadySubscribed is returned by CreateCheckoutSession when the caller
// already has an active or trialing subscription on the same plan. Callers
// map this to a 409 Conflict at the HTTP layer; the frontend uses the
// error message to guide the user to their billing settings instead of
// letting them accidentally pay twice for the same plan.
var ErrAlreadySubscribed = errors.New("user already has an active subscription for this plan")

// CreateCheckoutSession creates a checkout session via DodoPayments
func (s *BillingService) CreateCheckoutSession(userID uint, req CheckoutRequest) (*CheckoutResponse, error) {
	// Get user
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	// Refuse if the user already has an active/trialing subscription on
	// this exact plan. Different plan_code is allowed so upgrades and
	// downgrades still work (PRO_MONTHLY → PRO_YEARLY etc.), but a
	// double-subscribe to the same plan would create a second Dodo
	// subscription that Dodo would charge alongside the first every
	// billing cycle. Blocking here prevents the class of "why am I
	// being charged twice?" support ticket.
	var existing models.Subscription
	err := s.db.
		Where("user_id = ? AND plan_code = ? AND provider = ? AND status IN (?, ?)",
			userID, req.PlanCode, models.PaymentProviderDodo,
			models.BillingSubStatusActive, models.BillingSubStatusTrialing).
		First(&existing).Error
	if err == nil {
		return nil, ErrAlreadySubscribed
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("check existing subscription: %w", err)
	}

	// Determine country code
	countryCode := req.CountryCode
	if countryCode == "" && user.CountryCode != nil {
		countryCode = *user.CountryCode
	}
	if countryCode == "" {
		countryCode = "US"
	}

	// Calculate pricing
	quote, err := s.pricingService.CalculatePricing(req.PlanCode, countryCode)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate pricing: %w", err)
	}

	if !s.dodoAdapter.IsConfigured() {
		return nil, fmt.Errorf("payment gateway not configured")
	}

	dodoResp, err := s.dodoAdapter.CreateSubscriptionCheckout(&user, req.PlanCode, countryCode)
	if err != nil {
		return nil, fmt.Errorf("failed to create checkout: %w", err)
	}

	log.Printf("[BILLING] Dodo checkout created: user=%d plan=%s country=%s sub=%s",
		userID, req.PlanCode, countryCode, dodoResp.SubscriptionID)

	// Persist the attempt so the abandoned-checkout follow-up cron can find
	// it later. Non-fatal — if we fail to insert here, the user still gets
	// their payment link. The follow-up email is best-effort marketing.
	attempt := &models.CheckoutAttempt{
		UserID:                 userID,
		ProviderSubscriptionID: dodoResp.SubscriptionID,
		PlanCode:               req.PlanCode,
		CountryCode:            countryCode,
		StartedAt:              time.Now(),
	}
	if err := s.db.Create(attempt).Error; err != nil {
		log.Printf("[BILLING] Warning: failed to record checkout attempt (user=%d sub=%s): %v", userID, dodoResp.SubscriptionID, err)
	}

	return &CheckoutResponse{
		Provider:    string(models.PaymentProviderDodo),
		CheckoutURL: dodoResp.CheckoutURL,
		Quote:       quote,
	}, nil
}

// MarkCheckoutCompleted stamps the CheckoutAttempt for a given Dodo
// subscription as completed. Called from handleDodoSubscriptionActive
// so the abandoned-checkout cron won't email a user who finished.
func (s *BillingService) MarkCheckoutCompleted(providerSubscriptionID string) error {
	if providerSubscriptionID == "" {
		return nil
	}
	now := time.Now()
	return s.db.Model(&models.CheckoutAttempt{}).
		Where("provider_subscription_id = ? AND completed_at IS NULL", providerSubscriptionID).
		Update("completed_at", now).Error
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

// UpdateUserPremiumStatus updates a user's premium status after payment.
//
// Fails LOUDLY when:
//   - userID is 0 (unset / bad metadata from checkout — surfaces the caller bug)
//   - No user row matches the given id (returns ErrUserNotFound so the webhook
//     handler can return the error to Dodo, which triggers Dodo's automatic
//     retry per the Standard Webhooks spec)
//   - Either the Updates or the UpdateColumn call errors at the DB level
//
// Previously this silently returned nil on the "0 rows affected" case, which
// meant a webhook with bad metadata would be marked "processed successfully"
// even though the user's Pro flag never actually flipped. That produced the
// class of incidents where Dodo sends a payment-confirmation email but the
// user's account remains free until manual intervention.
func (s *BillingService) UpdateUserPremiumStatus(userID uint, isPremium bool) error {
	if userID == 0 {
		return fmt.Errorf("UpdateUserPremiumStatus: refusing to update with userID=0 (likely missing/bad metadata at checkout)")
	}

	updates := map[string]interface{}{}
	if isPremium {
		updates["subscription"] = models.PlanPro
	} else {
		updates["subscription"] = models.PlanFree
	}

	result := s.db.Model(&models.User{}).
		Where("id = ?", userID).
		Updates(updates)
	if result.Error != nil {
		return fmt.Errorf("UpdateUserPremiumStatus: updating user %d failed: %w", userID, result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("UpdateUserPremiumStatus: user id=%d: %w", userID, ErrUserNotFound)
	}

	// Increment token version to force refresh of any active JWTs (they cache
	// the subscription plan). Runs in a separate statement — its result is
	// distinct from the Updates() above, whereas the previous chained form
	// masked the Updates error with the UpdateColumn error.
	if err := s.db.Model(&models.User{}).
		Where("id = ?", userID).
		UpdateColumn("token_version", gorm.Expr("token_version + 1")).Error; err != nil {
		return fmt.Errorf("UpdateUserPremiumStatus: bumping token_version for user %d failed: %w", userID, err)
	}
	return nil
}

// GetUserByID fetches a user by primary key. Returns ErrUserNotFound if the
// row doesn't exist, without leaking the underlying GORM error to callers.
// Used by the receipt email path in the payment webhook, which needs the
// recipient's email and display name.
func (s *BillingService) GetUserByID(userID uint) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &user, nil
}

// UpdateUserSubscriptionEnd stores or clears the subscription end date on the user.
// Pass a non-nil *time.Time on activation/renewal; pass nil on cancellation/expiry.
func (s *BillingService) UpdateUserSubscriptionEnd(userID uint, end *time.Time) error {
	return s.db.Model(&models.User{}).
		Where("id = ?", userID).
		Update("subscription_end", end).Error
}

// MarkUserProWelcomed records that the first-time Pro welcome email has
// been sent to this user. Idempotent: safe to call multiple times, though
// only the first non-null write is meaningful. Guards against the
// subscription.active handler dispatching multiple welcomes if a webhook
// somehow processes twice past the payment_events idempotency layer.
func (s *BillingService) MarkUserProWelcomed(userID uint) error {
	return s.db.Model(&models.User{}).
		Where("id = ? AND pro_welcomed_at IS NULL", userID).
		Update("pro_welcomed_at", time.Now()).Error
}

// UpdateUserDodoCustomerID stores the Dodo customer ID on the user record.
func (s *BillingService) UpdateUserDodoCustomerID(userID uint, dodoCustomerID string) error {
	return s.db.Model(&models.User{}).
		Where("id = ? AND (dodo_customer_id IS NULL OR dodo_customer_id = '')", userID).
		Update("dodo_customer_id", dodoCustomerID).Error
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
		OldValue:     datatypes.JSON(oldValue),
		NewValue:     datatypes.JSON(newValue),
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
			OldValue:     datatypes.JSON(oldValue),
			NewValue:     datatypes.JSON(newValue),
		}
		if err := tx.Create(auditLog).Error; err != nil {
			tx.Rollback()
			return err
		}
	}
	
	return tx.Commit().Error
}

// CancelSubscription cancels a user's subscription via DodoPayments
func (s *BillingService) CancelSubscription(userID uint, immediate bool) error {
	var subscription models.Subscription
	if err := s.db.Where("user_id = ? AND status = ?", userID, models.BillingSubStatusActive).
		First(&subscription).Error; err != nil {
		return err
	}

	if err := s.dodoAdapter.CancelSubscription(subscription.ProviderSubscriptionID); err != nil {
		return err
	}

	// Update local status
	now := time.Now()
	subscription.CanceledAt = &now
	if immediate {
		subscription.Status = models.BillingSubStatusCanceled
	}

	return s.db.Save(&subscription).Error
}
