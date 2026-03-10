package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
)

// ---------------------------------------------------------------------------
// DodoAdapter — wraps the DodoPayments REST API.
//
// We use a thin HTTP client rather than the Go SDK so that types are fully
// under our control and not subject to SDK churn.  The SDK can be dropped in
// as a replacement later by swapping only this file.
// ---------------------------------------------------------------------------

const (
	dodoLiveBase = "https://live.dodopayments.com"
	dodoTestBase = "https://test.dodopayments.com"
)

// DodoAdapter calls DodoPayments and verifies incoming webhooks.
type DodoAdapter struct {
	apiKey          string
	webhookSecret   string // as-received (may be whsec_… prefixed)
	productIDIndia  string // Dodo Product ID for India customers
	productIDGlobal string // Dodo Product ID for all other customers
	baseURL         string
	successURL      string
	cancelURL       string
	httpClient      *http.Client
	configured      bool
}

// NewDodoAdapter creates a configured adapter.
// Pass empty apiKey to create a no-op adapter (IsConfigured() == false).
func NewDodoAdapter(
	apiKey, webhookSecret, environment,
	productIDIndia, productIDGlobal,
	successURL, cancelURL string,
) *DodoAdapter {
	if apiKey == "" {
		return &DodoAdapter{configured: false}
	}

	base := dodoTestBase
	if strings.EqualFold(environment, "production") {
		base = dodoLiveBase
	}

	if successURL == "" {
		successURL = "https://prooftamil.com/billing/success"
	}
	if cancelURL == "" {
		cancelURL = "https://prooftamil.com/billing/cancel"
	}

	log.Printf("[DODO] Adapter init: env=%s india_product=%s global_product=%s",
		environment, productIDIndia, productIDGlobal)

	return &DodoAdapter{
		apiKey:          apiKey,
		webhookSecret:   webhookSecret,
		productIDIndia:  productIDIndia,
		productIDGlobal: productIDGlobal,
		baseURL:         base,
		successURL:      successURL,
		cancelURL:       cancelURL,
		httpClient:      &http.Client{Timeout: 15 * time.Second},
		configured:      true,
	}
}

// IsConfigured returns false when no API key was provided.
func (a *DodoAdapter) IsConfigured() bool {
	return a.configured
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (a *DodoAdapter) productIDFor(countryCode string) (string, error) {
	if strings.EqualFold(countryCode, "IN") {
		if a.productIDIndia == "" {
			return "", errors.New("DODO_PRODUCT_ID_INDIA is not set")
		}
		return a.productIDIndia, nil
	}
	if a.productIDGlobal == "" {
		return "", errors.New("DODO_PRODUCT_ID_GLOBAL is not set")
	}
	return a.productIDGlobal, nil
}

func (a *DodoAdapter) doPost(ctx context.Context, path string, body interface{}) ([]byte, int, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, 0, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+path, bytes.NewReader(b))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, err
}

func (a *DodoAdapter) doPatch(ctx context.Context, path string, body interface{}) ([]byte, int, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, 0, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, a.baseURL+path, bytes.NewReader(b))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, err
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

// DodoCheckoutResponse is the result of CreateSubscriptionCheckout.
type DodoCheckoutResponse struct {
	CheckoutURL    string
	SubscriptionID string
	CustomerID     string
}

// dodoSubscriptionCreateRequest is the payload sent to POST /subscriptions.
type dodoSubscriptionCreateRequest struct {
	ProductID string              `json:"product_id"`
	Customer  dodoCustomerPayload `json:"customer"`
	Metadata  map[string]string   `json:"metadata,omitempty"`
	ReturnURL string              `json:"return_url"`
}

type dodoCustomerPayload struct {
	// Attach an existing Dodo customer by ID…
	CustomerID string `json:"customer_id,omitempty"`
	// …or create one inline.
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
}

