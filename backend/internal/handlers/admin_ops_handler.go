package handlers

import (
	"net/http"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/billing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminEnsureBillingTables runs GORM AutoMigrate for the billing tables
// that were introduced in later PRs but never got created in production
// because deploys run with RUN_MIGRATIONS=false. Idempotent: safe to run
// as many times as needed; existing tables are left alone.
//
// This is a UI-triggered escape hatch for the specific case of
// checkout_attempts and admin_broadcasts missing from an environment
// that skipped migrations. Full DB migrations still go through the
// standard flow — this covers the "one small table added mid-cycle,
// forgot to enable migrations" pattern.
//
// POST /api/v1/admin/ops/ensure-billing-tables
func (h *Handlers) AdminEnsureBillingTables(c *gin.Context) {
	targets := []struct {
		Name  string
		Model any
	}{
		{"checkout_attempts", &models.CheckoutAttempt{}},
		{"admin_broadcasts", &models.AdminBroadcast{}},
		{"subscriptions", &models.Subscription{}},
		{"invoices", &models.Invoice{}},
		{"payment_events", &models.PaymentEvent{}},
		{"billing_audit_logs", &models.BillingAuditLog{}},
	}

	results := make([]gin.H, 0, len(targets))
	for _, t := range targets {
		err := h.db.AutoMigrate(t.Model)
		status := "ok"
		errMsg := ""
		if err != nil {
			status = "warn"
			errMsg = err.Error()
		}
		results = append(results, gin.H{
			"table":  t.Name,
			"status": status,
			"error":  errMsg,
		})
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}

// AdminRunCheckoutFollowup triggers one pass of the abandoned-checkout
// follow-up cron on demand. Ops uses this to (a) verify the cron works
// after fixing schema issues, (b) send an immediate reminder without
// waiting for the hourly tick, and (c) test the email template against
// a real recipient.
//
// Runs the same code the RunHourlyLoop uses. Blocks the request for
// as long as the send takes — usually seconds unless the pool is
// very large. For clean UX, the endpoint caps its work at 100 recipients
// per call (Dodo rate limit + admin request timeout).
//
// POST /api/v1/admin/ops/run-checkout-followup
func (h *Handlers) AdminRunCheckoutFollowup(c *gin.Context) {
	svc := billing.NewCheckoutFollowUpService(h.db)
	sent := svc.SendFollowUpsForAdmin()
	c.JSON(http.StatusOK, gin.H{"sent": sent})
}

// AdminRunReconciliation triggers one reconciliation pass on demand,
// returning the drift snapshot. Never sends the alert email (use
// CheckAndAlertPreview) — hitting this from the UI is an active
// inspection, not an incident notification.
//
// POST /api/v1/admin/ops/run-reconciliation
func (h *Handlers) AdminRunReconciliation(c *gin.Context) {
	svc := billing.NewReconciliationService(h.db)
	report := svc.CheckAndAlertPreview()
	c.JSON(http.StatusOK, report)
}

// AdminOpsHealth is a lightweight endpoint the Issues page hits to
// decide which "Setup tables" state to show — if either critical
// table is missing, we surface a warning banner and the button
// becomes primary; if both exist, the button is de-emphasized as
// a maintenance action.
//
// GET /api/v1/admin/ops/health
func (h *Handlers) AdminOpsHealth(c *gin.Context) {
	checkoutAttemptsExists := tableExists(h.db, "checkout_attempts")
	adminBroadcastsExists := tableExists(h.db, "admin_broadcasts")
	c.JSON(http.StatusOK, gin.H{
		"tables": gin.H{
			"checkout_attempts": checkoutAttemptsExists,
			"admin_broadcasts":  adminBroadcastsExists,
		},
		"all_ok": checkoutAttemptsExists && adminBroadcastsExists,
	})
}

// tableExists returns true if the given table is present in the current
// DB schema. Uses information_schema so it works on both Postgres and
// SQLite (with GORM's dialect translation).
func tableExists(db *gorm.DB, name string) bool {
	var n int64
	db.Raw("SELECT 1 FROM information_schema.tables WHERE table_name = ? LIMIT 1", name).Scan(&n)
	return n == 1
}
