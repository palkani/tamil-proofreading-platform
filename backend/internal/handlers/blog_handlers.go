package handlers

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type blogCreateRequest struct {
	Title           string `json:"title"`
	Slug            string `json:"slug"`
	Language        string `json:"language"`
	ContentHTML     string `json:"content_html"`
	ContentText     string `json:"content_text"`
	Excerpt         string `json:"excerpt"`
	MetaDescription string `json:"meta_description"`
	Keywords        string `json:"keywords"`
	Status          string `json:"status"` // draft|published
}

type blogUpdateRequest struct {
	Title           *string `json:"title"`
	Slug            *string `json:"slug"`
	Language        *string `json:"language"`
	ContentHTML     *string `json:"content_html"`
	ContentText     *string `json:"content_text"`
	Excerpt         *string `json:"excerpt"`
	MetaDescription *string `json:"meta_description"`
	Keywords        *string `json:"keywords"`
	Status          *string `json:"status"` // draft|published
}

func getUserIDFromContext(c *gin.Context) (uint, bool) {
	v, ok := c.Get("user_id")
	if !ok {
		return 0, false
	}
	if id, ok := v.(uint); ok {
		return id, true
	}
	// sometimes it can come as float64 if set elsewhere
	if f, ok := v.(float64); ok {
		return uint(f), true
	}
	return 0, false
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugNonAlnum.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "post"
	}
	// cap for safety
	if len(s) > 200 {
		s = s[:200]
		s = strings.Trim(s, "-")
	}
	return s
}

func normalizeStatus(s string) models.BlogPostStatus {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case string(models.BlogStatusPublished):
		return models.BlogStatusPublished
	default:
		return models.BlogStatusDraft
	}
}

func (h *Handlers) BlogCreatePost(c *gin.Context) {
	userID, ok := getUserIDFromContext(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req blogCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	title := strings.TrimSpace(req.Title)
	contentText := strings.TrimSpace(req.ContentText)
	if title == "" || contentText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title and content_text are required"})
		return
	}

	lang := strings.TrimSpace(req.Language)
	if lang == "" {
		lang = "tamil"
	}

	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = slugify(title)
	} else {
		slug = slugify(slug)
	}

	status := normalizeStatus(req.Status)

	var publishedAt *time.Time
	if status == models.BlogStatusPublished {
		now := time.Now()
		publishedAt = &now
	}

	// ensure unique slug (append -2/-3 etc)
	uniqueSlug, err := h.ensureUniqueSlug(slug, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post"})
		return
	}

	post := models.BlogPost{
		UserID:          userID,
		Title:           title,
		Slug:            uniqueSlug,
		Language:        lang,
		ContentHTML:     sanitizeHTML(req.ContentHTML),
		ContentText:     contentText,
		Excerpt:         strings.TrimSpace(req.Excerpt),
		MetaDescription: strings.TrimSpace(req.MetaDescription),
		Keywords:        strings.TrimSpace(req.Keywords),
		Status:          status,
		PublishedAt:     publishedAt,
	}

	if err := h.db.Create(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "post": post})
}

func (h *Handlers) BlogUpdatePost(c *gin.Context) {
	userID, ok := getUserIDFromContext(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}
	postID := uint(id64)

	var post models.BlogPost
	if err := h.db.First(&post, postID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load post"})
		return
	}

	// ownership check (admin bypass optional if role stored; keep simple: owner only)
	if post.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	var req blogUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Title != nil {
		post.Title = strings.TrimSpace(*req.Title)
	}
	if req.Language != nil {
		v := strings.TrimSpace(*req.Language)
		if v != "" {
			post.Language = v
		}
	}
	if req.ContentText != nil {
		post.ContentText = strings.TrimSpace(*req.ContentText)
	}
	if req.ContentHTML != nil {
		post.ContentHTML = sanitizeHTML(*req.ContentHTML)
	}
	if req.Excerpt != nil {
		post.Excerpt = strings.TrimSpace(*req.Excerpt)
	}
	if req.MetaDescription != nil {
		post.MetaDescription = strings.TrimSpace(*req.MetaDescription)
	}
	if req.Keywords != nil {
		post.Keywords = strings.TrimSpace(*req.Keywords)
	}

	if req.Slug != nil {
		newSlug := slugify(*req.Slug)
		uniqueSlug, err := h.ensureUniqueSlug(newSlug, post.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update post"})
			return
		}
		post.Slug = uniqueSlug
	}

	if req.Status != nil {
		next := normalizeStatus(*req.Status)
		if next != post.Status {
			post.Status = next
			if next == models.BlogStatusPublished {
				now := time.Now()
				post.PublishedAt = &now
			} else {
				post.PublishedAt = nil
			}
		}
	}

	if post.Title == "" || post.ContentText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title and content_text are required"})
		return
	}

	if err := h.db.Save(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update post"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "post": post})
}

// Public: list published posts (paginated)
func (h *Handlers) BlogListPublished(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if page <= 0 {
		page = 1
	}
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	offset := (page - 1) * limit

	var posts []models.BlogPost
	tx := h.db.
		Where("status = ?", models.BlogStatusPublished).
		Order("published_at desc, created_at desc").
		Limit(limit).
		Offset(offset).
		Find(&posts)
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list posts"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "posts": posts, "page": page, "limit": limit})
}

// Public: view a published post by slug
func (h *Handlers) BlogGetPublishedBySlug(c *gin.Context) {
	slug := strings.TrimSpace(c.Param("slug"))
	if slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slug"})
		return
	}
	slug = slugify(slug)

	var post models.BlogPost
	tx := h.db.Where("slug = ? AND status = ?", slug, models.BlogStatusPublished).First(&post)
	if tx.Error != nil {
		if errors.Is(tx.Error, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load post"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "post": post})
}

// Protected: list current user's posts (draft + published)
func (h *Handlers) BlogListMyPosts(c *gin.Context) {
	userID, ok := getUserIDFromContext(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var posts []models.BlogPost
	tx := h.db.
		Where("user_id = ?", userID).
		Order("updated_at desc").
		Limit(limit).
		Find(&posts)
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list posts"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "posts": posts})
}

// Protected: delete a post owned by the current user (soft delete).
func (h *Handlers) BlogDeletePost(c *gin.Context) {
	userID, ok := getUserIDFromContext(c)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id64 == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}
	postID := uint(id64)

	var post models.BlogPost
	if err := h.db.First(&post, postID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load post"})
		return
	}

	if post.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	if err := h.db.Delete(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete post"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *Handlers) ensureUniqueSlug(base string, excludeID uint) (string, error) {
	base = slugify(base)
	if base == "" {
		base = "post"
	}

	// quick check base
	var count int64
	q := h.db.Model(&models.BlogPost{}).Where("slug = ?", base)
	if excludeID > 0 {
		q = q.Where("id <> ?", excludeID)
	}
	if err := q.Count(&count).Error; err != nil {
		return "", err
	}
	if count == 0 {
		return base, nil
	}

	for i := 2; i <= 50; i++ {
		trySlug := base + "-" + strconv.Itoa(i)
		var c2 int64
		q2 := h.db.Model(&models.BlogPost{}).Where("slug = ?", trySlug)
		if excludeID > 0 {
			q2 = q2.Where("id <> ?", excludeID)
		}
		if err := q2.Count(&c2).Error; err != nil {
			return "", err
		}
		if c2 == 0 {
			return trySlug, nil
		}
	}
	return "", errors.New("could_not_generate_unique_slug")
}