// dodoSubscriptionCreateResponse matches the relevant fields from the Dodo API response.
type dodoSubscriptionCreateResponse struct {
	SubscriptionID string             `json:"subscription_id"`
	PaymentLink    string             `json:"payment_link"`
	Customer       dodoCustomerObject `json:"customer"`
}

type dodoCustomerObject struct {
	CustomerID string `json:"customer_id"`
	Email      string `json:"email"`
	Name       string `json:"name"`
}

// CreateSubscriptionCheckout creates a Dodo hosted subscription checkout and
// returns the payment_link URL the user must be redirected to.
func (a *DodoAdapter) CreateSubscriptionCheckout(user *models.User, planCode, countryCode string) (*DodoCheckoutResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	productID, err := a.productIDFor(countryCode)
	if err != nil {
		return nil, err
	}

	customer := dodoCustomerPayload{
		Email: user.Email,
		Name:  user.Name,
	}
	// If user already has a Dodo customer ID, reuse it to pre-fill billing info.
	if user.DodoCustomerID != nil && *user.DodoCustomerID != "" {
		customer = dodoCustomerPayload{CustomerID: *user.DodoCustomerID}
	}

	reqBody := dodoSubscriptionCreateRequest{
		ProductID: productID,
		Customer:  customer,
		Metadata: map[string]string{
			"user_id":      fmt.Sprintf("%d", user.ID),
			"plan_code":    planCode,
			"country_code": countryCode,
		},
		ReturnURL: a.successURL,
	}

	respBytes, status, err := a.doPost(ctx, "/subscriptions", reqBody)
	if err != nil {
		return nil, fmt.Errorf("dodo create subscription request failed: %w", err)
	}
	if status >= 400 {
		return nil, fmt.Errorf("dodo create subscription failed (HTTP %d): %s", status, string(respBytes))
	}

	var apiResp dodoSubscriptionCreateResponse
	if err := json.Unmarshal(respBytes, &apiResp); err != nil {
		return nil, fmt.Errorf("dodo response parse error: %w", err)
	}
	if apiResp.PaymentLink == "" {
		return nil, errors.New("dodo response missing payment_link")
	}

	log.Printf("[DODO] Subscription checkout: subscription_id=%s product=%s user=%d country=%s",
		apiResp.SubscriptionID, productID, user.ID, countryCode)

	return &DodoCheckoutResponse{
		CheckoutURL:    apiResp.PaymentLink,
		SubscriptionID: apiResp.SubscriptionID,
		CustomerID:     apiResp.Customer.CustomerID,
	}, nil
}

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

// CancelSubscription cancels a Dodo subscription immediately.
func (a *DodoAdapter) CancelSubscription(subscriptionID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	body := map[string]string{"status": "cancelled"}
	respBytes, status, err := a.doPatch(ctx, "/subscriptions/"+subscriptionID, body)
	if err != nil {
		return fmt.Errorf("dodo cancel subscription request failed: %w", err)
	}
	if status >= 400 {
		return fmt.Errorf("dodo cancel failed (HTTP %d): %s", status, string(respBytes))
	}

	log.Printf("[DODO] Subscription cancelled: %s", subscriptionID)
	return nil
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Standard Webhooks spec)
// https://www.standardwebhooks.com
// ---------------------------------------------------------------------------

