package handlers

import (
	"net/http"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/billing"

	"github.com/gin-gonic/gin"
)

// AdminGetIssues consolidates the three streams of "something needs
// human attention" that ops watches:
//
//	1. failed_webhooks    — PaymentEvent rows where status='failed',
//	                        with the associated user email if the
//	                        payload metadata carried a resolvable
//	                        user_id.
//	2. drift              — the on-demand reconciliation snapshot
//	                        (missed activations, phantom Pro, null
//	                        subscription_end). Same query as the
//	                        hourly cron uses, but rendered here
//	                        instantly on page load.
//	3. abandoned_checkouts — CheckoutAttempts started 1–24h ago
//	                        with no completion. The follow-up cron
//	                        will email these; ops sees them here.
//
// One HTTP call, one payload — same pattern as /admin/overview.
func (h *Handlers) AdminGetIssues(c *gin.Context) {
	now := time.Now()

	// ---- Failed webhooks (last 50 by received_at) ----
	type webhookRow struct {
		ID              uint      `json:"id"`
		Provider        string    `json:"provider"`
		ProviderEventID string    `json:"provider_event_id"`
		EventType       string    `json:"event_type"`
		ReceivedAt      time.Time `json:"received_at"`
		Error           string    `json:"error,omitempty"`
	}
	var failed []webhookRow
	h.db.Table("payment_events").
		Select("id, provider, provider_event_id, event_type, received_at, error").
		Where("status = ?", models.PaymentEventStatusFailed).
		Order("received_at DESC").
		Limit(50).
		Scan(&failed)

	// ---- Reconciliation drift (uses the same service the cron does) ----
	// Running the check here is cheap (three indexed queries) and gives
	// ops a live view instead of a stale hourly snapshot.
	rec := billing.NewReconciliationService(h.db)
	report := rec.CheckAndAlertPreview()

	// ---- Abandoned checkouts in the 1-24h window ----
	type abandonedRow struct {
		ID                     uint      `json:"id"`
		UserID                 uint      `json:"user_id"`
		Email                  string    `json:"email"`
		ProviderSubscriptionID string    `json:"provider_subscription_id"`
		PlanCode               string    `json:"plan_code"`
		StartedAt              time.Time `json:"started_at"`
		FollowUpSentAt         *time.Time `json:"follow_up_sent_at,omitempty"`
	}
	var abandoned []abandonedRow
	h.db.Table("checkout_attempts").
		Select("checkout_attempts.id, checkout_attempts.user_id, users.email, checkout_attempts.provider_subscription_id, checkout_attempts.plan_code, checkout_attempts.started_at, checkout_attempts.follow_up_sent_at").
		Joins("LEFT JOIN users ON users.id = checkout_attempts.user_id").
		Where("checkout_attempts.started_at BETWEEN ? AND ? AND checkout_attempts.completed_at IS NULL",
			now.Add(-24*time.Hour), now.Add(-1*time.Hour)).
		Order("checkout_attempts.started_at DESC").
		Limit(50).
		Scan(&abandoned)

	c.JSON(http.StatusOK, gin.H{
		"failed_webhooks":       failed,
		"drift":                 report,
		"abandoned_checkouts":   abandoned,
	})
}
