package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SubmitTextRequest struct {
	Text string `json:"text" binding:"required"`
}

// SubmitText handles text submission for proofreading
func (h *Handlers) SubmitText(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req SubmitTextRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Sanitize input
	req.Text = strings.TrimSpace(req.Text)
	if len(req.Text) > 100000 { // Limit text size to 100KB
		c.JSON(http.StatusBadRequest, gin.H{"error": "Text is too long (max 100KB)"})
		return
	}

	// Validate Tamil text (allow mixed content)
	// if !h.nlpService.IsTamilText(req.Text) {
	// 	c.JSON(http.StatusBadRequest, gin.H{"error": "Text must contain Tamil characters"})
	// 	return
	// }

	// Count words
	wordCount := h.nlpService.CountWords(req.Text)
	if wordCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid words found in text"})
		return
	}

	// Determine model to use
	modelType := h.selectModel(wordCount)

	// Check if user has sufficient subscription or needs to pay
	hasActiveSubscription, subscriptionPlan, err := h.paymentService.CheckSubscriptionStatus(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check subscription"})
		return
	}

	// Calculate cost
	cost := h.paymentService.CalculateCost(wordCount, modelType)

	// Check subscription limits
	if !hasActiveSubscription || !h.checkSubscriptionLimits(subscriptionPlan, wordCount, modelType) {
		// User needs to pay
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error":        "Payment required",
			"cost":         cost,
			"word_count":   wordCount,
			"model_type":   modelType,
			"payment_required": true,
		})
		return
	}

	// Create submission record
	submission := &models.Submission{
		UserID:       userID,
		OriginalText: req.Text,
		WordCount:    wordCount,
		ModelUsed:    modelType,
		Status:       models.StatusProcessing,
		Cost:         cost,
	}

	if err := h.db.Create(submission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create submission"})
		return
	}

	// Process text asynchronously (in production, use a job queue)
	go h.processSubmission(c.Request.Context(), submission.ID, req.Text, wordCount, modelType)

	// Record usage
	usage := &models.Usage{
		UserID:       userID,
		WordCount:    wordCount,
		ModelUsed:    modelType,
		SubmissionID: &submission.ID,
		Date:         time.Now(),
	}
	h.db.Create(usage)

	c.JSON(http.StatusAccepted, gin.H{
		"submission_id": submission.ID,
		"status":        submission.Status,
		"word_count":    wordCount,
		"model_type":    modelType,
		"message":       "Submission received, processing...",
	})
}

func (h *Handlers) processSubmission(ctx context.Context, submissionID uint, text string, wordCount int, modelType models.ModelType) {
	// Update submission status
	h.db.Model(&models.Submission{}).Where("id = ?", submissionID).Update("status", models.StatusProcessing)

	// Process with LLM
	result, err := h.llmService.ProofreadText(ctx, text, wordCount)
	if err != nil {
		h.db.Model(&models.Submission{}).Where("id = ?", submissionID).Updates(map[string]interface{}{
			"status": models.StatusFailed,
			"error":  err.Error(),
		})
		return
	}

	// Serialize suggestions
	suggestionsJSON, _ := json.Marshal(result.Suggestions)

	// Update submission with results
	h.db.Model(&models.Submission{}).Where("id = ?", submissionID).Updates(map[string]interface{}{
		"status":          models.StatusCompleted,
		"proofread_text":  result.CorrectedText,
		"suggestions":     string(suggestionsJSON),
		"processing_time": result.ProcessingTime,
	})
}

func (h *Handlers) selectModel(wordCount int) models.ModelType {
	if wordCount < 500 {
		return models.ModelA
	}
	return models.ModelB
}

func (h *Handlers) checkSubscriptionLimits(plan *models.SubscriptionPlan, wordCount int, modelType models.ModelType) bool {
	// Get user's current usage for the month
	var user models.User
	h.db.First(&user, "subscription = ?", *plan)

	// Check monthly limits based on plan
	var monthlyLimit int
	switch *plan {
	case models.PlanBasic:
		monthlyLimit = 10000
		if modelType == models.ModelB {
			return false // Basic plan only allows Model A
		}
	case models.PlanPro:
		monthlyLimit = 50000
	case models.PlanEnterprise:
		return true // Unlimited
	default:
		return false // Free plan requires payment
	}

	// Check current month usage
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var totalUsage int
	h.db.Model(&models.Usage{}).
		Where("user_id = ? AND date >= ?", user.ID, startOfMonth).
		Select("COALESCE(SUM(word_count), 0)").
		Scan(&totalUsage)

	return (totalUsage + wordCount) <= monthlyLimit
}

// GetSubmissions retrieves user's submissions
func (h *Handlers) GetSubmissions(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var submissions []models.Submission
	limit := c.DefaultQuery("limit", "10")
	offset := c.DefaultQuery("offset", "0")

	if err := h.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch submissions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"submissions": submissions})
}

// GetSubmission retrieves a single submission
func (h *Handlers) GetSubmission(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	submissionID := c.Param("id")
	var submission models.Submission

	if err := h.db.Where("id = ? AND user_id = ?", submissionID, userID).First(&submission).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch submission"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"submission": submission})
}