// VerifyWebhookSignature verifies the HMAC-SHA256 signature on an incoming
// Dodo webhook using the Standard Webhooks specification.
//
// Headers required:
//   - webhook-id        unique event ID
//   - webhook-timestamp Unix seconds as string
//   - webhook-signature "v1,<base64>" (space-separated if multiple)
func (a *DodoAdapter) VerifyWebhookSignature(payload []byte, webhookID, timestamp, signatureHeader string) error {
	if a.webhookSecret == "" {
		return errors.New("dodo webhook secret not configured")
	}
	if webhookID == "" || timestamp == "" || signatureHeader == "" {
		return errors.New("missing Standard Webhooks headers (webhook-id / webhook-timestamp / webhook-signature)")
	}

	// Decode the secret (strip optional "whsec_" prefix, then base64-decode).
	secretStr := strings.TrimPrefix(a.webhookSecret, "whsec_")
	secretBytes, err := base64.StdEncoding.DecodeString(secretStr)
	if err != nil {
		// Fallback: try URL-safe base64 (some tools emit this variant).
		secretBytes, err = base64.URLEncoding.DecodeString(secretStr)
		if err != nil {
			return fmt.Errorf("cannot decode dodo webhook secret: %w", err)
		}
	}

	// Replay-attack guard: reject webhooks older than ±5 minutes.
	if err := validateTimestamp(timestamp, 5*time.Minute); err != nil {
		return err
	}

	// Signed message format: "{webhook-id}.{webhook-timestamp}.{raw-body}"
	msg := webhookID + "." + timestamp + "." + string(payload)

	mac := hmac.New(sha256.New, secretBytes)
	mac.Write([]byte(msg))
	expected := "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil))

	// Header may carry multiple space-separated signatures (key rotation).
	for _, sig := range strings.Fields(signatureHeader) {
		if hmac.Equal([]byte(sig), []byte(expected)) {
			return nil
		}
	}
	return errors.New("dodo webhook signature mismatch")
}

func validateTimestamp(ts string, tolerance time.Duration) error {
	var secs int64
	if _, err := fmt.Sscanf(ts, "%d", &secs); err != nil {
		return fmt.Errorf("invalid webhook-timestamp %q: %w", ts, err)
	}
	delta := time.Since(time.Unix(secs, 0))
	if delta < -tolerance || delta > tolerance {
		return fmt.Errorf("webhook timestamp %q is outside ±%s window", ts, tolerance)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Webhook event types
// ---------------------------------------------------------------------------

// DodoWebhookEvent is the envelope for all incoming Dodo webhooks.
type DodoWebhookEvent struct {
	BusinessID string          `json:"business_id"`
	Type       string          `json:"type"` // e.g. "subscription.active"
	Timestamp  string          `json:"timestamp"`
	Data       json.RawMessage `json:"data"`
}

// DodoSubscriptionEventData is the "data" object for subscription.* events.
type DodoSubscriptionEventData struct {
	SubscriptionID    string            `json:"subscription_id"`
	CustomerID        string            `json:"customer_id"`
	ProductID         string            `json:"product_id"`
	Status            string            `json:"status"`
	CurrentPeriodStart string           `json:"current_period_start"`
	CurrentPeriodEnd   string           `json:"current_period_end"`
	CancelledAt        *string          `json:"cancelled_at,omitempty"`
	Metadata           map[string]string `json:"metadata,omitempty"`
}

// DodoPaymentEventData is the "data" object for payment.* events.
type DodoPaymentEventData struct {
	PaymentID      string            `json:"payment_id"`
	SubscriptionID string            `json:"subscription_id,omitempty"`
	CustomerID     string            `json:"customer_id"`
	Status         string            `json:"status"`
	AmountTotal    int               `json:"total_amount"` // in smallest currency unit
	Currency       string            `json:"currency"`
	Metadata       map[string]string `json:"metadata,omitempty"`
}

// MapSubscriptionStatus converts a Dodo status string to our internal enum.
func (a *DodoAdapter) MapSubscriptionStatus(status string) models.BillingSubscriptionStatus {
	switch strings.ToLower(status) {
	case "active":
		return models.BillingSubStatusActive
	case "trialing", "trial":
		return models.BillingSubStatusTrialing
	case "cancelled", "canceled":
		return models.BillingSubStatusCanceled
	case "past_due", "pastdue", "on_hold":
		return models.BillingSubStatusPastDue
	case "expired":
		return models.BillingSubStatusExpired
	default:
		return models.BillingSubStatusIncomplete
	}
}
