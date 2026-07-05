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

// ReconciliationService periodically diffs the users table against the
// subscriptions table and alerts on any drift. It exists as a defence in
// depth against the class of bug we hit on 2026-07-05: a jsonb INSERT
// error caused every subscription.active webhook to fail, so a paying
// customer never had their Pro flag flipped. We only found out when the
// customer emailed. This service closes that visibility gap — regardless
// of *what* caused the drift, we notice within an hour.
//
// Three drift patterns are checked:
//
//  1. MissedActivation — subscriptions.status is active/trialing but the
//     user's subscription flag is not 'pro'. This is the exact 2026-07-05
//     failure mode: paid at Dodo but Pro never flipped on our side.
//
//  2. PhantomPro — user.subscription == 'pro' but no active subscription
//     row exists (and premium_override is false). Reverse case: we're
//     giving Pro away without a payment backing it.
//
//  3. NullSubscriptionEnd — user is Pro on an active Dodo subscription
//     but users.subscription_end is NULL. Symptom of the field-name
//     mismatch bug (see commit 8160ed9). Renewal reminders + billing
//     status displays break silently.
//
// premium_override is respected everywhere: admin-granted Pro rows are
// intentionally not backed by a subscription and must not raise alerts.
type ReconciliationService struct {
	db *gorm.DB
}

// DriftUser is one row in a drift report — enough context to eyeball
// what's wrong and open the right customer record.
type DriftUser struct {
	UserID           uint      `gorm:"column:user_id"`
	Email            string    `gorm:"column:email"`
	Subscription     string    `gorm:"column:subscription"`
	SubscriptionID   string    `gorm:"column:provider_subscription_id"`
	SubscriptionEnd  *time.Time `gorm:"column:subscription_end"`
}

// DriftReport is the aggregate result of one reconciliation pass.
type DriftReport struct {
	CheckedAt           time.Time
	MissedActivations   []DriftUser
	PhantomPro          []DriftUser
	NullSubscriptionEnd []DriftUser
}

// Total returns the number of drift rows across all categories.
func (r DriftReport) Total() int {
	return len(r.MissedActivations) + len(r.PhantomPro) + len(r.NullSubscriptionEnd)
}

// NewReconciliationService constructs a service backed by the given DB.
func NewReconciliationService(db *gorm.DB) *ReconciliationService {
	return &ReconciliationService{db: db}
}

// RunHourlyLoop runs a reconciliation pass every hour. Call it in a
// goroutine from main. First run happens after a short warm-up delay
// so we don't compete with startup migrations for DB connections.
func (r *ReconciliationService) RunHourlyLoop() {
	time.Sleep(5 * time.Minute)
	for {
		r.CheckAndAlert()
		time.Sleep(1 * time.Hour)
	}
}

// CheckAndAlert runs one reconciliation pass, alerts on any drift, and
// returns the report. Exported so it can be called from an admin
// endpoint or a unit test.
func (r *ReconciliationService) CheckAndAlert() DriftReport {
	report := r.check()
	log.Printf("[RECONCILIATION] Ran check: missed=%d phantom=%d null_end=%d",
		len(report.MissedActivations), len(report.PhantomPro), len(report.NullSubscriptionEnd))
	if report.Total() > 0 {
		r.sendAlert(report)
	}
	return report
}

// check runs the three drift queries.
func (r *ReconciliationService) check() DriftReport {
	report := DriftReport{CheckedAt: time.Now()}

	// 1. MissedActivation — paying but not Pro. This is THE critical case.
	if err := r.db.Raw(`
		SELECT u.id AS user_id,
		       u.email,
		       u.subscription,
		       s.provider_subscription_id,
		       u.subscription_end
		FROM users u
		JOIN subscriptions s ON s.user_id = u.id
		WHERE s.provider = ?
		  AND s.status IN (?, ?)
		  AND u.subscription != ?
		  AND (u.premium_override IS NULL OR u.premium_override = false)
		ORDER BY u.id`,
		models.PaymentProviderDodo,
		models.BillingSubStatusActive, models.BillingSubStatusTrialing,
		models.PlanPro,
	).Scan(&report.MissedActivations).Error; err != nil {
		log.Printf("[RECONCILIATION] missed-activation query failed: %v", err)
	}

	// 2. PhantomPro — Pro but no backing subscription. Reverse case.
	if err := r.db.Raw(`
		SELECT u.id AS user_id,
		       u.email,
		       u.subscription,
		       COALESCE(s.provider_subscription_id, '') AS provider_subscription_id,
		       u.subscription_end
		FROM users u
		LEFT JOIN subscriptions s
		  ON s.user_id = u.id AND s.status IN (?, ?)
		WHERE u.subscription = ?
		  AND (u.premium_override IS NULL OR u.premium_override = false)
		  AND s.id IS NULL
		ORDER BY u.id`,
		models.BillingSubStatusActive, models.BillingSubStatusTrialing,
		models.PlanPro,
	).Scan(&report.PhantomPro).Error; err != nil {
		log.Printf("[RECONCILIATION] phantom-pro query failed: %v", err)
	}

	// 3. NullSubscriptionEnd — Pro on active sub but subscription_end is NULL.
	if err := r.db.Raw(`
		SELECT u.id AS user_id,
		       u.email,
		       u.subscription,
		       s.provider_subscription_id,
		       u.subscription_end
		FROM users u
		JOIN subscriptions s ON s.user_id = u.id
		WHERE s.provider = ?
		  AND s.status = ?
		  AND u.subscription = ?
		  AND u.subscription_end IS NULL
		ORDER BY u.id`,
		models.PaymentProviderDodo,
		models.BillingSubStatusActive,
		models.PlanPro,
	).Scan(&report.NullSubscriptionEnd).Error; err != nil {
		log.Printf("[RECONCILIATION] null-subscription-end query failed: %v", err)
	}

	return report
}

