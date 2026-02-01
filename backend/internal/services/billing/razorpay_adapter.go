package billing

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

const (
	RazorpayAPIBase = "https://api.razorpay.com/v1"
)

var (
	ErrRazorpayCustomerNotFound = errors.New("razorpay customer not found")
	ErrRazorpayWebhookInvalid   = errors.New("invalid razorpay webhook signature")
	ErrRazorpayAPIError         = errors.New("razorpay api error")
)

// RazorpayAdapter handles Razorpay payment operations
type RazorpayAdapter struct {
	db            *gorm.DB
	keyID         string
	keySecret     string
	webhookSecret string
	httpClient    *http.Client
}

// RazorpayOrder represents a Razorpay order response
type RazorpayOrder struct {
	ID          string `json:"id"`
	Entity      string `json:"entity"`
	Amount      int    `json:"amount"`
	AmountPaid  int    `json:"amount_paid"`
	Currency    string `json:"currency"`
	Receipt     string `json:"receipt,omitempty"`
	Status      string `json:"status"`
	Notes       map[string]string `json:"notes,omitempty"`
	CreatedAt   int64  `json:"created_at"`
}

// RazorpaySubscription represents a Razorpay subscription
type RazorpaySubscription struct {
	ID              string            `json:"id"`
	Entity          string            `json:"entity"`
	PlanID          string            `json:"plan_id"`
	Status          string            `json:"status"`
	CustomerID      string            `json:"customer_id"`
	CurrentStart    int64             `json:"current_start"`
	CurrentEnd      int64             `json:"current_end"`
	EndedAt         int64             `json:"ended_at,omitempty"`
	Quantity        int               `json:"quantity"`
	Notes           map[string]string `json:"notes,omitempty"`
	ChargeAt        int64             `json:"charge_at,omitempty"`
	OffferID        string            `json:"offer_id,omitempty"`
	ShortURL        string            `json:"short_url"`
	HasScheduledChanges bool          `json:"has_scheduled_changes"`
	ChangeScheduledAt   int64         `json:"change_scheduled_at,omitempty"`
	CreatedAt       int64             `json:"created_at"`
}

// RazorpayPlan represents a Razorpay plan
type RazorpayPlan struct {
	ID       string `json:"id"`
	Entity   string `json:"entity"`
	Interval int    `json:"interval"`
	Period   string `json:"period"` // daily, weekly, monthly, yearly
	Item     struct {
		ID          string `json:"id"`
		Active      bool   `json:"active"`
		Amount      int    `json:"amount"`
		Currency    string `json:"currency"`
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
	} `json:"item"`
	Notes     map[string]string `json:"notes,omitempty"`
	CreatedAt int64             `json:"created_at"`
}

