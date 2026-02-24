package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CreateAIContentDraftRequest is the body for POST /api/v1/ai-content-drafts
type CreateAIContentDraftRequest struct {
	Title            string `json:"title"`
	Content          string `json:"content" binding:"required"`
	Prompt           string `json:"prompt"`
	ContentType      string `json:"content_type"`
	Language         string `json:"language"`
	Tone             string `json:"tone"`
	MetaDescription  string `json:"meta_description"`
	Keywords         string `json:"keywords"`
}

// CreateAIContentDraft saves AI Content Writer output to the dedicated ai_content_drafts table.
func (h *Handlers) CreateAIContentDraft(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req CreateAIContentDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content is required"})
		return
	}

	content := strings.TrimSpace(req.Content)
	if content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "content cannot be empty"})
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Untitled"
	}
	if len(title) > 255 {
		title = title[:255]
	}

	wordCount := h.nlpService.CountWords(content)
	if wordCount <= 0 {
		wordCount = 1
	}

	draft := &models.AIContentDraft{
		UserID:          userID,
		Title:           title,
		Content:         content,
		Prompt:          strings.TrimSpace(req.Prompt),
		ContentType:     strings.TrimSpace(req.ContentType),
		Language:        strings.TrimSpace(req.Language),
		Tone:            strings.TrimSpace(req.Tone),
		MetaDescription: strings.TrimSpace(req.MetaDescription),
		Keywords:        strings.TrimSpace(req.Keywords),
		WordCount:       wordCount,
	}

	if err := h.db.Create(draft).Error; err != nil {
		log.Printf("[AI_CONTENT_DRAFT] Create failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save draft"})
		return
	}

	log.Printf("[AI_CONTENT_DRAFT] Created id=%d user_id=%d title=%q", draft.ID, userID, title)
	c.JSON(http.StatusCreated, gin.H{"success": true, "draft": draft})
}

// GetAIContentDrafts returns the current user's AI Content Writer drafts.
func (h *Handlers) GetAIContentDrafts(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	var drafts []models.AIContentDraft
	if err := h.db.Where("user_id = ?", userID).Order("updated_at DESC").Limit(limit).Offset(offset).Find(&drafts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch drafts"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"drafts": drafts})
}

// GetAIContentDraft returns a single AI content draft by ID.
func (h *Handlers) GetAIContentDraft(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid draft ID"})
		return
	}

	var draft models.AIContentDraft
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&draft).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Draft not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch draft"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "draft": draft})
}

// UpdateAIContentDraftRequest is the body for PATCH /api/v1/ai-content-drafts/:id
type UpdateAIContentDraftRequest struct {
	Title            *string `json:"title"`
	Content          *string `json:"content"`
	MetaDescription  *string `json:"meta_description"`
	Keywords         *string `json:"keywords"`
}

// UpdateAIContentDraft updates an AI content draft.
func (h *Handlers) UpdateAIContentDraft(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid draft ID"})
		return
	}

	var draft models.AIContentDraft
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&draft).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Draft not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch draft"})
		return
	}

	var req UpdateAIContentDraftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			t = "Untitled"
		}
		if len(t) > 255 {
			t = t[:255]
		}
		updates["title"] = t
	}
	if req.Content != nil {
		content := strings.TrimSpace(*req.Content)
		updates["content"] = content
		updates["word_count"] = h.nlpService.CountWords(content)
		if updates["word_count"].(int) <= 0 {
			updates["word_count"] = 1
		}
	}
	if req.MetaDescription != nil {
		updates["meta_description"] = strings.TrimSpace(*req.MetaDescription)
	}
	if req.Keywords != nil {
		updates["keywords"] = strings.TrimSpace(*req.Keywords)
	}

	if len(updates) > 0 {
		if err := h.db.Model(&draft).Updates(updates).Error; err != nil {
			log.Printf("[AI_CONTENT_DRAFT] Update failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update draft"})
			return
		}
	}

	// Reload to return updated fields
	h.db.Where("id = ?", draft.ID).First(&draft)
	c.JSON(http.StatusOK, gin.H{"success": true, "draft": draft})
}

// DeleteAIContentDraft soft-deletes an AI content draft.
func (h *Handlers) DeleteAIContentDraft(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid draft ID"})
		return
	}

	result := h.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AIContentDraft{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete draft"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Draft not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
