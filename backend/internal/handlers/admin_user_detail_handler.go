package handlers

import (
	"net/http"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// AdminGetUserDetail returns a rich single-user view for the admin console.
// Consolidates the seven things ops need to answer "who is this user and
// what's going on with their account":
//
//	profile      — id, email, name, country, verified, plan state
//	subscriptions — active + historical Dodo/Stripe subscriptions
//	invoices     — paid + open invoices (last 20)
//	activity     — last 50 ActivityEvent rows (login, submission, etc.)
//	visits       — last 10 VisitEvent rows (route, referrer, device)
//	audit        — last 20 BillingAuditLog rows where user is target
//	checkouts    — last 10 CheckoutAttempts (completed + abandoned)
//
// Never leaks password_hash. Only fields on the explicit response
// structs are serialized; everything else on models.User is dropped.
func (h *Handlers) AdminGetUserDetail(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var user models.User
	if err := h.db.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// --- profile (explicit whitelist) ---
	profile := gin.H{
		"id":                       user.ID,
		"email":                    user.Email,
		"name":                     user.Name,
		"role":                     string(user.Role),
		"subscription":             string(user.Subscription),
		"subscription_end":         user.SubscriptionEnd,
		"is_active":                user.IsActive,
		"email_verified":           user.EmailVerified,
		"country_code":             user.CountryCode,
		"billing_country_locked":   user.BillingCountryLocked,
		"dodo_customer_id":         user.DodoCustomerID,
		"stripe_customer_id":       user.StripeCustomerID,
		"razorpay_customer_id":     user.RazorpayCustomerID,
		"premium_override":         user.PremiumOverride,
		"premium_override_reason":  user.PremiumOverrideReason,
		"premium_override_at":      user.PremiumOverrideAt,
		"token_version":            user.TokenVersion,
		"created_at":               user.CreatedAt,
		"updated_at":               user.UpdatedAt,
	}

	// --- subscriptions ---
	var subs []models.Subscription
	h.db.Where("user_id = ?", user.ID).Order("created_at DESC").Find(&subs)

	// --- invoices ---
	var invoices []models.Invoice
	h.db.Where("user_id = ?", user.ID).Order("created_at DESC").Limit(20).Find(&invoices)

	// --- activity ---
	var activity []models.ActivityEvent
	h.db.Where("user_id = ?", user.ID).Order("occurred_at DESC").Limit(50).Find(&activity)

	// --- visits ---
	var visits []models.VisitEvent
	h.db.Where("user_id = ?", user.ID).Order("occurred_at DESC").Limit(10).Find(&visits)

	// --- audit log entries targeting this user ---
	var audit []models.BillingAuditLog
	h.db.Where("target_user_id = ?", user.ID).Order("created_at DESC").Limit(20).Find(&audit)

	// --- checkout attempts (via CheckoutAttempt table) ---
	var checkouts []models.CheckoutAttempt
	h.db.Where("user_id = ?", user.ID).Order("started_at DESC").Limit(10).Find(&checkouts)

	// Derived: is Pro currently valid (subscription_end in future)?
	proValid := user.Subscription == models.PlanPro
	if proValid && user.SubscriptionEnd != nil && user.SubscriptionEnd.Before(time.Now()) {
		proValid = false
	}

	c.JSON(http.StatusOK, gin.H{
		"profile":       profile,
		"is_pro_active": proValid,
		"subscriptions": subs,
		"invoices":      invoices,
		"activity":      activity,
		"visits":        visits,
		"audit":         audit,
		"checkouts":     checkouts,
	})
}
