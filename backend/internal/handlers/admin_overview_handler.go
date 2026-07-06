package handlers

import (
	"net/http"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// AdminGetOverview returns the aggregate stats for the admin dashboard
// landing page in a single call. Consolidating avoids the fan-out
// problem where the frontend would otherwise need to fire five
// separate requests to render one screen.
//
// Response schema (JSON, snake_case):
//
//	{
//	  "users": {
//	    "total":      int,   // all users, all-time
//	    "pro":        int,   // subscription = 'pro' AND (not premium_override or override active)
//	    "active_24h": int,   // distinct users with an ActivityEvent in the last 24h
//	    "active_30d": int,   // same, over 30 days
//	    "signups_7d": int,
//	    "signups_30d": int
//	  },
//	  "revenue": {
//	    "monthly_completed_usd_cents": int,  // sum of completed invoices this calendar month
//	    "lifetime_usd_cents":          int   // sum of completed invoices ever
//	  },
//	  "issues": {
//	    "failed_webhooks":       int,   // payment_events.status = 'failed'
//	    "active_pro_without_end": int,  // Dodo active + user.subscription_end IS NULL
//	    "checkouts_abandoned_24h": int  // checkout_attempts started 1-24h ago, not completed, not followed up
//	  },
//	  "recent_activity": [
//	    { "user_id": int, "email": string, "event_type": string, "occurred_at": rfc3339 }, ...
//	  ]
//	}
func (h *Handlers) AdminGetOverview(c *gin.Context) {
	now := time.Now()
	last24h := now.Add(-24 * time.Hour)
	last7d := now.Add(-7 * 24 * time.Hour)
	last30d := now.Add(-30 * 24 * time.Hour)
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	// --- Users ---
	var totalUsers, proUsers, active24h, active30d, signups7d, signups30d int64
	h.db.Model(&models.User{}).Count(&totalUsers)
	h.db.Model(&models.User{}).Where("subscription = ?", models.PlanPro).Count(&proUsers)
	h.db.Model(&models.ActivityEvent{}).Where("occurred_at >= ?", last24h).Distinct("user_id").Count(&active24h)
	h.db.Model(&models.ActivityEvent{}).Where("occurred_at >= ?", last30d).Distinct("user_id").Count(&active30d)
	h.db.Model(&models.User{}).Where("created_at >= ?", last7d).Count(&signups7d)
	h.db.Model(&models.User{}).Where("created_at >= ?", last30d).Count(&signups30d)

	// --- Revenue --- (from invoices where status='paid', in USD-equivalent cents)
	// Using base_price_usd_cents so cross-currency invoices are comparable.
	var monthlyRevenue, lifetimeRevenue int64
	h.db.Model(&models.Invoice{}).
		Where("status = ? AND paid_at >= ?", models.InvoiceStatusPaid, startOfMonth).
		Select("COALESCE(SUM(base_price_usd_cents), 0)").
		Scan(&monthlyRevenue)
	h.db.Model(&models.Invoice{}).
		Where("status = ?", models.InvoiceStatusPaid).
		Select("COALESCE(SUM(base_price_usd_cents), 0)").
		Scan(&lifetimeRevenue)

	// --- Demo activity (anonymous submissions from the homepage) ---
	// Answers "is the demo getting traffic even when nobody signs up?"
	var demo24h, demo7d int64
	h.db.Model(&models.AnonymousSubmissionEvent{}).Where("occurred_at >= ?", last24h).Count(&demo24h)
	h.db.Model(&models.AnonymousSubmissionEvent{}).Where("occurred_at >= ?", last7d).Count(&demo7d)

	// --- Issues ---
	var failedWebhooks, proMissingEnd, abandonedCheckouts int64
	h.db.Model(&models.PaymentEvent{}).Where("status = ?", models.PaymentEventStatusFailed).Count(&failedWebhooks)
	h.db.Table("users").
		Joins("JOIN subscriptions s ON s.user_id = users.id").
		Where("s.provider = ? AND s.status = ? AND users.subscription = ? AND users.subscription_end IS NULL",
			models.PaymentProviderDodo, models.BillingSubStatusActive, models.PlanPro).
		Count(&proMissingEnd)
	h.db.Model(&models.CheckoutAttempt{}).
		Where("started_at BETWEEN ? AND ? AND completed_at IS NULL",
			now.Add(-24*time.Hour), now.Add(-1*time.Hour)).
		Count(&abandonedCheckouts)

	// --- Recent activity (last 20) ---
	type recentActivityRow struct {
		UserID     uint      `json:"user_id"`
		Email      string    `json:"email"`
		EventType  string    `json:"event_type"`
		OccurredAt time.Time `json:"occurred_at"`
	}
	var recent []recentActivityRow
	h.db.Table("activity_events").
		Select("activity_events.user_id, users.email, activity_events.event_type, activity_events.occurred_at").
		Joins("LEFT JOIN users ON users.id = activity_events.user_id").
		Order("activity_events.occurred_at DESC").
		Limit(20).
		Scan(&recent)

	c.JSON(http.StatusOK, gin.H{
		"users": gin.H{
			"total":       totalUsers,
			"pro":         proUsers,
			"active_24h":  active24h,
			"active_30d":  active30d,
			"signups_7d":  signups7d,
			"signups_30d": signups30d,
		},
		"revenue": gin.H{
			"monthly_completed_usd_cents": monthlyRevenue,
			"lifetime_usd_cents":          lifetimeRevenue,
		},
		"issues": gin.H{
			"failed_webhooks":         failedWebhooks,
			"active_pro_without_end":  proMissingEnd,
			"checkouts_abandoned_24h": abandonedCheckouts,
		},
		"demo": gin.H{
			"submissions_24h": demo24h,
			"submissions_7d":  demo7d,
		},
		"recent_activity": recent,
	})
}
