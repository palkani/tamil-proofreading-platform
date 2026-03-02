package billing

import (
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/stripe/stripe-go/v76"
)

// WebhookService handles payment webhooks
type WebhookService struct {
	billingService  *BillingService
	stripeAdapter   *StripeAdapter
	razorpayAdapter *RazorpayAdapter
}

// NewWebhookService creates a new webhook service
func NewWebhookService(billingService *BillingService, stripeAdapter *StripeAdapter, razorpayAdapter *RazorpayAdapter) *WebhookService {
	return &WebhookService{
		billingService:  billingService,
		stripeAdapter:   stripeAdapter,
		razorpayAdapter: razorpayAdapter,
	}
}

// HandleStripeWebhook processes a Stripe webhook event
func (s *WebhookService) HandleStripeWebhook(payload []byte, signature string) error {
	// Verify signature
	event, err := s.stripeAdapter.VerifyWebhookSignature(payload, signature)
	if err != nil {
		log.Printf("[WEBHOOK] Stripe signature verification failed: %v", err)
		return err
	}
	
	// Record event for idempotency
	paymentEvent, err := s.billingService.RecordPaymentEvent(
		models.PaymentProviderStripe,
		event.ID,
		string(event.Type),
		payload,
	)
	if err != nil {
		if errors.Is(err, ErrEventAlreadyProcessed) {
			log.Printf("[WEBHOOK] Stripe event %s already processed, skipping", event.ID)
			return nil
		}
		return err
	}
	
	// Process event
	var processErr error
	switch event.Type {
	case "checkout.session.completed":
		processErr = s.handleStripeCheckoutCompleted(event)
	case "customer.subscription.created":
		processErr = s.handleStripeSubscriptionCreated(event)
	case "customer.subscription.updated":
		processErr = s.handleStripeSubscriptionUpdated(event)
	case "customer.subscription.deleted":
		processErr = s.handleStripeSubscriptionDeleted(event)
	case "invoice.paid":
		processErr = s.handleStripeInvoicePaid(event)
	case "invoice.payment_failed":
		processErr = s.handleStripeInvoicePaymentFailed(event)
	default:
		log.Printf("[WEBHOOK] Unhandled Stripe event type: %s", event.Type)
	}
	
	// Mark event as processed
	s.billingService.MarkEventProcessed(paymentEvent.ID, processErr)
	
	if processErr != nil {
		log.Printf("[WEBHOOK] Stripe event %s processing failed: %v", event.ID, processErr)
	} else {
		log.Printf("[WEBHOOK] Stripe event %s processed successfully", event.ID)
	}
	
	return processErr
}

func (s *WebhookService) handleStripeCheckoutCompleted(event *stripe.Event) error {
	var session stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
		return err
	}

	// Only handle subscription checkouts
	if session.Mode != stripe.CheckoutSessionModeSubscription {
		return nil
	}

	log.Printf("[WEBHOOK] Checkout completed: session=%s customer=%s subscription=%s",
		session.ID, session.Customer.ID, session.Subscription.ID)

	// Activate Pro immediately on checkout completion using user_id from session metadata.
	// This is the fastest path — invoice.payment_succeeded also activates Pro as a backup.
	userIDStr, ok := session.Metadata["user_id"]
	if !ok {
		log.Printf("[WEBHOOK] Warning: checkout.session.completed missing user_id metadata, session=%s", session.ID)
		return nil
	}
	userID, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		log.Printf("[WEBHOOK] Warning: invalid user_id in checkout metadata: %s", userIDStr)
		return nil
	}

	if err := s.billingService.UpdateUserPremiumStatus(uint(userID), true); err != nil {
		log.Printf("[WEBHOOK] Warning: failed to activate Pro for user %d: %v", userID, err)
	} else {
		log.Printf("[WEBHOOK] Pro activated for user %d via checkout.session.completed", userID)
	}

	return nil
}