// RazorpayCustomer represents a Razorpay customer
type RazorpayCustomer struct {
	ID      string `json:"id"`
	Entity  string `json:"entity"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Contact string `json:"contact,omitempty"`
	Notes   map[string]string `json:"notes,omitempty"`
}

// NewRazorpayAdapter creates a new Razorpay adapter
func NewRazorpayAdapter(db *gorm.DB, keyID, keySecret, webhookSecret string) *RazorpayAdapter {
	return &RazorpayAdapter{
		db:            db,
		keyID:         keyID,
		keySecret:     keySecret,
		webhookSecret: webhookSecret,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// doRequest performs an authenticated request to Razorpay API
func (a *RazorpayAdapter) doRequest(method, endpoint string, body interface{}) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(jsonBody)
	}
	
	req, err := http.NewRequest(method, RazorpayAPIBase+endpoint, reqBody)
	if err != nil {
		return nil, err
	}
	
	req.SetBasicAuth(a.keyID, a.keySecret)
	req.Header.Set("Content-Type", "application/json")
	
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	if resp.StatusCode >= 400 {
		log.Printf("[RAZORPAY] API error %d: %s", resp.StatusCode, string(respBody))
		return nil, fmt.Errorf("%w: %s", ErrRazorpayAPIError, string(respBody))
	}
	
	return respBody, nil
}

// GetOrCreateCustomer gets or creates a Razorpay customer for a user
func (a *RazorpayAdapter) GetOrCreateCustomer(user *models.User) (string, error) {
	// Check if user already has a Razorpay customer ID
	if user.RazorpayCustomerID != nil && *user.RazorpayCustomerID != "" {
		return *user.RazorpayCustomerID, nil
	}
	
	// Create new customer
	customerData := map[string]interface{}{
		"name":  user.Name,
		"email": user.Email,
		"notes": map[string]string{
			"user_id": strconv.FormatUint(uint64(user.ID), 10),
		},
	}
	
	respBody, err := a.doRequest("POST", "/customers", customerData)
	if err != nil {
		return "", fmt.Errorf("failed to create razorpay customer: %w", err)
	}
	
	var customer RazorpayCustomer
	if err := json.Unmarshal(respBody, &customer); err != nil {
		return "", err
	}
	
	// Save customer ID to user
	user.RazorpayCustomerID = &customer.ID
	if err := a.db.Model(user).Update("razorpay_customer_id", customer.ID).Error; err != nil {
		log.Printf("[RAZORPAY] Warning: failed to save customer ID to user: %v", err)
	}
	
	log.Printf("[RAZORPAY] Created customer %s for user %d", customer.ID, user.ID)
	return customer.ID, nil
}

// CreateOrder creates a Razorpay order for a one-time payment
func (a *RazorpayAdapter) CreateOrder(user *models.User, quote *models.PricingQuote) (*RazorpayOrder, error) {
	orderData := map[string]interface{}{
		"amount":   quote.FinalPriceCents, // Razorpay expects paise for INR
		"currency": quote.Currency,
		"receipt":  fmt.Sprintf("user_%d_%d", user.ID, time.Now().Unix()),
		"notes": map[string]string{
			"user_id":         strconv.FormatUint(uint64(user.ID), 10),
			"plan_code":       quote.PlanCode,
			"country_code":    quote.CountryCode,
			"base_price_usd":  strconv.Itoa(quote.BasePriceUSDCents),
			"final_price":     strconv.Itoa(quote.FinalPriceCents),
			"fx_rate":         fmt.Sprintf("%.6f", quote.FXRate),
			"quote_signature": quote.QuoteSignature,
		},
	}
	
	respBody, err := a.doRequest("POST", "/orders", orderData)
	if err != nil {
		return nil, fmt.Errorf("failed to create razorpay order: %w", err)
	}
	
	var order RazorpayOrder
	if err := json.Unmarshal(respBody, &order); err != nil {
		return nil, err
	}
	
	log.Printf("[RAZORPAY] Created order %s for user %d", order.ID, user.ID)
	return &order, nil
}

// CreatePlan creates a Razorpay plan for subscriptions
func (a *RazorpayAdapter) CreatePlan(name string, amountPaise int, currency, period string, interval int) (*RazorpayPlan, error) {
	planData := map[string]interface{}{
		"period":   period,   // monthly, yearly, etc.
		"interval": interval, // 1 for every month, 3 for quarterly, etc.
		"item": map[string]interface{}{
			"name":     name,
			"amount":   amountPaise,
			"currency": currency,
		},
	}
	
	respBody, err := a.doRequest("POST", "/plans", planData)
	if err != nil {
		return nil, fmt.Errorf("failed to create razorpay plan: %w", err)
	}
	
	var plan RazorpayPlan
	if err := json.Unmarshal(respBody, &plan); err != nil {
		return nil, err
	}
	
	log.Printf("[RAZORPAY] Created plan %s", plan.ID)
	return &plan, nil
}

// CreateSubscription creates a Razorpay subscription
func (a *RazorpayAdapter) CreateSubscription(user *models.User, quote *models.PricingQuote, razorpayPlanID string) (*RazorpaySubscription, error) {
	customerID, err := a.GetOrCreateCustomer(user)
	if err != nil {
		return nil, err
	}
	
	subData := map[string]interface{}{
		"plan_id":     razorpayPlanID,
		"customer_id": customerID,
		"total_count": 12, // 12 billing cycles
		"notes": map[string]string{
			"user_id":         strconv.FormatUint(uint64(user.ID), 10),
			"plan_code":       quote.PlanCode,
			"country_code":    quote.CountryCode,
			"base_price_usd":  strconv.Itoa(quote.BasePriceUSDCents),
			"final_price":     strconv.Itoa(quote.FinalPriceCents),
			"fx_rate":         fmt.Sprintf("%.6f", quote.FXRate),
			"quote_signature": quote.QuoteSignature,
		},
	}
	
	respBody, err := a.doRequest("POST", "/subscriptions", subData)
	if err != nil {
		return nil, fmt.Errorf("failed to create razorpay subscription: %w", err)
	}
	
	var sub RazorpaySubscription
	if err := json.Unmarshal(respBody, &sub); err != nil {
		return nil, err
	}
	
	log.Printf("[RAZORPAY] Created subscription %s for user %d", sub.ID, user.ID)
	return &sub, nil
}

// GetSubscription retrieves a Razorpay subscription
func (a *RazorpayAdapter) GetSubscription(subscriptionID string) (*RazorpaySubscription, error) {
	respBody, err := a.doRequest("GET", "/subscriptions/"+subscriptionID, nil)
	if err != nil {
		return nil, err
	}
	
	var sub RazorpaySubscription
	if err := json.Unmarshal(respBody, &sub); err != nil {
		return nil, err
	}
	
	return &sub, nil
}

// CancelSubscription cancels a Razorpay subscription
func (a *RazorpayAdapter) CancelSubscription(subscriptionID string, cancelAtCycleEnd bool) error {
	endpoint := fmt.Sprintf("/subscriptions/%s/cancel", subscriptionID)
	data := map[string]interface{}{
		"cancel_at_cycle_end": cancelAtCycleEnd,
	}
	
	_, err := a.doRequest("POST", endpoint, data)
	return err
}

// VerifyWebhookSignature verifies the Razorpay webhook signature
func (a *RazorpayAdapter) VerifyWebhookSignature(payload []byte, signature string) error {
	h := hmac.New(sha256.New, []byte(a.webhookSecret))
	h.Write(payload)
	expectedSig := hex.EncodeToString(h.Sum(nil))
	
	if !hmac.Equal([]byte(expectedSig), []byte(signature)) {
		return ErrRazorpayWebhookInvalid
	}
	
	return nil
}

// VerifyPaymentSignature verifies a Razorpay payment signature (for frontend verification)
func (a *RazorpayAdapter) VerifyPaymentSignature(orderID, paymentID, signature string) bool {
	data := orderID + "|" + paymentID
	h := hmac.New(sha256.New, []byte(a.keySecret))
	h.Write([]byte(data))
	expectedSig := hex.EncodeToString(h.Sum(nil))
	
	return hmac.Equal([]byte(expectedSig), []byte(signature))
}

// MapSubscriptionStatus maps Razorpay status to our internal status
func (a *RazorpayAdapter) MapSubscriptionStatus(razorpayStatus string) models.BillingSubscriptionStatus {
	switch razorpayStatus {
	case "created", "authenticated":
		return models.BillingSubStatusIncomplete
	case "active":
		return models.BillingSubStatusActive
	case "pending":
		return models.BillingSubStatusPastDue
	case "halted":
		return models.BillingSubStatusPastDue
	case "cancelled":
		return models.BillingSubStatusCanceled
	case "completed", "expired":
		return models.BillingSubStatusExpired
	default:
		return models.BillingSubStatusIncomplete
	}
}

// CheckoutPayload returns the data needed for frontend Razorpay checkout
type RazorpayCheckoutPayload struct {
	OrderID        string            `json:"order_id,omitempty"`
	SubscriptionID string            `json:"subscription_id,omitempty"`
	KeyID          string            `json:"key_id"`
	Amount         int               `json:"amount"`
	Currency       string            `json:"currency"`
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	PrefillEmail   string            `json:"prefill_email"`
	PrefillName    string            `json:"prefill_name"`
	Notes          map[string]string `json:"notes"`
	CallbackURL    string            `json:"callback_url,omitempty"`
}

// BuildCheckoutPayload builds the payload for frontend Razorpay integration
func (a *RazorpayAdapter) BuildCheckoutPayload(user *models.User, quote *models.PricingQuote, order *RazorpayOrder, plan *models.Plan, callbackURL string) *RazorpayCheckoutPayload {
	return &RazorpayCheckoutPayload{
		OrderID:      order.ID,
		KeyID:        a.keyID,
		Amount:       order.Amount,
		Currency:     order.Currency,
		Name:         "ProofTamil",
		Description:  plan.Name + " Subscription",
		PrefillEmail: user.Email,
		PrefillName:  user.Name,
		Notes: map[string]string{
			"user_id":   strconv.FormatUint(uint64(user.ID), 10),
			"plan_code": quote.PlanCode,
		},
		CallbackURL: callbackURL,
	}
}
