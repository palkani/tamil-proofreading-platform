package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SubmitTextRequest struct {
	Text                string `json:"text" binding:"required"`
	IncludeAlternatives bool   `json:"include_alternatives"`
}

// SubmitText handles text submission for proofreading
func (h *Handlers) SubmitText(c *gin.Context) {
	// Get user ID from context
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized - please login"})
		return
	}

	// Validate request
	var req SubmitTextRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	// Sanitize and validate input
	req.Text = strings.TrimSpace(req.Text)
	if req.Text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Text cannot be empty"})
		return
	}

	if len(req.Text) > 100000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Text is too long (max 100KB)"})
		return
	}

	// Count words
	wordCount := h.nlpService.CountWords(req.Text)
	if wordCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid words found in text"})
		return
	}

	// Determine model to use
	modelType := h.selectModel(wordCount)

	// Create submission record with pending status first
	submission := &models.Submission{
		UserID:              userID,
		OriginalText:        req.Text,
		WordCount:           wordCount,
		ModelUsed:           modelType,
		Status:              models.StatusPending,
		Cost:                0,
		Suggestions:         "[]",
		Alternatives:        "[]",
		IncludeAlternatives: req.IncludeAlternatives,
	}

	// Save submission to database
	if err := h.db.Create(submission).Error; err != nil {
		log.Printf("Error creating submission: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to create submission",
			"details": err.Error(),
		})
		return
	}

	// Verify submission was created
	if submission.ID == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create submission - no ID returned",
		})
		return
	}

	// Start proofreading process immediately in background
	go h.processSubmission(context.Background(), submission.ID, req.Text, wordCount, modelType, req.IncludeAlternatives)

	// Record usage asynchronously (non-blocking)
	go func() {
		usage := &models.Usage{
			UserID:       userID,
			WordCount:    wordCount,
			ModelUsed:    modelType,
			SubmissionID: &submission.ID,
			Date:         time.Now(),
		}
		if err := h.db.Create(usage).Error; err != nil {
			log.Printf("Error creating usage record: %v", err)
			// Don't fail submission if usage tracking fails
		}
	}()

	// Return success response immediately with the created submission record
	c.JSON(http.StatusAccepted, gin.H{
		"submission": submission,
		"message":    "Submission received, proofreading started...",
	})
}

// processSubmission processes the text submission asynchronously
func (h *Handlers) processSubmission(ctx context.Context, submissionID uint, text string, wordCount int, modelType models.ModelType, includeAlternatives bool) {
	log.Printf("Starting proofreading for submission ID: %d", submissionID)

	// Update status to processing
	if err := h.db.Model(&models.Submission{}).
		Where("id = ?", submissionID).
		Update("status", models.StatusProcessing).Error; err != nil {
		log.Printf("Error updating submission status to processing: %v", err)
		return
	}

	// Process with LLM service
	result, err := h.llmService.ProofreadText(ctx, text, wordCount, includeAlternatives)
	if err != nil {
		log.Printf("Error processing submission %d: %v", submissionID, err)

		// Update submission with error
		if updateErr := h.db.Model(&models.Submission{}).
			Where("id = ?", submissionID).
			Updates(map[string]interface{}{
				"status": models.StatusFailed,
				"error":  err.Error(),
			}).Error; updateErr != nil {
			log.Printf("Error updating submission with error status: %v", updateErr)
		}
		return
	}

	// Serialize suggestions to JSON
	suggestionsJSON := "[]"
	if len(result.Suggestions) > 0 {
		if suggestionsBytes, marshalErr := json.Marshal(result.Suggestions); marshalErr != nil {
			log.Printf("Error marshaling suggestions: %v", marshalErr)
		} else {
			suggestionsJSON = string(suggestionsBytes)
		}
	}

	alternativesJSON := "[]"
	if len(result.Alternatives) > 0 {
		if alternativesBytes, marshalErr := json.Marshal(result.Alternatives); marshalErr != nil {
			log.Printf("Error marshaling alternatives: %v", marshalErr)
		} else {
			alternativesJSON = string(alternativesBytes)
		}
	}

	// Update submission with results
	updates := map[string]interface{}{
		"status":          models.StatusCompleted,
		"proofread_text":  result.CorrectedText,
		"suggestions":     suggestionsJSON,
		"alternatives":    alternativesJSON,
		"processing_time": result.ProcessingTime,
	}

	if err := h.db.Model(&models.Submission{}).
		Where("id = ?", submissionID).
		Updates(updates).Error; err != nil {
		log.Printf("Error updating submission with results: %v", err)
		return
	}

	log.Printf("Successfully completed proofreading for submission ID: %d", submissionID)
}

// selectModel determines which model to use based on word count
func (h *Handlers) selectModel(wordCount int) models.ModelType {
	if wordCount < 500 {
		return models.ModelA
	}
	return models.ModelB
}

// checkSubscriptionLimits checks if user's subscription allows the submission
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
	limitStr := c.DefaultQuery("limit", "10")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 10
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil {
		offset = 0
	}

	if err := h.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch submissions",
			"details": err.Error(),
		})
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

	submissionIDStr := c.Param("id")
	submissionID, err := strconv.ParseUint(submissionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid submission ID"})
		return
	}

	var submission models.Submission
	if err := h.db.Where("id = ? AND user_id = ?", submissionID, userID).
		First(&submission).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch submission",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"submission": submission})
}
