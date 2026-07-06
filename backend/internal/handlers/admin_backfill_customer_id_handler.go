package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// AdminBackfillCustomerID walks Dodo subscription rows where
// ProviderCustomerID is empty (the legacy artifact of the customer_id
// nesting bug fixed in 1620038), fetches the current customer_id from
// Dodo's /subscriptions/:id endpoint, and writes it back.
//
// Also updates the corresponding user's dodo_customer_id when it's
// missing, so returning users can reuse their Dodo customer identity
// on their next checkout.
//
// The endpoint is guarded by AdminMiddleware so only allowlisted
// admins can trigger it. It's synchronous and rate-limited by the
// existing 60/min admin cap — so a run against thousands of rows
// would time out; caller should batch with ?limit= if needed.
//
// POST /api/v1/admin/subscriptions/backfill-customer-id
// Query params:
//   dry_run=true    scan without writes (default false)
//   limit=N         max rows to process per call (default 100, cap 500)
//
// Response:
//   {
//     "scanned":       int,
//     "updated_subs":  int,   // subscription rows that got a new customer_id
//     "updated_users": int,   // users that got a new dodo_customer_id
//     "skipped":       int,   // Dodo returned empty customer_id (unresolvable)
//     "errors":        [{sub_id, error}, ...]
//   }
func (h *Handlers) AdminBackfillCustomerID(c *gin.Context) {
	dryRun := strings.EqualFold(c.Query("dry_run"), "true")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit < 1 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}

	// Dodo adapter comes from BillingService, but we don't have direct
	// access from Handlers. Get it via a service accessor added below.
	dodo, ok := h.dodoAdapterAccessor()
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "billing not initialised"})
		return
	}

	// Only Dodo subscriptions where customer_id is empty. Excludes
	// deleted rows via GORM's soft-delete default.
	var subs []models.Subscription
	if err := h.db.
		Where("provider = ? AND (provider_customer_id IS NULL OR provider_customer_id = '')",
			models.PaymentProviderDodo).
		Order("id ASC").
		Limit(limit).
		Find(&subs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type errRow struct {
		SubID string `json:"sub_id"`
		Error string `json:"error"`
	}
	result := struct {
		Scanned      int      `json:"scanned"`
		UpdatedSubs  int      `json:"updated_subs"`
		UpdatedUsers int      `json:"updated_users"`
		Skipped      int      `json:"skipped"`
		DryRun       bool     `json:"dry_run"`
		Errors       []errRow `json:"errors"`
	}{DryRun: dryRun}

	seenUserIDs := make(map[uint]struct{})

	for _, sub := range subs {
		result.Scanned++
		if sub.ProviderSubscriptionID == "" {
			result.Skipped++
			continue
		}

		customerID, _, _, err := dodo.GetSubscription(sub.ProviderSubscriptionID)
		if err != nil {
			result.Errors = append(result.Errors, errRow{SubID: sub.ProviderSubscriptionID, Error: err.Error()})
			continue
		}
		if customerID == "" {
			result.Skipped++
			continue
		}

		if !dryRun {
			if err := h.db.Model(&models.Subscription{}).
				Where("id = ?", sub.ID).
				Update("provider_customer_id", customerID).Error; err != nil {
				result.Errors = append(result.Errors, errRow{SubID: sub.ProviderSubscriptionID, Error: err.Error()})
				continue
			}
		}
		result.UpdatedSubs++

		// Only update the user once per run, and only if their existing
		// dodo_customer_id is empty/nil. Never clobber an existing one —
		// if a returning user has multiple Dodo customers (edge case),
		// keep the newest activation as the authoritative value.
		if _, done := seenUserIDs[sub.UserID]; done {
			continue
		}
		seenUserIDs[sub.UserID] = struct{}{}

		var user models.User
		if err := h.db.First(&user, sub.UserID).Error; err != nil {
			continue
		}
		if user.DodoCustomerID == nil || *user.DodoCustomerID == "" {
			if !dryRun {
				if err := h.db.Model(&user).Update("dodo_customer_id", customerID).Error; err != nil {
					result.Errors = append(result.Errors, errRow{SubID: sub.ProviderSubscriptionID, Error: "user update: " + err.Error()})
					continue
				}
			}
			result.UpdatedUsers++
		}
	}

	c.JSON(http.StatusOK, result)
}
