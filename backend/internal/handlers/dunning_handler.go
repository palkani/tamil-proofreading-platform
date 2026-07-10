package handlers

import (
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/billing"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DunningHandler exposes the two public endpoints that the abandoned-
// checkout drip emails link to: one-click resume-checkout and
// one-click unsubscribe. Both are unauthenticated by cookie; identity
// comes from the signed token in the URL (see billing/dunning_tokens.go).
//
// These live on the Go backend rather than the Express frontend
// because they need direct DB access — the resume flow queries the
// user's Dodo customer id and creates a fresh Dodo checkout session,
// and the unsubscribe flow updates users.marketing_unsubscribed_at.
// Routing both through Express would add two proxy hops for no benefit.
type DunningHandler struct {
	db             *gorm.DB
	billingService *billing.BillingService
}

// NewDunningHandler wires up the dependencies.
func NewDunningHandler(db *gorm.DB, billingService *billing.BillingService) *DunningHandler {
	return &DunningHandler{db: db, billingService: billingService}
}

// ResumeCheckout handles GET /checkout/resume?token=... The token
// carries user_id + plan_code, signed with the app JWT_SECRET-derived
// dunning key. On a valid token we:
//
//  1. Reject if the user is already on an active/trialing paid plan —
//     re-charging them for a plan they already have would be a
//     billing incident. Redirect to workspace instead.
//  2. Reject if the user has since unsubscribed from marketing —
//     defensive; unsub-then-click-old-drip is an odd state but
//     shouldn't reopen a checkout without explicit consent.
//  3. Create a fresh Dodo checkout session (the original payment_link
//     may have expired) and 302 the browser straight to it.
//
// All error cases redirect back to the pricing page with a
// user-friendly `?msg=` param rather than showing a bare error page —
// email links are one of the highest-friction paths, we want any
// failure to still feel like "click here and see prices."
func (dh *DunningHandler) ResumeCheckout(c *gin.Context) {
	token := c.Query("token")
	userID, planCode, err := billing.VerifyResumeToken(token)
	if err != nil {
		log.Printf("[DUNNING/RESUME] Invalid token: %v", err)
		dh.redirectPricing(c, "expired_link")
		return
	}

	// User existence + active-sub check.
	var user models.User
	if err := dh.db.First(&user, userID).Error; err != nil {
		log.Printf("[DUNNING/RESUME] User %d not found: %v", userID, err)
		dh.redirectPricing(c, "expired_link")
		return
	}

	// If they've unsubscribed since the email was sent, don't
	// silently reopen checkout. Send them to pricing where the
	// action is explicit.
	if user.MarketingUnsubscribedAt != nil {
		log.Printf("[DUNNING/RESUME] User %d has unsubscribed — skipping resume", userID)
		dh.redirectPricing(c, "please_log_in_to_upgrade")
		return
	}

	// Already Pro? Send to workspace with a friendly note. This
	// covers the common "clicked touch 3 email even though I
	// already subscribed yesterday" case.
	if dh.userHasActivePaidPlan(userID) {
		log.Printf("[DUNNING/RESUME] User %d already has active plan — sending to workspace", userID)
		dh.redirectFrontend(c, "/workspace?msg=already_pro", http.StatusFound)
		return
	}

	// Fresh Dodo session. The BillingService already refuses
	// double-subscribes to the same plan, records a new
	// CheckoutAttempt row for the drip loop, and returns the
	// hosted payment_link URL.
	resp, err := dh.billingService.CreateCheckoutSession(userID, billing.CheckoutRequest{
		PlanCode: planCode,
	})
	if err != nil {
		log.Printf("[DUNNING/RESUME] CreateCheckoutSession failed for user=%d plan=%s: %v", userID, planCode, err)
		dh.redirectPricing(c, "checkout_error")
		return
	}
	if strings.TrimSpace(resp.CheckoutURL) == "" {
		log.Printf("[DUNNING/RESUME] Empty CheckoutURL for user=%d plan=%s", userID, planCode)
		dh.redirectPricing(c, "checkout_error")
		return
	}

	log.Printf("[DUNNING/RESUME] User %d plan=%s → Dodo checkout", userID, planCode)
	c.Redirect(http.StatusFound, resp.CheckoutURL)
}

// Unsubscribe handles GET /email/unsubscribe?token=... Sets
// users.marketing_unsubscribed_at to now(). Renders a small confirm
// page so the user knows it worked — one-click unsubs that just
// return "200 OK" leave people unsure whether it took effect.
func (dh *DunningHandler) Unsubscribe(c *gin.Context) {
	token := c.Query("token")
	userID, err := billing.VerifyUnsubToken(token)
	if err != nil {
		log.Printf("[DUNNING/UNSUB] Invalid token: %v", err)
		dh.renderUnsubPage(c, http.StatusBadRequest, "This unsubscribe link is invalid or expired. If you're still getting emails you'd like to stop, reply to any of them and we'll remove you manually.")
		return
	}

	now := time.Now()
	if err := dh.db.Model(&models.User{}).
		Where("id = ? AND marketing_unsubscribed_at IS NULL", userID).
		Update("marketing_unsubscribed_at", now).Error; err != nil {
		log.Printf("[DUNNING/UNSUB] DB update failed for user=%d: %v", userID, err)
		dh.renderUnsubPage(c, http.StatusInternalServerError, "Something went wrong on our end. Please reply to any of our emails and we'll unsubscribe you manually.")
		return
	}

	log.Printf("[DUNNING/UNSUB] User %d unsubscribed from marketing emails", userID)
	dh.renderUnsubPage(c, http.StatusOK, "You've been unsubscribed. You won't get any more marketing or reminder emails from ProofTamil. You'll still get transactional emails (receipts, password resets) as long as your account is active.")
}

// userHasActivePaidPlan returns true if the given user has any
// active or trialing subscription row. Kept private to this handler
// because the same check in the drip loop uses a slightly different
// shape (count-with-error-handling).
func (dh *DunningHandler) userHasActivePaidPlan(userID uint) bool {
	var count int64
	err := dh.db.Model(&models.Subscription{}).
		Where("user_id = ? AND status IN ?", userID, []models.BillingSubscriptionStatus{
			models.BillingSubStatusActive,
			models.BillingSubStatusTrialing,
		}).
		Count(&count).Error
	if err != nil {
		// If the lookup fails we err on the side of NOT resuming
		// checkout — better to send them to pricing than risk a
		// double charge.
		log.Printf("[DUNNING/RESUME] Active-sub check errored for user=%d: %v", userID, err)
		return true
	}
	return count > 0
}

// redirectPricing sends the user to the public pricing page with a
// user-facing `msg` query param. Kept as a helper so all error paths
// route through one place and the frontend can display consistent
// copy for each message key.
func (dh *DunningHandler) redirectPricing(c *gin.Context, msg string) {
	dh.redirectFrontend(c, "/pricing?msg="+msg, http.StatusFound)
}

// redirectFrontend redirects to a path on FRONTEND_URL (defaults to
// prooftamil.com). All drip-flow redirects go through here so we
// never accidentally 302 to the API host.
func (dh *DunningHandler) redirectFrontend(c *gin.Context, path string, code int) {
	base := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
	if base == "" {
		base = "https://www.prooftamil.com"
	}
	c.Redirect(code, base+path)
}

// renderUnsubPage returns a minimal branded HTML page confirming
// (or explaining a failure on) the unsubscribe action. Kept inline
// rather than pulling in an EJS render because this handler lives
// on the Go backend and has no template engine available.
func (dh *DunningHandler) renderUnsubPage(c *gin.Context, status int, message string) {
	body := fmt.Sprintf(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribe · ProofTamil</title>
</head>
<body style="margin:0;padding:0;background:#F5EDD7;font-family:-apple-system,'Segoe UI',sans-serif;color:#171C2C;">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
    <div style="max-width:520px;background:#FDF9EE;border-radius:16px;padding:40px 32px;text-align:center;box-shadow:0 8px 24px -12px rgba(23,28,44,0.15);">
      <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:24px;">
        <span style="display:inline-block;width:36px;height:36px;background:#171C2C;color:#F5A623;border-radius:8px;font-size:1.4rem;line-height:36px;text-align:center;font-family:'Noto Serif Tamil',serif;font-weight:700;">த</span>
        <span style="font-family:'New York',ui-serif,Georgia,serif;font-size:1.15rem;font-weight:700;color:#171C2C;">ProofTamil</span>
      </div>
      <h1 style="margin:0 0 16px;font-family:'New York',ui-serif,Georgia,serif;font-size:1.4rem;color:#171C2C;">Email preferences updated</h1>
      <p style="margin:0 0 24px;font-size:1.0rem;line-height:1.6;color:rgba(23,28,44,0.85);">%s</p>
      <a href="%s" style="display:inline-block;background:#171C2C;color:#F5EDD7;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;">Back to ProofTamil</a>
    </div>
  </div>
</body>
</html>`, html.EscapeString(message), html.EscapeString(dh.frontendURL()))

	c.Data(status, "text/html; charset=utf-8", []byte(body))
}

func (dh *DunningHandler) frontendURL() string {
	base := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
	if base == "" {
		base = "https://www.prooftamil.com"
	}
	return base
}
