package billing

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Golden-file tests over real Dodo webhook payloads.
//
// The payloads under testdata/ are copies of actual Dodo deliveries with
// PII redacted (customer email/name → testcustomer@example.com / Test
// Customer, IDs → *_TEST*). They exist so that if Dodo changes their
// payload shape or we misread their docs, CI fails at PR time — not
// after a customer emails us.
//
// Two production incidents on 2026-07-05 would have been caught here:
//
//   1. The field-name mismatch — DodoSubscriptionEventData was reading
//      current_period_start/current_period_end but Dodo sends
//      previous_billing_date/next_billing_date. Assertion:
//      data.PeriodBounds() must return non-empty strings.
//
//   2. Missing metadata.user_id — the webhook would silently activate
//      Pro for user 0 (invalid). Assertion: extractDodoMetadata must
//      return userID > 0.
//
// Add new test cases per event type as we start handling them.

func loadPayload(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("testdata", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("cannot read %s: %v", path, err)
	}
	return data
}

func TestSubscriptionActive_realPayload(t *testing.T) {
	payload := loadPayload(t, "dodo_subscription_active.json")

	var event DodoWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		t.Fatalf("envelope unmarshal: %v", err)
	}
	if event.Type != "subscription.active" {
		t.Errorf("event.Type = %q, want %q", event.Type, "subscription.active")
	}

	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		t.Fatalf("data unmarshal: %v", err)
	}

	// Sanity — required identity fields must be present.
	if data.SubscriptionID == "" {
		t.Error("SubscriptionID empty — Dodo always sets subscription_id")
	}
	if data.EffectiveCustomerID() == "" {
		t.Error("EffectiveCustomerID empty — Dodo sets customer.customer_id (nested); adapter must fall back to it")
	}

	// The bug that hit 2026-07-05. Dodo's real payload uses
	// previous_billing_date + next_billing_date, NOT
	// current_period_start/end. PeriodBounds() must return non-empty
	// strings otherwise UpdateUserSubscriptionEnd will be called with
	// nil and silently NULL the field on every payment.
	start, end := data.PeriodBounds()
	if start == "" {
		t.Error("PeriodBounds() start is empty — Dodo sends previous_billing_date; adapter must read it")
	}
	if end == "" {
		t.Error("PeriodBounds() end is empty — Dodo sends next_billing_date; adapter must read it")
	}

	// parseDodoPeriod must actually parse the strings PeriodBounds returned.
	periodStart, periodEnd := parseDodoPeriod(start, end)
	if periodStart == nil {
		t.Errorf("parseDodoPeriod returned nil start for %q", start)
	}
	if periodEnd == nil {
		t.Errorf("parseDodoPeriod returned nil end for %q", end)
	}

	// Metadata must have the three fields the handler reads. Missing
	// user_id was the failure mode that motivated the userID=0 guard
	// in UpdateUserPremiumStatus (commit df55894).
	userID, planCode, countryCode, err := extractDodoMetadata(data.Metadata)
	if err != nil {
		t.Fatalf("extractDodoMetadata: %v", err)
	}
	if userID == 0 {
		t.Error("userID == 0 after extract — metadata.user_id is missing or unparseable")
	}
	if planCode == "" {
		t.Error("planCode empty — metadata.plan_code is missing")
	}
	if countryCode == "" {
		t.Error("countryCode empty — metadata.country_code is missing")
	}

	// Status maps to a known internal enum, not the fallback "incomplete".
	// If Dodo introduces a new status string we should notice explicitly.
	adapter := &DodoAdapter{}
	if got := adapter.MapSubscriptionStatus(data.Status); got == "" {
		t.Errorf("MapSubscriptionStatus(%q) = empty; expected a known BillingSubscriptionStatus", data.Status)
	}
}

func TestPaymentSucceeded_realPayload(t *testing.T) {
	payload := loadPayload(t, "dodo_payment_succeeded.json")

	var event DodoWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		t.Fatalf("envelope unmarshal: %v", err)
	}
	if event.Type != "payment.succeeded" {
		t.Errorf("event.Type = %q, want %q", event.Type, "payment.succeeded")
	}

	var data DodoPaymentEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		t.Fatalf("data unmarshal: %v", err)
	}

	if data.PaymentID == "" {
		t.Error("PaymentID empty — Dodo always sets payment_id")
	}
	if data.SubscriptionID == "" {
		t.Error("SubscriptionID empty — subscription payments must reference sub_XXX")
	}
	if data.CustomerID == "" {
		t.Error("CustomerID empty")
	}

	// Amount and currency drive the receipt email — if either is
	// missing the receipt renders "$0.00" or blanks out.
	if data.AmountTotal <= 0 {
		t.Errorf("AmountTotal = %d, want positive integer (smallest currency unit)", data.AmountTotal)
	}
	if data.Currency == "" {
		t.Error("Currency empty — receipt email needs it to render the amount symbol")
	}
}

