package handlers

import (
	"net/http"
	"strconv"

	"tamil-proofreading-platform/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

type VerifyPaymentRequest struct {
	TransactionID string `json:"transaction_id" binding:"required"`
	PaymentID     string `json:"payment_id" binding:"required"`
}

// CreatePayment is a legacy endpoint — all subscriptions now go through /billing/checkout-session (DodoPayments).
func (h *Handlers) CreatePayment(c *gin.Context) {
	c.JSON(http.StatusGone, gin.H{
		"error":   "This endpoint is no longer supported.",
		"message": "Use /api/v1/billing/checkout-session to start a subscription.",
	})
}

// VerifyPayment verifies a payment by transaction ID
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
