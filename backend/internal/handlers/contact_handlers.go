package handlers

import (
	"net/http"
	"strings"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
)

type contactMessageRequest struct {
	Name    string `json:"name" binding:"required"`
	Email   string `json:"email" binding:"required"`
	Message string `json:"message" binding:"required"`
}

func (h *Handlers) SubmitContactMessage(c *gin.Context) {
	var req contactMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	message := strings.TrimSpace(req.Message)

	if name == "" || email == "" || message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name, email, and message are required"})
		return
	}

	if len(message) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is too long"})
		return
	}

	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	contact := &models.ContactMessage{
		UserID:  userID,
		Name:    name,
		Email:   email,
		Message: message,
	}

	if err := h.db.Create(contact).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save message"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"status": "received"})
}

func (h *Handlers) AdminListContactMessages(c *gin.Context) {
	var messages []models.ContactMessage
	if err := h.db.Order("created_at DESC").Preload("User").Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load messages"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}
