package billing

import (
	"errors"
	"fmt"
	"log"
	"strconv"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	portalsession "github.com/stripe/stripe-go/v76/billingportal/session"
	"github.com/stripe/stripe-go/v76/subscription"
	"github.com/stripe/stripe-go/v76/webhook"
	"gorm.io/gorm"
)

var (
	ErrStripeCustomerNotFound = errors.New("stripe customer not found")
	ErrStripeWebhookInvalid   = errors.New("invalid stripe webhook signature")
)

// StripeAdapter handles Stripe payment operations
type StripeAdapter struct {
	db            *gorm.DB
	webhookSecret string
	successURL    string
	cancelURL     string
}

// NewStripeAdapter creates a new Stripe adapter
func NewStripeAdapter(db *gorm.DB, apiKey, webhookSecret, successURL, cancelURL string) *StripeAdapter {
	stripe.Key = apiKey
	return &StripeAdapter{
		db:            db,
		webhookSecret: webhookSecret,
		successURL:    successURL,
		cancelURL:     cancelURL,
	}
}

// GetOrCreateCustomer gets or creates a Stripe customer for a user
func (a *StripeAdapter) GetOrCreateCustomer(user *models.User) (string, error) {
	// Check if user already has a Stripe customer ID
	if user.StripeCustomerID != nil && *user.StripeCustomerID != "" {
		return *user.StripeCustomerID, nil
	}
	
	// Create new customer
	params := &stripe.CustomerParams{
		Email: stripe.String(user.Email),
		Name:  stripe.String(user.Name),
		Metadata: map[string]string{
			"user_id": strconv.FormatUint(uint64(user.ID), 10),
		},
	}
	
	c, err := customer.New(params)
	if err != nil {
		return "", fmt.Errorf("failed to create stripe customer: %w", err)
	}
	
	// Save customer ID to user
	user.StripeCustomerID = &c.ID
	if err := a.db.Model(user).Update("stripe_customer_id", c.ID).Error; err != nil {
		log.Printf("[STRIPE] Warning: failed to save customer ID to user: %v", err)
	}
	
	log.Printf("[STRIPE] Created customer %s for user %d", c.ID, user.ID)
	return c.ID, nil
}

// CreateCheckoutSession creates a Stripe Checkout session for subscription.
// When embedded=true it uses UIMode "embedded" and returns a client_secret instead of a URL.
func (a *StripeAdapter) CreateCheckoutSession(user *models.User, quote *models.PricingQuote, plan *models.Plan, embedded bool) (*stripe.CheckoutSession, error) {
	customerID, err := a.GetOrCreateCustomer(user)
	if err != nil {
		return nil, err
	}

	// Build line item with price data
	priceData := &stripe.CheckoutSessionLineItemPriceDataParams{
		Currency: stripe.String(quote.Currency),
		ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
			Name:        stripe.String(plan.Name),
			Description: stripe.String(plan.Description),
		},
		UnitAmount: stripe.Int64(int64(quote.FinalPriceCents)),
		Recurring: &stripe.CheckoutSessionLineItemPriceDataRecurringParams{
			Interval: stripe.String(plan.BillingInterval),
		},
	}

	// Build checkout session params
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: priceData,
				Quantity:  stripe.Int64(1),
			},
		},
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
			Metadata: map[string]string{
				"user_id":             strconv.FormatUint(uint64(user.ID), 10),
				"plan_code":           quote.PlanCode,
				"country_code":        quote.CountryCode,
				"base_price_usd":      strconv.Itoa(quote.BasePriceUSDCents),
				"final_price":         strconv.Itoa(quote.FinalPriceCents),
				"currency":            quote.Currency,
				"fx_rate":             fmt.Sprintf("%.6f", quote.FXRate),
				"fx_rate_as_of":       quote.FXRateAsOfDate,
				"quote_signature":     quote.QuoteSignature,
			},
		},
		Metadata: map[string]string{
			"user_id":   strconv.FormatUint(uint64(user.ID), 10),
			"plan_code": quote.PlanCode,
		},
	}
	
	// Add trial if configured
	if plan.TrialDays > 0 {
		params.SubscriptionData.TrialPeriodDays = stripe.Int64(int64(plan.TrialDays))
	}

	// Embedded checkout: return client_secret; standard: redirect via URL
	if embedded {
		params.UIMode    = stripe.String("embedded")
		params.ReturnURL = stripe.String(a.successURL + "?session_id={CHECKOUT_SESSION_ID}")
	} else {
		params.SuccessURL = stripe.String(a.successURL + "?session_id={CHECKOUT_SESSION_ID}")
		params.CancelURL  = stripe.String(a.cancelURL)
	}

	sess, err := session.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create checkout session: %w", err)
	}
	
	log.Printf("[STRIPE] Created checkout session %s for user %d", sess.ID, user.ID)
	return sess, nil
}