// sendAlert emails contact@prooftamil.com (via the same Resend infra used
// for password reset + receipts). Also logs a structured ERROR line so the
// GCP log-based alert on `[RECONCILIATION] ERROR` also fires — belt and
// braces so a Resend outage doesn't hide the drift.
func (r *ReconciliationService) sendAlert(report DriftReport) {
	log.Printf("[RECONCILIATION] ERROR: drift detected — missed=%d phantom=%d null_end=%d",
		len(report.MissedActivations), len(report.PhantomPro), len(report.NullSubscriptionEnd))

	to := strings.TrimSpace(os.Getenv("RECONCILIATION_ALERT_TO"))
	if to == "" {
		to = "contact@prooftamil.com"
	}

	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		log.Printf("[RECONCILIATION] Email service not configured — alert body:\n%s", renderAlertText(report))
		return
	}

	subject := fmt.Sprintf("[ProofTamil] Billing reconciliation: %d drift row(s)", report.Total())
	if err := svc.SendEmail(to, subject, renderAlertHTML(report)); err != nil {
		log.Printf("[RECONCILIATION] Failed to send alert email: %v", err)
	}
}

// renderAlertText is a plaintext fallback used when the email service isn't
// configured (local dev). Also handy for grepping the log.
func renderAlertText(report DriftReport) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Billing reconciliation drift at %s\n\n", report.CheckedAt.Format(time.RFC3339))
	writeSection(&sb, "MissedActivations (paid but not Pro)", report.MissedActivations)
	writeSection(&sb, "PhantomPro (Pro but no active subscription)", report.PhantomPro)
	writeSection(&sb, "NullSubscriptionEnd (active Pro with NULL end)", report.NullSubscriptionEnd)
	return sb.String()
}

func writeSection(sb *strings.Builder, title string, rows []DriftUser) {
	fmt.Fprintf(sb, "== %s (%d) ==\n", title, len(rows))
	if len(rows) == 0 {
		fmt.Fprintln(sb, "  (none)")
		return
	}
	for _, u := range rows {
		fmt.Fprintf(sb, "  user_id=%d email=%s sub=%s prov_id=%s end=%v\n",
			u.UserID, u.Email, u.Subscription, u.SubscriptionID, u.SubscriptionEnd)
	}
	fmt.Fprintln(sb)
}

func renderAlertHTML(report DriftReport) string {
	tableStyle := "border-collapse: collapse; width: 100%; margin: 10px 0; font-family: monospace; font-size: 13px;"
	thStyle := "text-align: left; padding: 6px 10px; background: #f3f4f6; border: 1px solid #e5e7eb;"
	tdStyle := "padding: 6px 10px; border: 1px solid #e5e7eb;"

	section := func(title, blurb string, rows []DriftUser) string {
		var sb strings.Builder
		fmt.Fprintf(&sb, `<h3 style="margin: 20px 0 4px 0;">%s (%d)</h3>`, html.EscapeString(title), len(rows))
		fmt.Fprintf(&sb, `<p style="margin: 0 0 6px 0; color: #6b7280; font-size: 13px;">%s</p>`, html.EscapeString(blurb))
		if len(rows) == 0 {
			sb.WriteString(`<p style="color: #16a34a; font-size: 14px;">✓ No drift.</p>`)
			return sb.String()
		}
		fmt.Fprintf(&sb, `<table style="%s"><tr><th style="%s">user_id</th><th style="%s">email</th><th style="%s">subscription</th><th style="%s">provider_subscription_id</th><th style="%s">subscription_end</th></tr>`, tableStyle, thStyle, thStyle, thStyle, thStyle, thStyle)
		for _, u := range rows {
			end := "—"
			if u.SubscriptionEnd != nil {
				end = u.SubscriptionEnd.Format("2006-01-02")
			}
			fmt.Fprintf(&sb, `<tr><td style="%s">%d</td><td style="%s">%s</td><td style="%s">%s</td><td style="%s">%s</td><td style="%s">%s</td></tr>`,
				tdStyle, u.UserID,
				tdStyle, html.EscapeString(u.Email),
				tdStyle, html.EscapeString(u.Subscription),
				tdStyle, html.EscapeString(u.SubscriptionID),
				tdStyle, html.EscapeString(end),
			)
		}
		sb.WriteString(`</table>`)
		return sb.String()
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html><body style="font-family: 'Segoe UI', sans-serif; padding: 20px; color: #1f2937;">
  <h2 style="margin: 0 0 6px 0;">Billing reconciliation drift</h2>
  <p style="color: #6b7280; font-size: 13px;">Checked at %s. %d row(s) need attention.</p>
  %s
  %s
  %s
  <p style="margin-top: 30px; color: #9ca3af; font-size: 12px;">
    Runs hourly. Silence future alerts for a specific user by setting <code>premium_override=true</code> on their user row.
  </p>
</body></html>`,
		html.EscapeString(report.CheckedAt.Format(time.RFC3339)),
		report.Total(),
		section("Missed activations", "Paying customers where users.subscription is not 'pro'. THIS IS THE CRITICAL BUG CLASS.", report.MissedActivations),
		section("Phantom Pro", "Users marked Pro without a paying subscription. Likely a stale manual UPDATE — verify or set premium_override.", report.PhantomPro),
		section("Null subscription_end", "Active Pro subscriptions where users.subscription_end is NULL. Renewal reminders won't fire for them.", report.NullSubscriptionEnd),
	)
}
