package billing

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
)

// WebhookService handles payment webhooks
type WebhookService struct {
	billingService *BillingService
	dodoAdapter    *DodoAdapter
}

// NewWebhookService creates a new webhook service
func NewWebhookService(billingService *BillingService, dodoAdapter *DodoAdapter) *WebhookService {
	return &WebhookService{
		billingService: billingService,
		dodoAdapter:    dodoAdapter,
	}
}

// ===========================================================================
// DodoPayments Webhook Handlers
// ===========================================================================

// HandleDodoWebhook verifies the signature and dispatches Dodo webhook events.
// webhookID, timestamp, signatureHeader come from the Standard Webhooks headers.
func (s *WebhookService) HandleDodoWebhook(payload []byte, webhookID, timestamp, signatureHeader string) error {
	// 1. Verify HMAC-SHA256 signature (Standard Webhooks spec)
	if err := s.dodoAdapter.VerifyWebhookSignature(payload, webhookID, timestamp, signatureHeader); err != nil {
		log.Printf("[WEBHOOK/DODO] Signature verification failed: %v", err)
		return err
	}

	// 2. Parse envelope
	var event DodoWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return errors.New("dodo webhook: cannot parse event envelope")
	}

	// 3. Idempotency — use webhook-id as the unique event identifier
	paymentEvent, err := s.billingService.RecordPaymentEvent(
		models.PaymentProviderDodo,
		webhookID,
		event.Type,
		payload,
	)
	if err != nil {
		if errors.Is(err, ErrEventAlreadyProcessed) {
			log.Printf("[WEBHOOK/DODO] Event %s already processed, skipping", webhookID)
			return nil
		}
		return err
	}

	// 4. Dispatch
	var processErr error
	switch event.Type {
	case "subscription.active":
		processErr = s.handleDodoSubscriptionActive(event)
	case "subscription.renewed":
		processErr = s.handleDodoSubscriptionRenewed(event)
	case "subscription.cancelled":
		processErr = s.handleDodoSubscriptionCancelled(event)
	case "subscription.expired":
		processErr = s.handleDodoSubscriptionExpired(event)
	case "subscription.on_hold", "subscription.failed":
		processErr = s.handleDodoSubscriptionFailed(event)
	case "payment.succeeded":
		processErr = s.handleDodoPaymentSucceeded(event)
	case "payment.failed":
		processErr = s.handleDodoPaymentFailed(event)
	default:
		log.Printf("[WEBHOOK/DODO] Unhandled event type: %s", event.Type)
	}

	// 5. Mark processed / failed
	s.billingService.MarkEventProcessed(paymentEvent.ID, processErr)

	if processErr != nil {
		log.Printf("[WEBHOOK/DODO] Event %s (%s) failed: %v", webhookID, event.Type, processErr)
	} else {
		log.Printf("[WEBHOOK/DODO] Event %s (%s) processed successfully", webhookID, event.Type)
	}
	return processErr
}

func (s *WebhookService) handleDodoSubscriptionActive(event DodoWebhookEvent) error {
	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		return err
	}

	userID, planCode, countryCode, err := extractDodoMetadata(data.Metadata)
	if err != nil {
		return err
	}

	startStr, endStr := data.PeriodBounds()
	periodStart, periodEnd := parseDodoPeriod(startStr, endStr)

	customerID := data.EffectiveCustomerID()

	// Look up an existing subscription for this provider_subscription_id
	// FIRST. Without this check, a replayed subscription.active webhook
	// would silently INSERT a second row for the same Dodo subscription
	// (jeyachandran on 2026-07-05 had exactly this — a manual recovery
	// INSERT + a webhook replay created two rows). Now: mutate the
	// existing row when we find one; only insert when we don't.
	sub, err := s.billingService.GetSubscriptionByProviderID(data.SubscriptionID)
	if err != nil && !errors.Is(err, ErrSubscriptionNotFound) {
		return err
	}
	if sub == nil {
		sub = &models.Subscription{
			ProviderSubscriptionID: data.SubscriptionID,
			Provider:               models.PaymentProviderDodo,
		}
	}
	sub.UserID = userID
	sub.PlanCode = planCode
	sub.ProviderCustomerID = customerID
	sub.Status = s.dodoAdapter.MapSubscriptionStatus(data.Status)
	sub.CountryCode = countryCode
	sub.CurrentPeriodStart = periodStart
	sub.CurrentPeriodEnd = periodEnd
	// Clear cancellation fields on re-activation. A user who cancelled
	// then resubscribed with the same subscription_id (rare but Dodo
	// supports it) should not still show canceled_at set.
	sub.CanceledAt = nil
	sub.CancelReason = ""

	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}

	// Lock billing country on first subscription
	if err := s.billingService.LockBillingCountry(userID, countryCode); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to lock billing country: %v", err)
	}

	// Store Dodo customer ID on user record
	if err := s.billingService.UpdateUserDodoCustomerID(userID, customerID); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to store dodo customer id: %v", err)
	}

	// Fail LOUDLY on Pro activation failure so Dodo retries — this is the
	// paying-user path and the whole reason the webhook exists.
	if err := s.billingService.UpdateUserPremiumStatus(userID, true); err != nil {
		log.Printf("[WEBHOOK/DODO] ERROR: failed to activate Pro for user %d (sub=%s): %v", userID, data.SubscriptionID, err)
		return fmt.Errorf("activate Pro for user %d: %w", userID, err)
	}
	log.Printf("[WEBHOOK/DODO] Pro activated: user=%d sub=%s", userID, data.SubscriptionID)

	if err := s.billingService.UpdateUserSubscriptionEnd(userID, periodEnd); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to set subscription_end for user %d: %v", userID, err)
	}

	// Mark the corresponding CheckoutAttempt as completed so the
	// abandoned-checkout follow-up cron won't nag a user who finished.
	if err := s.billingService.MarkCheckoutCompleted(data.SubscriptionID); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to mark checkout attempt completed for sub=%s: %v", data.SubscriptionID, err)
	}
	return nil
}

