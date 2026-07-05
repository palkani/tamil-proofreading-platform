package billing

import (
	"fmt"
	"log"
	"os"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	emailsvc "tamil-proofreading-platform/backend/internal/services/email"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// RenewalService sends reminder emails before subscriptions renew.
// It runs as a daily background goroutine and emails users whose
// subscription_end falls 6–8 days from now. BillingAuditLog is used
// to deduplicate so we never send more than one reminder per renewal cycle.
type RenewalService struct {
	db *gorm.DB
}

// NewRenewalService creates a RenewalService backed by the given DB.
func NewRenewalService(db *gorm.DB) *RenewalService {
	return &RenewalService{db: db}
}

// RunDailyLoop runs the renewal reminder check every 24 hours.
// Call it in a goroutine: go renewalSvc.RunDailyLoop()
func (r *RenewalService) RunDailyLoop() {
	// Run once on startup (after a brief delay to let the server warm up),
	// then repeat every 24 hours.
	time.Sleep(2 * time.Minute)
	for {
		r.sendRenewalReminders()
		time.Sleep(24 * time.Hour)
	}
}

// sendRenewalReminders queries subscriptions expiring in 6–8 days and sends
// one reminder email per user (deduplicated via BillingAuditLog).
func (r *RenewalService) sendRenewalReminders() {
	now := time.Now()
	windowStart := now.Add(6 * 24 * time.Hour)
	windowEnd := now.Add(8 * 24 * time.Hour)

	// Find active subscriptions whose current_period_end falls in [+6d, +8d].
	var subs []models.Subscription
	if err := r.db.
		Where("status IN ? AND current_period_end BETWEEN ? AND ?",
			[]models.BillingSubscriptionStatus{
				models.BillingSubStatusActive,
				models.BillingSubStatusTrialing,
			},
			windowStart, windowEnd,
		).
		Preload("User").
		Find(&subs).Error; err != nil {
		log.Printf("[RENEWAL] DB query failed: %v", err)
		return
	}

	if len(subs) == 0 {
		log.Printf("[RENEWAL] No subscriptions renewing in 6–8 days")
		return
	}

	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		log.Printf("[RENEWAL] Email service not configured — logging reminders only")
	}

	sent := 0
	for _, sub := range subs {
		if sub.CurrentPeriodEnd == nil {
			continue
		}
		userID := sub.UserID
		periodEnd := *sub.CurrentPeriodEnd

		// Deduplication: skip if we already sent a reminder for this user
		// within the last 48 hours.
		var existingLog models.BillingAuditLog
		cutoff := now.Add(-48 * time.Hour)
		err := r.db.
			Where("action = ? AND target_user_id = ? AND created_at > ?",
				"renewal_reminder_sent", userID, cutoff).
			First(&existingLog).Error
		if err == nil {
			// Already sent recently — skip
			continue
		}

		// Send the reminder email
		user := sub.User
		if user.Email == "" {
			continue
		}

		emailErr := sendRenewalEmail(svc, user.Email, user.Name, sub.PlanCode, periodEnd)
		if emailErr != nil {
			log.Printf("[RENEWAL] Failed to send reminder to user %d (%s): %v", userID, user.Email, emailErr)
			continue
		}

		// Record in audit log for deduplication
		auditEntry := &models.BillingAuditLog{
			ActorUserID:  userID,
			Action:       "renewal_reminder_sent",
			TargetUserID: &userID,
			ResourceType: "subscription",
			ResourceID:   &sub.ID,
			NewValue:     datatypes.JSON(fmt.Sprintf(`{"period_end":"%s","plan":"%s"}`, periodEnd.Format(time.RFC3339), sub.PlanCode)),
		}
		if logErr := r.db.Create(auditEntry).Error; logErr != nil {
			log.Printf("[RENEWAL] Warning: failed to write audit log for user %d: %v", userID, logErr)
		}

		log.Printf("[RENEWAL] Reminder sent to user %d (%s) — renews %s",
			userID, user.Email, periodEnd.Format("2 Jan 2006"))
		sent++
	}

	log.Printf("[RENEWAL] Done — %d reminder(s) sent out of %d candidate subscription(s)", sent, len(subs))
}

// sendRenewalEmail sends an HTML renewal reminder email via the configured email service.
func sendRenewalEmail(svc *emailsvc.EmailService, toEmail, userName, planCode string, renewalDate time.Time) error {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "https://www.prooftamil.com"
	}

	displayName := userName
	if displayName == "" {
		displayName = "there"
	}

	formattedDate := renewalDate.Format("January 2, 2006")
	manageURL := frontendURL + "/account"

	subject := "Your ProofTamil Pro subscription renews soon"
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
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
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Hi %s,</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        This is a friendly reminder that your <strong>ProofTamil Pro</strong> subscription
        will automatically renew on <strong>%s</strong>.
      </p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
        Your card on file will be charged automatically — no action needed if you'd like
        to continue enjoying unlimited Tamil AI proofreading.
      </p>

      <div style="background-color: #f0f7ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 25px 0;">
        <p style="color: #1e40af; font-weight: 600; margin: 0 0 8px 0;">Your Pro benefits include:</p>
        <ul style="color: #4b5563; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Unlimited words per analysis</li>
          <li>Unlimited AI checks per day</li>
          <li>All correction types — grammar, style, rewrite</li>
          <li>Save unlimited drafts</li>
        </ul>
      </div>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 25px 0;">
        If you'd like to cancel or manage your subscription before the renewal date,
        you can do so from your account page.
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="%s"
           style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%%, #3b82f6 100%%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Manage My Subscription
        </a>
      </div>
    </div>

    <div style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        &copy; 2025 ProofTamil. AI-powered Tamil writing assistant.
      </p>
    </div>
  </div>
</body>
</html>`, displayName, formattedDate, manageURL)

	if !svc.IsConfigured() {
		log.Printf("[RENEWAL] Email not configured — renewal reminder for %s (renews %s): %s",
			toEmail, formattedDate, manageURL)
		return nil
	}

	return svc.SendEmail(toEmail, subject, htmlBody)
}