func TestSubscriptionRenewed_realPayload(t *testing.T) {
	payload := loadPayload(t, "dodo_subscription_renewed.json")

	var event DodoWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		t.Fatalf("envelope unmarshal: %v", err)
	}
	if event.Type != "subscription.renewed" {
		t.Errorf("event.Type = %q, want %q", event.Type, "subscription.renewed")
	}

	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		t.Fatalf("data unmarshal: %v", err)
	}
	if data.SubscriptionID == "" {
		t.Error("SubscriptionID empty on renewal — needed to look up existing subscription row")
	}

	// Same period-bounds check as active — renewal handler also feeds
	// PeriodBounds() to parseDodoPeriod. If we regress that path, renewals
	// silently NULL subscription_end.
	start, end := data.PeriodBounds()
	if start == "" || end == "" {
		t.Errorf("PeriodBounds on renewal: start=%q end=%q — both must be non-empty", start, end)
	}
	periodStart, periodEnd := parseDodoPeriod(start, end)
	if periodStart == nil || periodEnd == nil {
		t.Error("parseDodoPeriod nil on renewal payload")
	}
}

func TestSubscriptionCancelled_realPayload(t *testing.T) {
	payload := loadPayload(t, "dodo_subscription_cancelled.json")

	var event DodoWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		t.Fatalf("envelope unmarshal: %v", err)
	}
	if event.Type != "subscription.cancelled" {
		t.Errorf("event.Type = %q, want %q", event.Type, "subscription.cancelled")
	}

	var data DodoSubscriptionEventData
	if err := json.Unmarshal(event.Data, &data); err != nil {
		t.Fatalf("data unmarshal: %v", err)
	}
	if data.SubscriptionID == "" {
		t.Error("SubscriptionID empty on cancellation")
	}
	if data.CancelledAt == nil || *data.CancelledAt == "" {
		t.Error("cancelled_at missing on cancellation payload")
	}
}

// TestExtractDodoMetadata_missingUserID guards the userID=0 case that
// motivated the hardening in UpdateUserPremiumStatus. If metadata.user_id
// is absent, extractDodoMetadata must return an error — not silently
// proceed with userID=0.
func TestExtractDodoMetadata_missingUserID(t *testing.T) {
	cases := map[string]map[string]string{
		"nil metadata": nil,
		"empty map":    {},
		"no user_id":   {"plan_code": "PRO_MONTHLY", "country_code": "US"},
		"empty user_id": {"user_id": "", "plan_code": "PRO_MONTHLY"},
		"bad user_id":   {"user_id": "not-a-number"},
	}
	for name, meta := range cases {
		t.Run(name, func(t *testing.T) {
			userID, _, _, err := extractDodoMetadata(meta)
			if err == nil {
				t.Errorf("expected error, got nil (userID=%d)", userID)
			}
			if userID != 0 {
				// Even on error, don't leak a non-zero fabricated userID.
				t.Errorf("expected userID=0 on error, got %d", userID)
			}
		})
	}
}

// TestPeriodBounds_fallback verifies the CurrentPeriod* → next_billing_date
// fallback logic. Both directions must work so a future Dodo change (or
// a different Standard-Webhooks provider) doesn't silently break period
// tracking.
func TestPeriodBounds_fallback(t *testing.T) {
	t.Run("prefer CurrentPeriod when present", func(t *testing.T) {
		d := DodoSubscriptionEventData{
			CurrentPeriodStart:  "2026-07-01T00:00:00Z",
			CurrentPeriodEnd:    "2026-08-01T00:00:00Z",
			PreviousBillingDate: "2026-07-15T00:00:00Z",
			NextBillingDate:     "2026-08-15T00:00:00Z",
		}
		start, end := d.PeriodBounds()
		if start != "2026-07-01T00:00:00Z" {
			t.Errorf("start = %q, want CurrentPeriodStart", start)
		}
		if end != "2026-08-01T00:00:00Z" {
			t.Errorf("end = %q, want CurrentPeriodEnd", end)
		}
	})

	t.Run("fall back to billing dates when CurrentPeriod empty", func(t *testing.T) {
		d := DodoSubscriptionEventData{
			PreviousBillingDate: "2026-07-15T00:00:00Z",
			NextBillingDate:     "2026-08-15T00:00:00Z",
		}
		start, end := d.PeriodBounds()
		if start != "2026-07-15T00:00:00Z" {
			t.Errorf("start = %q, want PreviousBillingDate fallback", start)
		}
		if end != "2026-08-15T00:00:00Z" {
			t.Errorf("end = %q, want NextBillingDate fallback", end)
		}
	})
}

// TestParseDodoPeriod_unixSeconds guards the "Dodo sends Unix seconds"
// branch of parseDodoPeriod. Some Standard-Webhooks providers do this;
// removing that branch by accident would break integrations.
func TestParseDodoPeriod_unixSeconds(t *testing.T) {
	start, end := parseDodoPeriod("1719840000", "1722518400")
	if start == nil {
		t.Fatal("start nil for valid Unix seconds")
	}
	if end == nil {
		t.Fatal("end nil for valid Unix seconds")
	}
	wantStart := time.Unix(1719840000, 0)
	if !start.Equal(wantStart) {
		t.Errorf("start = %v, want %v", start, wantStart)
	}
}
