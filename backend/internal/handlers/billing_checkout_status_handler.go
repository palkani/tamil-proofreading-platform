package handlers

import (
	"net/http"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// checkoutSessionValidity is how long we consider a Dodo checkout_attempt
// fresh from our side. Dodo's own payment_link shows a ~15-minute
// countdown timer on their hosted checkout page. We match that window
// so a user who lets the timer run out cannot land on our
// /billing/success page (via a stale bookmark, Dodo redirect, or copy-
// paste) and get told their subscription is active.
//
// Sizing rationale: the Dodo counter starts at 15:00, so 15 minutes
// exactly is enough. We deliberately do not add a webhook-delivery
// buffer here because the outer /billing/success page also checks
// billing/me (backend-signal Pro state) — if a real payment landed at
// second 14:59 and the webhook confirmation arrives at 15:30, the
// backend-signal path will still show success. This session check is
// specifically about refusing stale sessions, not about racing webhook
// delivery.
const checkoutSessionValidity = 15 * time.Minute

// CheckoutStatusResponse is the shape returned by GetCheckoutStatus.
// Kept flat and JSON-friendly so the Express /billing/success page
// can render off a single fetch.
type CheckoutStatusResponse struct {
	// Overall status the frontend should render on:
	//   active     - completed_at is set → payment succeeded
	//   pending    - still within the freshness window, no completion yet
	//   expired    - started_at is older than the freshness window
	//   not_found  - no matching checkout_attempt (spoofed URL or wrong id)
	Status string `json:"status"`

	StartedAt         *time.Time `json:"started_at,omitempty"`
	CompletedAt       *time.Time `json:"completed_at,omitempty"`
	ExpiresAt         *time.Time `json:"expires_at,omitempty"`
	SecondsRemaining  int64      `json:"seconds_remaining"`
}

// GetCheckoutStatus reports the freshness + completion state of a
// Dodo checkout_attempt so the frontend /billing/success page can
// render an accurate state.
//
// GET /api/v1/billing/checkout-status?subscription_id=sub_XXX
//
// Public endpoint (no auth) — the caller is typically the return-URL
// landing page, which may or may not have a valid session cookie.
// Rate-limited via the site-wide limiter; contains no sensitive data
// so the openness is fine.
func (h *Handlers) GetCheckoutStatus(c *gin.Context) {
	subID := strings.TrimSpace(c.Query("subscription_id"))
	if subID == "" || !strings.HasPrefix(subID, "sub_") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subscription_id required"})
		return
	}

	var attempt models.CheckoutAttempt
	if err := h.db.Where("provider_subscription_id = ?", subID).First(&attempt).Error; err != nil {
		// No matching row — could be a spoofed URL, a checkout from
		// before the checkout_attempts table existed, or a different
		// provider. Return not_found so the frontend renders a safe
		// generic pending state.
		c.JSON(http.StatusOK, CheckoutStatusResponse{Status: "not_found"})
		return
	}

	expiresAt := attempt.StartedAt.Add(checkoutSessionValidity)
	now := time.Now()

	resp := CheckoutStatusResponse{
		StartedAt: &attempt.StartedAt,
		ExpiresAt: &expiresAt,
	}
	if attempt.CompletedAt != nil {
		resp.CompletedAt = attempt.CompletedAt
		resp.Status = "active"
	} else if now.After(expiresAt) {
		resp.Status = "expired"
		resp.SecondsRemaining = 0
	} else {
		resp.Status = "pending"
		resp.SecondsRemaining = int64(expiresAt.Sub(now).Seconds())
	}

	c.JSON(http.StatusOK, resp)
}
