package handlers

import (
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/services/billing"

	"github.com/gin-gonic/gin"
)

// BillingHandlers contains all billing-related handlers
type BillingHandlers struct {
	billingService *billing.BillingService
	webhookService *billing.WebhookService
	pricingService *billing.PricingService
}

// NewBillingHandlers creates a new billing handlers instance
func NewBillingHandlers(billingService *billing.BillingService, webhookService *billing.WebhookService, pricingService *billing.PricingService) *BillingHandlers {
	return &BillingHandlers{
		billingService: billingService,
		webhookService: webhookService,
		pricingService: pricingService,
	}
}

// BillingService exposes the underlying billing service for callers
// that need to reuse it — currently only the dunning/resume-checkout
// handler, which creates a fresh Dodo session on behalf of the user
// clicking a drip-email CTA.
func (h *BillingHandlers) BillingService() *billing.BillingService {
	return h.billingService
}

// ==================== BILLING ENDPOINTS ====================

// CreateCheckoutSession creates a checkout session for subscription
// POST /billing/checkout-session
func (h *BillingHandlers) CreateCheckoutSession(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req billing.CheckoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Validate plan code against allowed values
	allowedPlans := map[string]bool{
		"PRO_MONTHLY": true,
		"PRO_YEARLY":  true,
	}
	if !allowedPlans[req.PlanCode] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid plan code"})
		return
	}

	response, err := h.billingService.CreateCheckoutSession(userID, req)
	if err != nil {
		if errors.Is(err, billing.ErrAlreadySubscribed) {
			// 409 Conflict signals the frontend to route the user to
			// their billing settings instead of retrying. Not a 500 —
			// the request is well-formed, the state just doesn't allow
			// this operation.
			c.JSON(http.StatusConflict, gin.H{
				"error":          err.Error(),
				"code":           "already_subscribed",
				"manage_url":     "/settings/billing",
			})
			return
		}
		log.Printf("[BILLING] CreateCheckoutSession failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create checkout session", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"provider":     response.Provider,
		"quote":        response.Quote,
		"checkout_url": response.CheckoutURL,
	})
}

// GetBillingStatus returns the user's current billing status
// GET /billing/me
func (h *BillingHandlers) GetBillingStatus(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	status, err := h.billingService.GetBillingStatus(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get billing status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"billing": status,
	})
}

// GetPlans returns all available subscription plans
// GET /billing/plans
func (h *BillingHandlers) GetPlans(c *gin.Context) {
	plans, err := h.pricingService.GetAllPlans()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get plans"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"plans":   plans,
	})
}

// GetPricing calculates pricing for a user based on their country
// GET /billing/pricing?plan_code=PRO_MONTHLY&country_code=IN
func (h *BillingHandlers) GetPricing(c *gin.Context) {
	planCode := c.Query("plan_code")
	if planCode == "" {
		planCode = "PRO_MONTHLY"
	}

	countryCode := c.Query("country_code")
	if countryCode == "" {
		countryCode = "US"
	}

	quote, err := h.pricingService.CalculatePricing(planCode, countryCode)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"pricing": quote,
	})
}

// CancelSubscription cancels the user's subscription
// POST /billing/cancel
func (h *BillingHandlers) CancelSubscription(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		Immediate bool `json:"immediate"`
	}
	c.ShouldBindJSON(&req)

	if err := h.billingService.CancelSubscription(userID, req.Immediate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel subscription", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Subscription cancelled successfully",
	})
}

// ==================== WEBHOOK ENDPOINTS ====================

// DodoWebhook handles DodoPayments webhooks (Standard Webhooks spec).
// POST /billing/webhook
func (h *BillingHandlers) DodoWebhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}

	webhookID := c.GetHeader("webhook-id")
	timestamp := c.GetHeader("webhook-timestamp")
	signature := c.GetHeader("webhook-signature")

	if webhookID == "" || timestamp == "" || signature == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing Standard Webhooks headers"})
		return
	}

	if err := h.webhookService.HandleDodoWebhook(payload, webhookID, timestamp, signature); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

// ==================== ADMIN ENDPOINTS ====================

// AdminSetGlobalPremium sets the global premium enabled flag
// PATCH /admin/feature-flags/premium_enabled
func (h *BillingHandlers) AdminSetGlobalPremium(c *gin.Context) {
	adminUserID, ok := getUserIDFromContext(c)
	if !ok || adminUserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		Enabled bool   `json:"enabled"`
		Reason  string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.billingService.SetGlobalPremiumEnabled(adminUserID, req.Enabled, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update feature flag"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Global premium flag updated",
		"enabled": req.Enabled,
	})
}

// AdminSetUserPremiumOverride sets premium override for a user
// PATCH /admin/users/:id/premium_override
func (h *BillingHandlers) AdminSetUserPremiumOverride(c *gin.Context) {
	adminUserID, ok := getUserIDFromContext(c)
	if !ok || adminUserID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	targetUserIDStr := c.Param("id")
	targetUserID, err := strconv.ParseUint(targetUserIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req struct {
		Enabled bool   `json:"enabled"`
		Reason  string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.billingService.SetAdminPremiumOverride(adminUserID, uint(targetUserID), req.Enabled, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user premium override"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User premium override updated",
		"user_id": targetUserID,
		"enabled": req.Enabled,
	})
}

// AdminGetGlobalPremiumStatus returns the global premium enabled status
// GET /admin/feature-flags/premium_enabled
func (h *BillingHandlers) AdminGetGlobalPremiumStatus(c *gin.Context) {
	enabled := h.billingService.IsGlobalPremiumEnabled()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"key":     "premium_enabled",
		"enabled": enabled,
	})
}