func (s *WebhookService) handleStripeSubscriptionCreated(event *stripe.Event) error {
	var stripeSub stripe.Subscription
	if err := json.Unmarshal(event.Data.Raw, &stripeSub); err != nil {
		return err
	}
	
	// Extract user ID from metadata
	userIDStr, ok := stripeSub.Metadata["user_id"]
	if !ok {
		return errors.New("missing user_id in subscription metadata")
	}
	userID, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		return err
	}
	
	// Extract other metadata
	planCode := stripeSub.Metadata["plan_code"]
	countryCode := stripeSub.Metadata["country_code"]
	
	// Create subscription record
	periodStart := time.Unix(stripeSub.CurrentPeriodStart, 0)
	periodEnd := time.Unix(stripeSub.CurrentPeriodEnd, 0)
	
	sub := &models.Subscription{
		UserID:                 uint(userID),
		PlanCode:               planCode,
		Provider:               models.PaymentProviderStripe,
		ProviderCustomerID:     stripeSub.Customer.ID,
		ProviderSubscriptionID: stripeSub.ID,
		Status:                 s.stripeAdapter.MapSubscriptionStatus(stripeSub.Status),
		CountryCode:            countryCode,
		CurrentPeriodStart:     &periodStart,
		CurrentPeriodEnd:       &periodEnd,
	}
	
	if stripeSub.TrialEnd > 0 {
		trialEnd := time.Unix(stripeSub.TrialEnd, 0)
		sub.TrialEndsAt = &trialEnd
	}
	
	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}
	
	// Lock billing country after first subscription
	if err := s.billingService.LockBillingCountry(uint(userID), countryCode); err != nil {
		log.Printf("[WEBHOOK] Warning: failed to lock billing country: %v", err)
	}

	// Activate Pro if subscription is active (no trial — payment required upfront)
	if sub.Status == models.BillingSubStatusActive {
		if err := s.billingService.UpdateUserPremiumStatus(uint(userID), true); err != nil {
			log.Printf("[WEBHOOK] Warning: failed to activate Pro on subscription create: %v", err)
		}
	}

	log.Printf("[WEBHOOK] Stripe subscription created: user=%d sub=%s status=%s",
		userID, stripeSub.ID, stripeSub.Status)

	return nil
}

func (s *WebhookService) handleStripeSubscriptionUpdated(event *stripe.Event) error {
	var stripeSub stripe.Subscription
	if err := json.Unmarshal(event.Data.Raw, &stripeSub); err != nil {
		return err
	}
	
	// Get existing subscription
	sub, err := s.billingService.GetSubscriptionByProviderID(stripeSub.ID)
	if err != nil {
		if errors.Is(err, ErrSubscriptionNotFound) {
			// Subscription not in our DB yet, might be created by this event
			return s.handleStripeSubscriptionCreated(event)
		}
		return err
	}
	
	// Update subscription
	sub.Status = s.stripeAdapter.MapSubscriptionStatus(stripeSub.Status)
	
	periodStart := time.Unix(stripeSub.CurrentPeriodStart, 0)
	periodEnd := time.Unix(stripeSub.CurrentPeriodEnd, 0)
	sub.CurrentPeriodStart = &periodStart
	sub.CurrentPeriodEnd = &periodEnd
	
	if stripeSub.CanceledAt > 0 {
		canceledAt := time.Unix(stripeSub.CanceledAt, 0)
		sub.CanceledAt = &canceledAt
	}
	
	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}
	
	// Update user premium status
	isPremium := sub.Status == models.BillingSubStatusActive || sub.Status == models.BillingSubStatusTrialing
	if err := s.billingService.UpdateUserPremiumStatus(sub.UserID, isPremium); err != nil {
		log.Printf("[WEBHOOK] Warning: failed to update user premium status: %v", err)
	}
	
	log.Printf("[WEBHOOK] Stripe subscription updated: sub=%s status=%s", stripeSub.ID, stripeSub.Status)
	
	return nil
}

func (s *WebhookService) handleStripeSubscriptionDeleted(event *stripe.Event) error {
	var stripeSub stripe.Subscription
	if err := json.Unmarshal(event.Data.Raw, &stripeSub); err != nil {
		return err
	}
	
	// Get existing subscription
	sub, err := s.billingService.GetSubscriptionByProviderID(stripeSub.ID)
	if err != nil {
		if errors.Is(err, ErrSubscriptionNotFound) {
			return nil // Already deleted or not in DB
		}
		return err
	}
	
	// Update subscription status
	sub.Status = models.BillingSubStatusCanceled
	now := time.Now()
	sub.CanceledAt = &now
	
	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}
	
	// Update user premium status
	if err := s.billingService.UpdateUserPremiumStatus(sub.UserID, false); err != nil {
		log.Printf("[WEBHOOK] Warning: failed to update user premium status: %v", err)
	}
	
	log.Printf("[WEBHOOK] Stripe subscription deleted: sub=%s user=%d", stripeSub.ID, sub.UserID)
	
	return nil
}