func (s *WebhookService) handleDodoSubscriptionRenewed(event DodoWebhookEvent) error {
	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		return err
	}

	sub, err := s.billingService.GetSubscriptionByProviderID(data.SubscriptionID)
	if err != nil {
		if errors.Is(err, ErrSubscriptionNotFound) {
			// Treat as a new activation
			return s.handleDodoSubscriptionActive(event)
		}
		return err
	}

	startStr, endStr := data.PeriodBounds()
	periodStart, periodEnd := parseDodoPeriod(startStr, endStr)
	sub.Status = s.dodoAdapter.MapSubscriptionStatus(data.Status)
	sub.CurrentPeriodStart = periodStart
	sub.CurrentPeriodEnd = periodEnd

	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}

	// Renewal is also a "paying customer" event — Pro must stay on. Fail
	// loudly so Dodo retries if the update didn't take.
	if err := s.billingService.UpdateUserPremiumStatus(sub.UserID, true); err != nil {
		log.Printf("[WEBHOOK/DODO] ERROR: failed to keep Pro on renewal for user %d (sub=%s): %v", sub.UserID, data.SubscriptionID, err)
		return fmt.Errorf("keep Pro on renewal for user %d: %w", sub.UserID, err)
	}
	if err := s.billingService.UpdateUserSubscriptionEnd(sub.UserID, periodEnd); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to set subscription_end for user %d: %v", sub.UserID, err)
	}

	log.Printf("[WEBHOOK/DODO] Subscription renewed: sub=%s user=%d", data.SubscriptionID, sub.UserID)
	return nil
}

func (s *WebhookService) handleDodoSubscriptionCancelled(event DodoWebhookEvent) error {
	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		return err
	}

	sub, err := s.billingService.GetSubscriptionByProviderID(data.SubscriptionID)
	if err != nil {
		if errors.Is(err, ErrSubscriptionNotFound) {
			return nil // Already gone
		}
		return err
	}

	now := time.Now()
	sub.Status = models.BillingSubStatusCanceled
	sub.CanceledAt = &now

	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}
	// Deactivation: log at ERROR if it fails, but don't return an error —
	// a stuck cancellation shouldn't cause Dodo to retry-storm on us. The
	// operator sees the ERROR log and reconciles manually if needed. Pro
	// staying on slightly too long is a smaller wound than a paying user
	// missing Pro entirely (which is why activation IS fatal above).
	if err := s.billingService.UpdateUserPremiumStatus(sub.UserID, false); err != nil {
		log.Printf("[WEBHOOK/DODO] ERROR: failed to revoke Pro for user %d (sub=%s): %v", sub.UserID, data.SubscriptionID, err)
	}
	if err := s.billingService.UpdateUserSubscriptionEnd(sub.UserID, nil); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to clear subscription_end for user %d: %v", sub.UserID, err)
	}

	log.Printf("[WEBHOOK/DODO] Subscription cancelled: sub=%s user=%d", data.SubscriptionID, sub.UserID)
	return nil
}

func (s *WebhookService) handleDodoSubscriptionExpired(event DodoWebhookEvent) error {
	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		return err
	}

	sub, err := s.billingService.GetSubscriptionByProviderID(data.SubscriptionID)
	if err != nil {
		if errors.Is(err, ErrSubscriptionNotFound) {
			return nil
		}
		return err
	}

	sub.Status = models.BillingSubStatusExpired
	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}
	// Same deactivation-not-fatal rationale as cancelled path above.
	if err := s.billingService.UpdateUserPremiumStatus(sub.UserID, false); err != nil {
		log.Printf("[WEBHOOK/DODO] ERROR: failed to revoke Pro on expiry for user %d (sub=%s): %v", sub.UserID, data.SubscriptionID, err)
	}
	if err := s.billingService.UpdateUserSubscriptionEnd(sub.UserID, nil); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to clear subscription_end for user %d: %v", sub.UserID, err)
	}

	log.Printf("[WEBHOOK/DODO] Subscription expired: sub=%s user=%d", data.SubscriptionID, sub.UserID)
	return nil
}

