package billing

import (
	"log"
	"os"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	emailsvc "tamil-proofreading-platform/backend/internal/services/email"

	"gorm.io/gorm"
)

// CheckoutFollowUpService drives the 3-touch abandoned-checkout drip.
// A user who starts a Dodo checkout but never completes it receives
// up to three reminder emails at increasing distance from the
// abandonment: ~1h, ~24h, ~72h. Each touch has escalating copy —
// warm nudge → social proof → final "no pressure" note.
//
// "Abandoned" = CheckoutAttempt.CompletedAt IS NULL AND the user
// still isn't on an active/trialing paid plan AND they haven't
// unsubscribed from marketing emails.
//
// Idempotency: each touch has its own timestamp column
// (Reminder{1,2,3}SentAt). The loop only touches rows where the
// current touch's column is NULL and the previous touch has been
// sent — so a failed touch 1 won't cause us to skip straight to
// touch 2. Cadence-window guards (see the *WindowXxx constants)
// prevent us from retroactively firing all three touches on a
// legacy row from before the drip landed.
type CheckoutFollowUpService struct {
	db *gorm.DB
}

// NewCheckoutFollowUpService constructs a service backed by the given DB.
func NewCheckoutFollowUpService(db *gorm.DB) *CheckoutFollowUpService {
	return &CheckoutFollowUpService{db: db}
}

// Cadence windows. Each touch is only sent if StartedAt falls in a
// bounded range — this prevents the cron from firing stale touches
// on very old rows (e.g. a 3-week-old abandonment shouldn't suddenly
// get a "72h note" when the code first ships) and gives us multiple
// chances to catch a row if the cron misses one tick.
const (
	touch1MinAge = 1 * time.Hour
	touch1MaxAge = 6 * time.Hour

	touch2MinAge = 24 * time.Hour
	touch2MaxAge = 30 * time.Hour

	touch3MinAge = 72 * time.Hour
	touch3MaxAge = 78 * time.Hour
)

// activePlanStatuses are the subscription statuses that mean "user
// has paid" — we must skip drip emails to these users regardless of
// whether the CheckoutAttempt row was closed properly.
var activePlanStatuses = []models.BillingSubscriptionStatus{
	models.BillingSubStatusActive,
	models.BillingSubStatusTrialing,
}

// RunHourlyLoop runs a follow-up pass every 15 minutes. Called from a
// goroutine at startup. The tighter 15-minute cadence (previously
// 1-hour) is deliberate: because touches fire in narrow age windows,
// hourly ticks meant a touch could miss its window entirely between
// two runs. 15 minutes gives every touch ~24 chances to fire.
//
// Kept the RunHourlyLoop name for backward compatibility with the
// registration site in main.go — renaming would spread the change
// across configuration and docs for no operational benefit.
func (s *CheckoutFollowUpService) RunHourlyLoop() {
	time.Sleep(10 * time.Minute) // warm-up gap after startup migrations
	for {
		s.sendDrip()
		time.Sleep(15 * time.Minute)
	}
}

// SendFollowUpsForAdmin runs one drip pass immediately and returns
// a breakdown of what was sent per touch. Exposed for the admin ops
// panel's "Run checkout follow-up now" button.
func (s *CheckoutFollowUpService) SendFollowUpsForAdmin() map[string]int {
	return s.sendDrip()
}

// sendDrip is the core loop. Handles all three touches in one pass
// so admin-triggered runs and hourly runs produce the same behaviour.
// Returns a per-touch send count keyed "touch_1"/"touch_2"/"touch_3".
func (s *CheckoutFollowUpService) sendDrip() map[string]int {
	counts := map[string]int{"touch_1": 0, "touch_2": 0, "touch_3": 0}

	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		log.Printf("[CHECKOUT_DRIP] Email service not configured — skipping this pass")
		return counts
	}

	frontendURL := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
	if frontendURL == "" {
		frontendURL = "https://www.prooftamil.com"
	}
	// Backend URL for the signed CTA links. Falls back to the
	// public API host used elsewhere; the resume + unsub endpoints
	// live on the Go backend so we can hit the DB directly.
	backendURL := strings.TrimRight(os.Getenv("BACKEND_PUBLIC_URL"), "/")
	if backendURL == "" {
		backendURL = "https://api.prooftamil.com"
	}

	counts["touch_1"] = s.sendTouch(svc, 1, touch1MinAge, touch1MaxAge, frontendURL, backendURL)
	counts["touch_2"] = s.sendTouch(svc, 2, touch2MinAge, touch2MaxAge, frontendURL, backendURL)
	counts["touch_3"] = s.sendTouch(svc, 3, touch3MinAge, touch3MaxAge, frontendURL, backendURL)

	total := counts["touch_1"] + counts["touch_2"] + counts["touch_3"]
	if total > 0 {
		log.Printf("[CHECKOUT_DRIP] Pass complete: touch1=%d touch2=%d touch3=%d",
			counts["touch_1"], counts["touch_2"], counts["touch_3"])
	} else {
		log.Printf("[CHECKOUT_DRIP] No abandoned checkouts due for any touch this pass")
	}
	return counts
}