func (s *WebhookService) handleStripeInvoicePaid(event *stripe.Event) error {
	var stripeInvoice stripe.Invoice
	if err := json.Unmarshal(event.Data.Raw, &stripeInvoice); err != nil {
		return err
	}
	
	// Get subscription
	sub, err := s.billingService.GetSubscriptionByProviderID(stripeInvoice.Subscription.ID)
	if err != nil {
		log.Printf("[WEBHOOK] Warning: invoice paid but subscription not found: %s", stripeInvoice.Subscription.ID)
		return nil // Don't fail, subscription might not be created yet
	}
	
	// Create invoice record
	paidAt := time.Unix(stripeInvoice.StatusTransitions.PaidAt, 0)
	invoice := &models.Invoice{
		UserID:            sub.UserID,
		SubscriptionID:    &sub.ID,
		Provider:          models.PaymentProviderStripe,
		ProviderInvoiceID: stripeInvoice.ID,
		AmountCents:       int(stripeInvoice.AmountPaid),
		Currency:          string(stripeInvoice.Currency),
		BasePriceUSDCents: int(stripeInvoice.AmountPaid), // TODO: extract from metadata
		Status:            models.InvoiceStatusPaid,
		PaidAt:            &paidAt,
	}
	
	if err := s.billingService.CreateInvoice(invoice); err != nil {
		// Might be duplicate, that's OK
		log.Printf("[WEBHOOK] Warning: failed to create invoice: %v", err)
	}
	
	// Ensure user has premium status
	if err := s.billingService.UpdateUserPremiumStatus(sub.UserID, true); err != nil {
		log.Printf("[WEBHOOK] Warning: failed to update user premium status: %v", err)
	}
	
	log.Printf("[WEBHOOK] Stripe invoice paid: invoice=%s user=%d amount=%d %s",
		stripeInvoice.ID, sub.UserID, stripeInvoice.AmountPaid, stripeInvoice.Currency)
	
	return nil
}

func (s *WebhookService) handleStripeInvoicePaymentFailed(event *stripe.Event) error {
	var stripeInvoice stripe.Invoice
	if err := json.Unmarshal(event.Data.Raw, &stripeInvoice); err != nil {
		return err
	}
	
	log.Printf("[WEBHOOK] Stripe invoice payment failed: invoice=%s", stripeInvoice.ID)
	
	// Update invoice status if exists
	s.billingService.UpdateInvoiceStatus(stripeInvoice.ID, models.InvoiceStatusFailed, nil)
	
	return nil
}

