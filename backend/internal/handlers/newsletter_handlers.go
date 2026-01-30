package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

// Email validation regex
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

type newsletterSubscribeRequest struct {
	Email             string `json:"email" binding:"required"`
	Name              string `json:"name"`
	Source            string `json:"source"`
	PreferredLanguage string `json:"preferred_language"`
}

type newsletterUnsubscribeRequest struct {
	Email string `json:"email"`
	Token string `json:"token"`
}

// generateToken creates a secure random token
func generateToken() string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return ""
	}
	return hex.EncodeToString(bytes)
}

// SubscribeNewsletter handles new newsletter subscriptions
func (h *Handlers) SubscribeNewsletter(c *gin.Context) {
	var req newsletterSubscribeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	name := strings.TrimSpace(req.Name)

	// Validate email format
	if !emailRegex.MatchString(email) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email format"})
		return
	}

	// Check if already subscribed
	var existing models.NewsletterSubscriber
	if err := h.db.Where("email = ?", email).First(&existing).Error; err == nil {
		// Already exists
		if existing.Status == models.SubscriptionConfirmed {
			c.JSON(http.StatusOK, gin.H{
				"status":  "already_subscribed",
				"message": "You are already subscribed to our newsletter!",
			})
			return
		}
		if existing.Status == models.SubscriptionPending {
			// Resend confirmation (could implement here)
			c.JSON(http.StatusOK, gin.H{
				"status":  "pending",
				"message": "A confirmation email was already sent. Please check your inbox.",
			})
			return
		}
		if existing.Status == models.SubscriptionUnsubscribed {
			// Re-subscribe
			existing.Status = models.SubscriptionPending
			existing.ConfirmationToken = generateToken()
			existing.UnsubscribedAt = nil
			existing.SubscribedAt = time.Now()
			if name != "" {
				existing.Name = name
			}
			if err := h.db.Save(&existing).Error; err != nil {
				log.Printf("[NEWSLETTER] Failed to re-subscribe %s: %v", email, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe"})
				return
			}
			// TODO: Send confirmation email
			c.JSON(http.StatusOK, gin.H{
				"status":  "resubscribed",
				"message": "Welcome back! Please check your email to confirm your subscription.",
			})
			return
		}
	}

	// Determine source
	source := models.SourceFooter
	switch strings.ToLower(req.Source) {
	case "popup":
		source = models.SourcePopup
	case "homepage":
		source = models.SourceHomepage
	case "blog":
		source = models.SourceBlog
	}

	// Determine language preference
	preferredLang := "ta" // Default to Tamil
	if req.PreferredLanguage == "en" || req.PreferredLanguage == "english" {
		preferredLang = "en"
	}

	// Create new subscriber
	subscriber := &models.NewsletterSubscriber{
		Email:             email,
		Name:              name,
		Status:            models.SubscriptionPending,
		Source:            source,
		ConfirmationToken: generateToken(),
		UnsubscribeToken:  generateToken(),
		PreferredLanguage: preferredLang,
		SubscribedAt:      time.Now(),
		IPAddress:         c.ClientIP(),
		UserAgent:         c.GetHeader("User-Agent"),
	}

	if err := h.db.Create(subscriber).Error; err != nil {
		log.Printf("[NEWSLETTER] Failed to create subscriber %s: %v", email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe"})
		return
	}

	// TODO: Send confirmation email using h.emailService
	// For now, auto-confirm (can be changed to require email confirmation)
	// In production, you would send an email with a confirmation link

	// Auto-confirm for now (remove this in production with proper email verification)
	now := time.Now()
	subscriber.Status = models.SubscriptionConfirmed
	subscriber.ConfirmedAt = &now
	h.db.Save(subscriber)

	log.Printf("[NEWSLETTER] New subscriber: %s (source: %s)", email, source)

	c.JSON(http.StatusCreated, gin.H{
		"status":  "subscribed",
		"message": "Thank you for subscribing! You'll receive our Tamil newsletter soon.",
	})
}

// ConfirmSubscription confirms a newsletter subscription via token
func (h *Handlers) ConfirmSubscription(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token is required"})
		return
	}

	var subscriber models.NewsletterSubscriber
	if err := h.db.Where("confirmation_token = ?", token).First(&subscriber).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invalid or expired confirmation link"})
		return
	}

	if subscriber.Status == models.SubscriptionConfirmed {
		c.JSON(http.StatusOK, gin.H{
			"status":  "already_confirmed",
			"message": "Your subscription is already confirmed!",
		})
		return
	}

	now := time.Now()
	subscriber.Status = models.SubscriptionConfirmed
	subscriber.ConfirmedAt = &now
	subscriber.ConfirmationToken = "" // Clear token after use

	if err := h.db.Save(&subscriber).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to confirm subscription"})
		return
	}

	log.Printf("[NEWSLETTER] Subscription confirmed: %s", subscriber.Email)

	c.JSON(http.StatusOK, gin.H{
		"status":  "confirmed",
		"message": "Your subscription has been confirmed! Welcome to our Tamil newsletter.",
	})
}