// sendTouch queries and sends one specific touch (1, 2, or 3). Each
// touch's WHERE clause requires:
//   - StartedAt inside the touch's age window (min..max ago)
//   - CompletedAt IS NULL (webhook hasn't marked it done)
//   - This touch's stamp column IS NULL (never sent)
//   - Previous touch's stamp column IS NOT NULL (or, for touch 1,
//     nothing) — so we never skip ahead
func (s *CheckoutFollowUpService) sendTouch(svc *emailsvc.EmailService, touch int, minAge, maxAge time.Duration, frontendURL, backendURL string) int {
	now := time.Now()
	windowEnd := now.Add(-minAge)
	windowStart := now.Add(-maxAge)

	// Build the touch-specific NULL-check / prev-check WHERE clause.
	var stampCol, prereqSQL string
	switch touch {
	case 1:
		stampCol = "reminder1_sent_at"
		prereqSQL = "" // no prereq
	case 2:
		stampCol = "reminder2_sent_at"
		prereqSQL = "reminder1_sent_at IS NOT NULL"
	case 3:
		stampCol = "reminder3_sent_at"
		prereqSQL = "reminder2_sent_at IS NOT NULL"
	default:
		log.Printf("[CHECKOUT_DRIP] Invalid touch number %d — skipping", touch)
		return 0
	}

	q := s.db.
		Where("started_at BETWEEN ? AND ?", windowStart, windowEnd).
		Where("completed_at IS NULL").
		Where(stampCol + " IS NULL").
		Preload("User")
	if prereqSQL != "" {
		q = q.Where(prereqSQL)
	}

	var attempts []models.CheckoutAttempt
	if err := q.Find(&attempts).Error; err != nil {
		log.Printf("[CHECKOUT_DRIP] Touch %d query failed: %v", touch, err)
		return 0
	}
	if len(attempts) == 0 {
		return 0
	}

	sent := 0
	for _, a := range attempts {
		if !s.shouldSend(&a) {
			continue
		}

		// Build signed one-click links. Both tokens are bound to
		// the specific user (and, for resume, the specific plan)
		// so a leaked link can't be repurposed for another
		// account.
		resumePath := "/checkout/resume?token=" + MakeResumeToken(a.UserID, a.PlanCode)
		unsubPath := "/email/unsubscribe?token=" + MakeUnsubToken(a.UserID)

		data := dripEmailData{
			RecipientName: a.User.Name,
			PlanName:      planDisplayName(a.PlanCode),
			ResumeURL:     backendURL + resumePath,
			UnsubURL:      backendURL + unsubPath,
			AppURL:        frontendURL,
		}
		subject, body := dripSubjectAndBody(touch, data)
		if subject == "" || body == "" {
			log.Printf("[CHECKOUT_DRIP] Empty template for touch %d attempt=%d — skipping", touch, a.ID)
			continue
		}

		if err := svc.SendEmail(a.User.Email, subject, body); err != nil {
			log.Printf("[CHECKOUT_DRIP] Touch %d send failed for user=%d attempt=%d: %v", touch, a.UserID, a.ID, err)
			continue
		}

		// Stamp the touch column so we don't email again on the
		// next tick. Non-fatal on failure — worst case is a
		// duplicate send next pass, which is much less bad than
		// letting the loop panic.
		stamp := time.Now()
		if err := s.db.Model(&models.CheckoutAttempt{}).
			Where("id = ?", a.ID).
			Update(stampCol, stamp).Error; err != nil {
			log.Printf("[CHECKOUT_DRIP] Warning: failed to stamp %s for attempt=%d: %v", stampCol, a.ID, err)
		}
		sent++
		log.Printf("[CHECKOUT_DRIP] Touch %d sent: user=%d attempt=%d email=%s", touch, a.UserID, a.ID, a.User.Email)
	}
	return sent
}

// shouldSend applies per-user safety gates that can't be expressed
// cleanly in the SQL WHERE clause:
//   - user email must exist (defensive: FKs guarantee the row but
//     old data might have blank emails from imports)
//   - user must not have unsubscribed from marketing
//   - user must not already be on an active/trialing paid plan
//     (they may have subscribed via a DIFFERENT checkout after
//     abandoning this one — CompletedAt-on-this-row won't catch it)
func (s *CheckoutFollowUpService) shouldSend(a *models.CheckoutAttempt) bool {
	if strings.TrimSpace(a.User.Email) == "" {
		log.Printf("[CHECKOUT_DRIP] Skip attempt=%d — user email empty", a.ID)
		return false
	}
	if a.User.MarketingUnsubscribedAt != nil {
		log.Printf("[CHECKOUT_DRIP] Skip attempt=%d — user %d unsubscribed", a.ID, a.UserID)
		return false
	}

	// Look up any active subscription independent of this attempt.
	// This catches "user abandoned checkout X, later converted via
	// checkout Y" — the attempt X row still says CompletedAt IS
	// NULL but we should stop dunning them.
	var count int64
	if err := s.db.Model(&models.Subscription{}).
		Where("user_id = ? AND status IN ?", a.UserID, activePlanStatuses).
		Count(&count).Error; err != nil {
		// If the check fails, err on the side of NOT sending —
		// worse to double-nag a paying customer than to miss one
		// dunning attempt. Log so we can spot chronic issues.
		log.Printf("[CHECKOUT_DRIP] Skip attempt=%d — active-sub check failed: %v", a.ID, err)
		return false
	}
	if count > 0 {
		log.Printf("[CHECKOUT_DRIP] Skip attempt=%d — user %d already has active subscription", a.ID, a.UserID)
		return false
	}
	return true
}

// planDisplayName is defined in receipt_email.go and reused here —
// same package, single source of truth.