// RazorpayWebhookPayload represents a Razorpay webhook payload
type RazorpayWebhookPayload struct {
	Entity    string          `json:"entity"`
	AccountID string          `json:"account_id"`
	Event     string          `json:"event"`
	Contains  []string        `json:"contains"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt int64           `json:"created_at"`
}

// HandleRazorpayWebhook processes a Razorpay webhook event
func (s *WebhookService) HandleRazorpayWebhook(payload []byte, signature string) error {
	// Verify signature
	if err := s.razorpayAdapter.VerifyWebhookSignature(payload, signature); err != nil {
		log.Printf("[WEBHOOK] Razorpay signature verification failed: %v", err)
		return err
	}
	
	// Parse webhook payload
	var webhookPayload RazorpayWebhookPayload
	if err := json.Unmarshal(payload, &webhookPayload); err != nil {
		return err
	}
	
	// Generate event ID from payload
	eventID := strconv.FormatInt(webhookPayload.CreatedAt, 10) + "_" + webhookPayload.Event
	
	// Record event for idempotency
	paymentEvent, err := s.billingService.RecordPaymentEvent(
		models.PaymentProviderRazorpay,
		eventID,
		webhookPayload.Event,
		payload,
	)
	if err != nil {
		if errors.Is(err, ErrEventAlreadyProcessed) {
			log.Printf("[WEBHOOK] Razorpay event %s already processed, skipping", eventID)
			return nil
		}
		return err
	}
	
	// Process event
	var processErr error
	switch webhookPayload.Event {
	case "subscription.authenticated":
		processErr = s.handleRazorpaySubscriptionAuthenticated(webhookPayload)
	case "subscription.activated":
		processErr = s.handleRazorpaySubscriptionActivated(webhookPayload)
	case "subscription.charged":
		processErr = s.handleRazorpaySubscriptionCharged(webhookPayload)
	case "subscription.cancelled":
		processErr = s.handleRazorpaySubscriptionCancelled(webhookPayload)
	case "subscription.halted":
		processErr = s.handleRazorpaySubscriptionHalted(webhookPayload)
	case "payment.captured":
		processErr = s.handleRazorpayPaymentCaptured(webhookPayload)
	default:
		log.Printf("[WEBHOOK] Unhandled Razorpay event type: %s", webhookPayload.Event)
	}
	
	// Mark event as processed
	s.billingService.MarkEventProcessed(paymentEvent.ID, processErr)
	
	if processErr != nil {
		log.Printf("[WEBHOOK] Razorpay event %s processing failed: %v", eventID, processErr)
	} else {
		log.Printf("[WEBHOOK] Razorpay event %s processed successfully", eventID)
	}
	
	return processErr
}

func (s *WebhookService) handleRazorpaySubscriptionAuthenticated(webhookPayload RazorpayWebhookPayload) error {
	log.Printf("[WEBHOOK] Razorpay subscription authenticated")
	return nil
}

func (s *WebhookService) handleRazorpaySubscriptionActivated(webhookPayload RazorpayWebhookPayload) error {
	// Parse subscription from payload
	var payloadData struct {
		Subscription struct {
			Entity json.RawMessage `json:"entity"`
		} `json:"subscription"`
	}
	if err := json.Unmarshal(webhookPayload.Payload, &payloadData); err != nil {
		return err
	}
	
	var razorpaySub RazorpaySubscription
	if err := json.Unmarshal(payloadData.Subscription.Entity, &razorpaySub); err != nil {
		return err
	}
	
	// Extract user ID from notes
	userIDStr, ok := razorpaySub.Notes["user_id"]
	if !ok {
		return errors.New("missing user_id in subscription notes")
	}
	userID, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		return err
	}
	
	planCode := razorpaySub.Notes["plan_code"]
	countryCode := razorpaySub.Notes["country_code"]
	
	// Create subscription record
	periodStart := time.Unix(razorpaySub.CurrentStart, 0)
	periodEnd := time.Unix(razorpaySub.CurrentEnd, 0)
	
	sub := &models.Subscription{
		UserID:                 uint(userID),
		PlanCode:               planCode,
		Provider:               models.PaymentProviderRazorpay,
		ProviderCustomerID:     razorpaySub.CustomerID,
		ProviderSubscriptionID: razorpaySub.ID,
		Status:                 s.razorpayAdapter.MapSubscriptionStatus(razorpaySub.Status),
		CountryCode:            countryCode,
		CurrentPeriodStart:     &periodStart,
		CurrentPeriodEnd:       &periodEnd,
	}
	
	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}
	
	// Lock billing country
	if err := s.billingService.LockBillingCountry(uint(userID), countryCode); err != nil {
		log.Printf("[WEBHOOK] Warning: failed to lock billing country: %v", err)
	}
	
	// Update user premium status
	if err := s.billingService.UpdateUserPremiumStatus(uint(userID), true); err != nil {
		log.Printf("[WEBHOOK] Warning: failed to update user premium status: %v", err)
	}
	
	log.Printf("[WEBHOOK] Razorpay subscription activated: user=%d sub=%s", userID, razorpaySub.ID)
	
	return nil
}

func (s *WebhookService) handleRazorpaySubscriptionCharged(webhookPayload RazorpayWebhookPayload) error {
	log.Printf("[WEBHOOK] Razorpay subscription charged")
	// Similar to invoice paid - create invoice record
	return nil
}

func (s *WebhookService) handleRazorpaySubscriptionCancelled(webhookPayload RazorpayWebhookPayload) error {
	log.Printf("[WEBHOOK] Razorpay subscription cancelled")
	// Update subscription status and user premium
	return nil
}

func (s *WebhookService) handleRazorpaySubscriptionHalted(webhookPayload RazorpayWebhookPayload) error {
	log.Printf("[WEBHOOK] Razorpay subscription halted (payment failed)")
	return nil
}

func (s *WebhookService) handleRazorpayPaymentCaptured(webhookPayload RazorpayWebhookPayload) error {
	log.Printf("[WEBHOOK] Razorpay payment captured")
	return nil
}
