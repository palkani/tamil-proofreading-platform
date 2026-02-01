package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/affiliate"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/webhook"
)

type CreatePaymentRequest struct {
	Amount        float64              `json:"amount" binding:"required"`
	Currency      string               `json:"currency" binding:"required"`
	PaymentMethod models.PaymentMethod `json:"payment_method" binding:"required"`
	PaymentType   models.PaymentType   `json:"payment_type" binding:"required"`
	Description   string               `json:"description,omitempty"`
	SubmissionID  *uint                `json:"submission_id,omitempty"`
}

type VerifyPaymentRequest struct {
	TransactionID string `json:"transaction_id" binding:"required"`
	PaymentID     string `json:"payment_id" binding:"required"`
}

// CreatePayment creates a payment intent/order
func (h *Handlers) CreatePayment(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req CreatePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check for referral discount
	affiliateSvc := affiliate.NewAffiliateService(h.db)
	hasDiscount, discountRate := affiliateSvc.CheckReferralDiscount(userID)
	
	originalAmount := req.Amount
	discountAmount := 0.0
	finalAmount := req.Amount
	
	if hasDiscount && discountRate > 0 {
		discountAmount = req.Amount * discountRate
		finalAmount = req.Amount - discountAmount
		log.Printf("[PAYMENT] Applying referral discount: user=%d original=%.2f discount=%.2f%% final=%.2f",
			userID, originalAmount, discountRate*100, finalAmount)
	}

	metadata := map[string]string{
		"user_id": strconv.Itoa(int(userID)),
		"type":    string(req.PaymentType),
	}

	if req.SubmissionID != nil {
		metadata["submission_id"] = strconv.Itoa(int(*req.SubmissionID))
	}
	
	// Add discount metadata for auditing
	if hasDiscount {
		metadata["referral_discount"] = strconv.FormatFloat(discountRate*100, 'f', 0, 64) + "%"
		metadata["original_amount"] = strconv.FormatFloat(originalAmount, 'f', 2, 64)
	}

	var paymentIntent interface{}
	var gatewayPaymentID string

	switch req.PaymentMethod {
	case models.PaymentMethodStripe:
		intent, err := h.paymentService.CreateStripePaymentIntent(finalAmount, req.Currency, metadata)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment intent"})
			return
		}
		paymentIntent = intent
		gatewayPaymentID = intent.ID

	case models.PaymentMethodRazorpay:
		order, err := h.paymentService.CreateRazorpayOrder(finalAmount, req.Currency, metadata)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
			return
		}
		paymentIntent = order
		gatewayPaymentID = order["id"].(string)

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment method"})
		return
	}

	// Create payment record with discounted amount
	payment, err := h.paymentService.CreatePaymentRecord(
		userID,
		finalAmount,
		req.Currency,
		req.PaymentMethod,
		req.PaymentType,
		gatewayPaymentID,
		req.Description,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment record"})
		return
	}

	response := gin.H{
		"payment":        payment,
		"payment_intent": paymentIntent,
	}
	
	// Include discount information in response
	if hasDiscount {
		response["discount_applied"] = true
		response["discount_percent"] = discountRate * 100
		response["original_amount"] = originalAmount
		response["discount_amount"] = discountAmount
	}

	c.JSON(http.StatusOK, response)
}

// VerifyPayment verifies a payment
func (h *Handlers) VerifyPayment(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req VerifyPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	payment, err := h.paymentService.GetPaymentByTransactionID(req.TransactionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment not found"})
		return
	}

	if payment.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized"})
		return
	}

	// TODO: Verify payment with gateway
	// For now, just return the payment status
	c.JSON(http.StatusOK, gin.H{"payment": payment})
}

// GetPayments retrieves user's payments
func (h *Handlers) GetPayments(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	limitStr := c.DefaultQuery("limit", "10")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)

	payments, total, err := h.paymentService.GetUserPayments(userID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payments"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"payments": payments,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// StripeWebhook handles Stripe webhook events
func (h *Handlers) StripeWebhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	signature := c.GetHeader("Stripe-Signature")
	if signature == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing signature"})
		return
	}

	event, err := webhook.ConstructEvent(payload, signature, h.cfg.StripeWebhookSecret)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid signature"})
		return
	}

	// Handle different event types
	affiliateSvc := affiliate.NewAffiliateService(h.db)

	switch event.Type {
	case "payment_intent.succeeded":
		var paymentIntent stripe.PaymentIntent
		err := json.Unmarshal(event.Data.Raw, &paymentIntent)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse event"})
			return
		}

		// Update payment status
		payment, err := h.paymentService.GetPaymentByGatewayID(paymentIntent.ID)
		if err == nil {
			h.paymentService.UpdatePaymentStatus(payment.ID, models.PaymentStatusCompleted, paymentIntent.ID)
			
			// Record affiliate commission if applicable
			if err := affiliateSvc.RecordCommission(payment); err != nil {
				log.Printf("[AFFILIATE] Failed to record commission for payment %d: %v", payment.ID, err)
			}
		}

	case "payment_intent.payment_failed":
		var paymentIntent stripe.PaymentIntent
		err := json.Unmarshal(event.Data.Raw, &paymentIntent)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse event"})
			return
		}

		// Update payment status
		payment, err := h.paymentService.GetPaymentByGatewayID(paymentIntent.ID)
		if err == nil {
			h.paymentService.UpdatePaymentStatus(payment.ID, models.PaymentStatusFailed, paymentIntent.ID)
		}

	case "charge.refunded", "charge.refund.updated":
		// Handle refunds - void affiliate commissions if within void period
		var charge stripe.Charge
		err := json.Unmarshal(event.Data.Raw, &charge)
		if err != nil {
			log.Printf("[AFFILIATE] Failed to parse refund event: %v", err)
			break
		}

		// Try to find the payment by the payment intent ID from the charge
		if charge.PaymentIntent != nil {
			payment, err := h.paymentService.GetPaymentByGatewayID(charge.PaymentIntent.ID)
			if err == nil {
				// Update payment status to refunded
				h.paymentService.UpdatePaymentStatus(payment.ID, models.PaymentStatusRefunded, charge.ID)
				
				// Void affiliate commission
				if err := affiliateSvc.VoidCommission(payment.ID, "Payment refunded"); err != nil {
					log.Printf("[AFFILIATE] Failed to void commission for payment %d: %v", payment.ID, err)
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

// RazorpayWebhook handles Razorpay webhook events
func (h *Handlers) RazorpayWebhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	signature := c.GetHeader("X-Razorpay-Signature")
	if signature == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing signature"})
		return
	}

	if !h.paymentService.VerifyRazorpayWebhook(payload, signature) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid signature"})
		return
	}

	// TODO: Parse Razorpay webhook event and update payment status
	// Razorpay webhook format is different from Stripe

	c.JSON(http.StatusOK, gin.H{"received": true})
}

