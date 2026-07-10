package handlers

import (
	"net/http"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// Daily credit limits. Free users get a modest quota that resets at
// UTC midnight; Pro users effectively get unlimited (a very high number
// so the UI never has to special-case a null).
const (
	freeTierDailyCredits = 20
	proTierDailyCredits  = 9999
)

// usageTodayResponse is the exact shape the workspace consumes on a
// "New Draft" click. Field names deliberately mirror the pattern our
// competitor exposes (user_tier, subscription_status, is_pro, credits_*,
// usage_date, provider metadata) so the frontend can adopt this once
// and read either backend interchangeably during any migration.
type usageTodayResponse struct {
	UserTier             string     `json:"user_tier"`              // free | pro | team_member (future)
	SubscriptionStatus   string     `json:"subscription_status"`    // free | active | trialing | past_due | cancelled
	IsPro                bool       `json:"is_pro"`
	CreditsUsed          int64      `json:"credits_used"`
	CreditsLimit         int        `json:"credits_limit"`
	CreditsRemaining     int        `json:"credits_remaining"`
	IsExhausted          bool       `json:"is_exhausted"`
	UsageDate            string     `json:"usage_date"`             // YYYY-MM-DD (UTC)
	SubscriptionEndDate  *time.Time `json:"subscription_end_date"`
	PaymentProvider      *string    `json:"payment_provider"`
	SubscriptionQuantity int        `json:"subscription_quantity"`
	RawProviderStatus    *string    `json:"raw_provider_status"`
}

// GetUsageToday returns the caller's current-day usage window and plan
// state in one shot. Called by the workspace on "New Draft" click so
// the client can decide whether to open the editor, show the exhausted
// modal, or nudge toward upgrade.
//
// GET /api/v1/usage/today  (auth required)
func (h *Handlers) GetUsageToday(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Load user for tier + subscription end
	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Resolve plan state. Pro = personal subscription is Pro AND not expired,
	// OR premium_override is set. Team plan inheritance will land here later
	// when the org membership + subscription tables ship.
	isPro := user.PremiumOverride
	if !isPro && user.Subscription == models.PlanPro {
		if user.SubscriptionEnd == nil || user.SubscriptionEnd.After(time.Now()) {
			isPro = true
		}
	}

	tier := "free"
	if isPro {
		tier = "pro"
	}

	// Pull the active provider subscription (if any) to surface provider,
	// quantity, and raw provider status. Non-fatal if there isn't one —
	// free users simply have nulls for these fields.
	var sub models.Subscription
	subFound := false
	if err := h.db.Where("user_id = ? AND status IN (?, ?, ?, ?)",
		userID,
		models.BillingSubStatusActive,
		models.BillingSubStatusTrialing,
		models.BillingSubStatusPastDue,
		models.BillingSubStatusIncomplete,
	).Order("created_at DESC").First(&sub).Error; err == nil {
		subFound = true
	}

	// Effective subscription_status:
	//   - "free" if no active/trialing subscription
	//   - Otherwise the underlying subscription status
	subscriptionStatus := "free"
	if subFound {
		subscriptionStatus = string(sub.Status)
	}

	// Credit window = today UTC. Counting rows in `usage` (each AI
	// request writes one) is the same source of truth the daily-token
	// enforcement uses in submission_handlers.go, so limits agree.
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay := startOfDay.Add(24 * time.Hour)

	var creditsUsed int64
	if err := h.db.Model(&models.Usage{}).
		Where("user_id = ? AND date >= ? AND date < ?", userID, startOfDay, endOfDay).
		Count(&creditsUsed).Error; err != nil {
		// Non-fatal: if the count fails, assume zero so we don't lock the
		// user out. The submit endpoint has its own enforcement.
		creditsUsed = 0
	}

	// Limit + remaining + exhausted derivation.
	limit := freeTierDailyCredits
	if isPro {
		limit = proTierDailyCredits
	}
	remaining := limit - int(creditsUsed)
	if remaining < 0 {
		remaining = 0
	}
	isExhausted := !isPro && int(creditsUsed) >= freeTierDailyCredits

	// Optional provider fields — pointers so JSON emits `null` when unset,
	// which the frontend can distinguish from "provider is present but empty".
	var (
		endDate           *time.Time
		paymentProvider   *string
		quantity          = 1
		rawProviderStatus *string
	)
	if subFound {
		if sub.CurrentPeriodEnd != nil {
			endDate = sub.CurrentPeriodEnd
		}
		provider := string(sub.Provider)
		if provider != "" {
			paymentProvider = &provider
		}
		// Subscription.Quantity ships with the team-plan migration; default
		// to 1 for now so the field is always populated.
		if q := getSubscriptionQuantity(&sub); q > 0 {
			quantity = q
		}
		if raw := strings.TrimSpace(string(sub.Status)); raw != "" {
			rawProviderStatus = &raw
		}
	}

	c.JSON(http.StatusOK, []usageTodayResponse{{
		UserTier:             tier,
		SubscriptionStatus:   subscriptionStatus,
		IsPro:                isPro,
		CreditsUsed:          creditsUsed,
		CreditsLimit:         limit,
		CreditsRemaining:     remaining,
		IsExhausted:          isExhausted,
		UsageDate:            startOfDay.Format("2006-01-02"),
		SubscriptionEndDate:  endDate,
		PaymentProvider:      paymentProvider,
		SubscriptionQuantity: quantity,
		RawProviderStatus:    rawProviderStatus,
	}})
}

// getSubscriptionQuantity reads Subscription.Quantity if the column
// exists on the model. Isolated in a helper so this handler doesn't
// break during the team-plan migration when Quantity is added.
func getSubscriptionQuantity(sub *models.Subscription) int {
	// TODO: once the team-plan migration lands, read sub.Quantity directly.
	// Until then, all subs are personal so quantity is always 1.
	return 1
}