func (s *WebhookService) handleDodoSubscriptionFailed(event DodoWebhookEvent) error {
	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		return err
	}

	sub, err := s.billingService.GetSubscriptionByProviderID(data.SubscriptionID)
	if err != nil {
		if errors.Is(err, ErrSubscriptionNotFound) {
			return nil
		}
		return err
	}

	sub.Status = models.BillingSubStatusPastDue
	if err := s.billingService.CreateOrUpdateSubscription(sub); err != nil {
		return err
	}

	log.Printf("[WEBHOOK/DODO] Subscription payment failed/on_hold: sub=%s user=%d", data.SubscriptionID, sub.UserID)
	return nil
}

func (s *WebhookService) handleDodoPaymentSucceeded(event DodoWebhookEvent) error {
	var data DodoPaymentEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		return err
	}

	// If the payment is linked to a subscription, ensure the invoice is recorded.
	if data.SubscriptionID == "" {
		log.Printf("[WEBHOOK/DODO] payment.succeeded with no subscription_id — skipping invoice (payment_id=%s)", data.PaymentID)
		return nil
	}

	sub, err := s.billingService.GetSubscriptionByProviderID(data.SubscriptionID)
	if err != nil {
		// Subscription may arrive slightly after payment event; don't fail hard.
		log.Printf("[WEBHOOK/DODO] Warning: payment.succeeded subscription not found: %s", data.SubscriptionID)
		return nil
	}

	now := time.Now()
	invoice := &models.Invoice{
		UserID:            sub.UserID,
		SubscriptionID:    &sub.ID,
		Provider:          models.PaymentProviderDodo,
		ProviderInvoiceID: data.PaymentID,
		AmountCents:       data.AmountTotal,
		Currency:          data.Currency,
		Status:            models.InvoiceStatusPaid,
		PaidAt:            &now,
	}
	if err := s.billingService.CreateInvoice(invoice); err != nil {
		log.Printf("[WEBHOOK/DODO] Warning: failed to create invoice: %v", err)
	}

	// Backup activation path (subscription.active should have fired first).
	// Fail loudly here too — if payment succeeded but Pro didn't activate,
	// we need Dodo to retry and the operator to see an ERROR log, not a
	// silently-buried Warning.
	if err := s.billingService.UpdateUserPremiumStatus(sub.UserID, true); err != nil {
		log.Printf("[WEBHOOK/DODO] ERROR: failed to ensure Pro on payment.succeeded (payment_id=%s, sub=%s, user=%d): %v",
			data.PaymentID, data.SubscriptionID, sub.UserID, err)
		return fmt.Errorf("ensure Pro on payment.succeeded (user %d): %w", sub.UserID, err)
	}

	log.Printf("[WEBHOOK/DODO] Payment succeeded: payment_id=%s sub=%s user=%d amount=%d %s",
		data.PaymentID, data.SubscriptionID, sub.UserID, data.AmountTotal, data.Currency)

	// Send the receipt email. Non-fatal — a missing receipt is cosmetic; the
	// user's Pro is already active by this point and the outer webhook
	// idempotency check guarantees we only reach here once per Dodo message.
	if user, uerr := s.billingService.GetUserByID(sub.UserID); uerr != nil {
		log.Printf("[WEBHOOK/DODO] Warning: cannot send receipt — user lookup failed (user=%d): %v", sub.UserID, uerr)
	} else {
		if err := SendPaymentReceipt(user.Email, PaymentReceiptData{
			RecipientName:   user.Name,
			PlanCode:        sub.PlanCode,
			AmountCents:     data.AmountTotal,
			Currency:        data.Currency,
			PaymentID:       data.PaymentID,
			SubscriptionID:  data.SubscriptionID,
			NextBillingDate: sub.CurrentPeriodEnd,
			PaidAt:          now,
		}); err != nil {
			log.Printf("[WEBHOOK/DODO] Warning: receipt email failed for user=%d payment=%s: %v", sub.UserID, data.PaymentID, err)
		}
	}

	return nil
}

func (s *WebhookService) handleDodoPaymentFailed(event DodoWebhookEvent) error {
	var data DodoPaymentEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		return err
	}
	log.Printf("[WEBHOOK/DODO] Payment failed: payment_id=%s sub=%s", data.PaymentID, data.SubscriptionID)
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func extractDodoMetadata(meta map[string]string) (userID uint, planCode, countryCode string, err error) {
	userIDStr, ok := meta["user_id"]
	if !ok {
		return 0, "", "", errors.New("dodo webhook: missing user_id in metadata")
	}
	id, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		return 0, "", "", errors.New("dodo webhook: invalid user_id in metadata")
	}
	return uint(id), meta["plan_code"], meta["country_code"], nil
}

func parseDodoPeriod(startStr, endStr string) (*time.Time, *time.Time) {
	parse := func(s string) *time.Time {
		if s == "" {
			return nil
		}
		// Try RFC3339, then Unix seconds
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return &t
		}
		if secs, err := strconv.ParseInt(s, 10, 64); err == nil {
			t := time.Unix(secs, 0)
			return &t
		}
		return nil
	}
	return parse(startStr), parse(endStr)
}
