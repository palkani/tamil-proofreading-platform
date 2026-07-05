package billing

import (
	"fmt"
	"html"
	"log"
	"os"
	"strings"
	"time"

	emailsvc "tamil-proofreading-platform/backend/internal/services/email"
)

// PaymentReceiptData holds the data needed to render a receipt email.
// Populated by handleDodoPaymentSucceeded from the Dodo payment.succeeded
// event and the local subscription record.
type PaymentReceiptData struct {
	RecipientName   string     // display name shown in the greeting
	PlanCode        string     // e.g. "PRO_MONTHLY" — mapped to a friendly name for display
	AmountCents     int        // Dodo's total_amount (smallest currency unit)
	Currency        string     // ISO 4217 code, e.g. "USD", "INR"
	PaymentID       string     // Dodo pay_XXX — customers reference this when contacting support
	SubscriptionID  string     // Dodo sub_XXX
	NextBillingDate *time.Time // when the next auto-renewal charge will happen
	PaidAt          time.Time  // when this charge succeeded
}

// SendPaymentReceipt sends a payment receipt email to the customer.
//
// This is intentionally non-fatal: any error is logged and returned, but
// callers in the webhook path should not fail the webhook on a receipt
// failure (the customer's Pro is already active — a missing receipt is
// cosmetic, not a blocker).
//
// Idempotency is provided by the outer webhook layer: the Standard-Webhooks
// idempotency check in HandleDodoWebhook ensures this function runs once
// per Dodo message. If a webhook is replayed after a successful send, the
// handler short-circuits before reaching here.
func SendPaymentReceipt(toEmail string, data PaymentReceiptData) error {
	if strings.TrimSpace(toEmail) == "" {
		return fmt.Errorf("send receipt: recipient email is empty")
	}

	frontendURL := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
	if frontendURL == "" {
		frontendURL = "https://www.prooftamil.com"
	}
	manageURL := frontendURL + "/settings/billing"

	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		log.Printf("[EMAIL] Email service not configured. Skipping receipt for %s (payment=%s)", toEmail, data.PaymentID)
		return nil
	}

	subject := fmt.Sprintf("Your ProofTamil receipt — %s", formatAmount(data.AmountCents, data.Currency))
	htmlBody := renderReceiptHTML(data, frontendURL, manageURL)

	if err := svc.SendEmail(toEmail, subject, htmlBody); err != nil {
		log.Printf("[EMAIL] Failed to send receipt to %s (payment=%s): %v", toEmail, data.PaymentID, err)
		return err
	}
	log.Printf("[EMAIL] Receipt sent: to=%s payment=%s amount=%d %s", toEmail, data.PaymentID, data.AmountCents, data.Currency)
	return nil
}

// formatAmount renders a currency amount from cents. 1200 "USD" → "$12.00".
// Unknown currency codes fall back to "<CODE> 12.00" so nothing renders as
// a raw integer.
func formatAmount(cents int, currency string) string {
	symbol := currencySymbol(currency)
	return fmt.Sprintf("%s%.2f", symbol, float64(cents)/100.0)
}

func currencySymbol(code string) string {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "USD":
		return "$"
	case "INR":
		return "₹"
	case "EUR":
		return "€"
	case "GBP":
		return "£"
	default:
		return strings.ToUpper(code) + " "
	}
}

// planDisplayName maps our internal plan codes to user-facing names.
// Falls back to the raw code so a new plan doesn't render as a blank line
// while we backfill this switch.
func planDisplayName(code string) string {
	switch code {
	case "PRO_MONTHLY":
		return "ProofTamil Pro (Monthly)"
	case "PRO_YEARLY":
		return "ProofTamil Pro (Yearly)"
	default:
		return code
	}
}

// renderReceiptHTML builds the receipt email body. Deliberately inline styles
// (email clients drop <style> blocks) and single-file — mirrors the pattern
// in services/auth/reset_email.go.
//
// frontendURL is the site root (e.g. "https://www.prooftamil.com") used
// for the "get started" link. manageURL is the deep link to billing
// settings used by the primary CTA button.
func renderReceiptHTML(data PaymentReceiptData, frontendURL, manageURL string) string {
	greeting := "Hello,"
	if strings.TrimSpace(data.RecipientName) != "" {
		greeting = fmt.Sprintf("Hi %s,", html.EscapeString(strings.TrimSpace(data.RecipientName)))
	}

	nextBilling := "—"
	if data.NextBillingDate != nil {
		nextBilling = data.NextBillingDate.Format("January 2, 2006")
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

    <div style="background: linear-gradient(135deg, #1e3a8a 0%%, #3b82f6 100%%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">தமிழ்</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">ProofTamil</p>
    </div>

    <div style="padding: 40px 30px;">
      <h2 style="color: #1f2937; margin: 0 0 12px 0; font-size: 24px;">Payment Received</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
        %s thank you for your payment. Your ProofTamil Pro subscription is active.
      </p>

      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin: 0 0 25px 0;">
        <table style="width: 100%%; border-collapse: collapse; font-size: 15px; color: #1f2937;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Amount paid</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 600;">%s</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Plan</td>
            <td style="padding: 6px 0; text-align: right;">%s</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Paid on</td>
            <td style="padding: 6px 0; text-align: right;">%s</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Next billing date</td>
            <td style="padding: 6px 0; text-align: right;">%s</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Payment reference</td>
            <td style="padding: 6px 0; text-align: right; font-family: monospace; font-size: 13px;">%s</td>
          </tr>
        </table>
      </div>

      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
        You now have full access to Tamil grammar checking, style suggestions, and translation tools. Get started at
        <a href="%s" style="color: #3b82f6; text-decoration: none;">prooftamil.com</a>.
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="%s" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #1e3a8a 0%%, #3b82f6 100%%); color: white; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">Manage subscription</a>
      </div>

      <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 30px 0 0 0; text-align: center;">
        Need help? Reply to this email or contact support at prooftamil@gmail.com.<br>
        Keep the Payment reference above handy for support requests.
      </p>
    </div>

    <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        &copy; ProofTamil. This receipt was sent to confirm a payment on your account.
      </p>
    </div>
  </div>
</body>
</html>`,
		greeting,
		html.EscapeString(formatAmount(data.AmountCents, data.Currency)),
		html.EscapeString(planDisplayName(data.PlanCode)),
		data.PaidAt.Format("January 2, 2006"),
		html.EscapeString(nextBilling),
		html.EscapeString(data.PaymentID),
		html.EscapeString(frontendURL),
		html.EscapeString(manageURL),
	)
}