// CreateBillingPortalSession creates a Stripe Billing Portal session
func (a *StripeAdapter) CreateBillingPortalSession(user *models.User, returnURL string) (*stripe.BillingPortalSession, error) {
	if user.StripeCustomerID == nil || *user.StripeCustomerID == "" {
		return nil, ErrStripeCustomerNotFound
	}
	
	params := &stripe.BillingPortalSessionParams{
		Customer:  user.StripeCustomerID,
		ReturnURL: stripe.String(returnURL),
	}
	
	sess, err := portalsession.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create billing portal session: %w", err)
	}
	
	return sess, nil
}

// CancelSubscription cancels a Stripe subscription
func (a *StripeAdapter) CancelSubscription(subscriptionID string, immediate bool) error {
	if immediate {
		_, err := subscription.Cancel(subscriptionID, nil)
		return err
	}
	
	// Cancel at period end
	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}
	_, err := subscription.Update(subscriptionID, params)
	return err
}

// GetSubscription retrieves a Stripe subscription
func (a *StripeAdapter) GetSubscription(subscriptionID string) (*stripe.Subscription, error) {
	return subscription.Get(subscriptionID, nil)
}

// VerifyWebhookSignature verifies the Stripe webhook signature
func (a *StripeAdapter) VerifyWebhookSignature(payload []byte, sigHeader string) (*stripe.Event, error) {
	event, err := webhook.ConstructEvent(payload, sigHeader, a.webhookSecret)
	if err != nil {
		return nil, ErrStripeWebhookInvalid
	}
	return &event, nil
}

// MapSubscriptionStatus maps Stripe status to our internal status
func (a *StripeAdapter) MapSubscriptionStatus(stripeStatus stripe.SubscriptionStatus) models.BillingSubscriptionStatus {
	switch stripeStatus {
	case stripe.SubscriptionStatusTrialing:
		return models.BillingSubStatusTrialing
	case stripe.SubscriptionStatusActive:
		return models.BillingSubStatusActive
	case stripe.SubscriptionStatusPastDue:
		return models.BillingSubStatusPastDue
	case stripe.SubscriptionStatusCanceled:
		return models.BillingSubStatusCanceled
	case stripe.SubscriptionStatusIncomplete:
		return models.BillingSubStatusIncomplete
	case stripe.SubscriptionStatusIncompleteExpired:
		return models.BillingSubStatusExpired
	default:
		return models.BillingSubStatusIncomplete
	}
}

// MapInvoiceStatus maps Stripe invoice status to our internal status
func (a *StripeAdapter) MapInvoiceStatus(stripeStatus stripe.InvoiceStatus) models.InvoiceStatus {
	switch stripeStatus {
	case stripe.InvoiceStatusOpen:
		return models.InvoiceStatusOpen
	case stripe.InvoiceStatusPaid:
		return models.InvoiceStatusPaid
	case stripe.InvoiceStatusVoid:
		return models.InvoiceStatusVoid
	case stripe.InvoiceStatusUncollectible:
		return models.InvoiceStatusUncollectible
	default:
		return models.InvoiceStatusOpen
	}
}