// UnsubscribeNewsletter handles unsubscribe requests
func (h *Handlers) UnsubscribeNewsletter(c *gin.Context) {
	// Can unsubscribe via token (from email link) or email (from form)
	token := c.Query("token")
	email := c.Query("email")

	if token == "" && email == "" {
		// Try to get from body
		var req newsletterUnsubscribeRequest
		if err := c.ShouldBindJSON(&req); err == nil {
			token = req.Token
			email = strings.ToLower(strings.TrimSpace(req.Email))
		}
	}

	var subscriber models.NewsletterSubscriber
	var err error

	if token != "" {
		err = h.db.Where("unsubscribe_token = ?", token).First(&subscriber).Error
	} else if email != "" {
		err = h.db.Where("email = ?", email).First(&subscriber).Error
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email or token is required"})
		return
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Subscriber not found"})
		return
	}

	if subscriber.Status == models.SubscriptionUnsubscribed {
		c.JSON(http.StatusOK, gin.H{
			"status":  "already_unsubscribed",
			"message": "You are already unsubscribed.",
		})
		return
	}

	now := time.Now()
	subscriber.Status = models.SubscriptionUnsubscribed
	subscriber.UnsubscribedAt = &now

	if err := h.db.Save(&subscriber).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsubscribe"})
		return
	}

	log.Printf("[NEWSLETTER] Unsubscribed: %s", subscriber.Email)

	c.JSON(http.StatusOK, gin.H{
		"status":  "unsubscribed",
		"message": "You have been unsubscribed from our newsletter.",
	})
}

// AdminListSubscribers returns all newsletter subscribers (admin only)
func (h *Handlers) AdminListSubscribers(c *gin.Context) {
	status := c.Query("status") // filter by status: pending, confirmed, unsubscribed

	query := h.db.Model(&models.NewsletterSubscriber{}).Order("created_at DESC")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	var subscribers []models.NewsletterSubscriber
	if err := query.Find(&subscribers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load subscribers"})
		return
	}

	// Count by status
	var totalConfirmed, totalPending, totalUnsubscribed int64
	h.db.Model(&models.NewsletterSubscriber{}).Where("status = ?", models.SubscriptionConfirmed).Count(&totalConfirmed)
	h.db.Model(&models.NewsletterSubscriber{}).Where("status = ?", models.SubscriptionPending).Count(&totalPending)
	h.db.Model(&models.NewsletterSubscriber{}).Where("status = ?", models.SubscriptionUnsubscribed).Count(&totalUnsubscribed)

	c.JSON(http.StatusOK, gin.H{
		"subscribers": subscribers,
		"stats": gin.H{
			"total_confirmed":    totalConfirmed,
			"total_pending":      totalPending,
			"total_unsubscribed": totalUnsubscribed,
			"total":              totalConfirmed + totalPending + totalUnsubscribed,
		},
	})
}

// GetSubscriberCount returns the count of active subscribers (public)
func (h *Handlers) GetSubscriberCount(c *gin.Context) {
	var count int64
	h.db.Model(&models.NewsletterSubscriber{}).Where("status = ?", models.SubscriptionConfirmed).Count(&count)

	c.JSON(http.StatusOK, gin.H{
		"count": count,
	})
}
