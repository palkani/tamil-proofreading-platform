package billing

import (
	"fmt"
	"html"
	"log"
	"os"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	emailsvc "tamil-proofreading-platform/backend/internal/services/email"

	"gorm.io/gorm"
)

// CheckoutFollowUpService looks for abandoned Dodo checkouts and sends a
// single reminder email per abandoned attempt. Runs alongside the other
// billing background jobs (renewal, reconciliation).
//
// "Abandoned" = CheckoutAttempt.StartedAt is 1–24 hours ago, CompletedAt
// is still NULL, and FollowUpSentAt is NULL. The 1-hour lower bound
// gives the user time to finish before we nag; the 24-hour upper bound
// stops us from linking to a Dodo payment_link that's already expired.
//
// Idempotency is provided by FollowUpSentAt — the loop only touches
// rows where it's NULL, then stamps it after sending.
type CheckoutFollowUpService struct {
	db *gorm.DB
}

// NewCheckoutFollowUpService constructs a service backed by the given DB.
func NewCheckoutFollowUpService(db *gorm.DB) *CheckoutFollowUpService {
	return &CheckoutFollowUpService{db: db}
}

// RunHourlyLoop runs a follow-up pass every hour. Call from a goroutine.
// First run happens after a short warm-up so we don't compete with
// startup migrations.
func (s *CheckoutFollowUpService) RunHourlyLoop() {
	time.Sleep(10 * time.Minute)
	for {
		s.sendFollowUps()
		time.Sleep(1 * time.Hour)
	}
}

// sendFollowUps runs one pass and returns the number sent. Exported name
// only via the loop; called directly from a test would work too.
func (s *CheckoutFollowUpService) sendFollowUps() int {
	now := time.Now()
	windowStart := now.Add(-24 * time.Hour)
	windowEnd := now.Add(-1 * time.Hour)

	var attempts []models.CheckoutAttempt
	if err := s.db.
		Where("started_at BETWEEN ? AND ? AND completed_at IS NULL AND follow_up_sent_at IS NULL",
			windowStart, windowEnd).
		Preload("User").
		Find(&attempts).Error; err != nil {
		log.Printf("[CHECKOUT_FOLLOWUP] DB query failed: %v", err)
		return 0
	}

	if len(attempts) == 0 {
		log.Printf("[CHECKOUT_FOLLOWUP] No abandoned checkouts in the 1–24h window")
		return 0
	}

	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		log.Printf("[CHECKOUT_FOLLOWUP] Email service not configured — %d attempt(s) would have been notified", len(attempts))
		return 0
	}

	frontendURL := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
	if frontendURL == "" {
		frontendURL = "https://www.prooftamil.com"
	}

	sent := 0
	for _, a := range attempts {
		if strings.TrimSpace(a.User.Email) == "" {
			log.Printf("[CHECKOUT_FOLLOWUP] Skipping attempt id=%d — user email empty", a.ID)
			continue
		}

		subject := "Still thinking it over? Your ProofTamil Pro upgrade is one click away"
		body := renderCheckoutFollowUpHTML(a, frontendURL)

		if err := svc.SendEmail(a.User.Email, subject, body); err != nil {
			log.Printf("[CHECKOUT_FOLLOWUP] Send failed for user=%d attempt=%d: %v", a.UserID, a.ID, err)
			continue
		}

		// Stamp FollowUpSentAt so we don't email again on the next loop.
		nowStamp := time.Now()
		if err := s.db.Model(&models.CheckoutAttempt{}).
			Where("id = ?", a.ID).
			Update("follow_up_sent_at", nowStamp).Error; err != nil {
			// Non-fatal but log — worst case we send a duplicate next hour.
			log.Printf("[CHECKOUT_FOLLOWUP] Warning: failed to stamp follow_up_sent_at for attempt=%d: %v", a.ID, err)
		}
		sent++
		log.Printf("[CHECKOUT_FOLLOWUP] Sent reminder: user=%d attempt=%d email=%s", a.UserID, a.ID, a.User.Email)
	}
	return sent
}

func renderCheckoutFollowUpHTML(a models.CheckoutAttempt, frontendURL string) string {
	greeting := "Hi there,"
	if strings.TrimSpace(a.User.Name) != "" {
		greeting = fmt.Sprintf("Hi %s,", html.EscapeString(strings.TrimSpace(a.User.Name)))
	}
	pricingURL := frontendURL + "/pricing"
	planName := planDisplayName(a.PlanCode)

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
      <h2 style="color: #1f2937; margin: 0 0 12px 0; font-size: 22px;">You were so close!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        %s we noticed you started upgrading to <strong>%s</strong> earlier but didn't finish.
        Everything's still saved — pick up right where you left off.
      </p>

      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
        With ProofTamil Pro you get unlimited Tamil grammar checking, style suggestions,
        and priority translation. Most writers finish their first Pro month feeling like
        their work reads noticeably better.
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="%s" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1e3a8a 0%%, #3b82f6 100%%); color: white; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Finish upgrading</a>
      </div>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
        Had a question or ran into a problem at checkout? Reply to this email — we read every reply.
      </p>
    </div>

    <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        &copy; ProofTamil. You're getting this because you started a subscription flow at prooftamil.com.
        If that wasn't you, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`, greeting, html.EscapeString(planName), html.EscapeString(pricingURL))
}
