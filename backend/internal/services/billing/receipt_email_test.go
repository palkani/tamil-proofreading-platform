package billing

import (
	"os"
	"strings"
	"testing"
	"time"
)

// TestRenderReceiptHTML_snapshotToFile renders the receipt template with
// realistic data and writes it to /tmp/receipt-preview.html so the
// developer can open it in a browser and eyeball the output. Also asserts
// the rendered body contains the payment reference — a cheap check that
// the template's %s count matches its args.
func TestRenderReceiptHTML_snapshotToFile(t *testing.T) {
	nextBilling := time.Date(2026, 8, 3, 16, 43, 46, 0, time.UTC)
	body := renderReceiptHTML(PaymentReceiptData{
		RecipientName:   "Jeya Kopinath",
		PlanCode:        "PRO_MONTHLY",
		AmountCents:     1200,
		Currency:        "USD",
		PaymentID:       "pay_TEST123abc",
		SubscriptionID:  "sub_TEST456def",
		NextBillingDate: &nextBilling,
		PaidAt:          time.Date(2026, 7, 5, 10, 0, 0, 0, time.UTC),
	}, "https://www.prooftamil.com", "https://www.prooftamil.com/settings/billing")

	for _, want := range []string{
		"pay_TEST123abc",
		"ProofTamil Pro (Monthly)",
		"$12.00",
		"August 3, 2026",
		"Hi Jeya Kopinath,",
		"July 5, 2026",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("rendered receipt missing %q", want)
		}
	}

	// fmt.Sprintf silently produces %!(EXTRA / %!s markers when arg count is
	// wrong; catch those regressions here.
	for _, bad := range []string{"%!s", "%!(EXTRA", "%!(BADINDEX"} {
		if strings.Contains(body, bad) {
			t.Errorf("template format error: found %q in output", bad)
		}
	}

	if err := os.WriteFile("/tmp/receipt-preview.html", []byte(body), 0o644); err != nil {
		t.Logf("could not write preview file: %v", err)
	} else {
		t.Logf("preview written: /tmp/receipt-preview.html (open in browser)")
	}
}
