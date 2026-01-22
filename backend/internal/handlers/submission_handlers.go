package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"html"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SubmitTextRequest struct {
	Text                string `json:"text"`
	HTML                string `json:"html"`
	IncludeAlternatives bool   `json:"include_alternatives"`
	SaveDraft           *bool  `json:"save_draft"`
}

var htmlTagRegex = regexp.MustCompile("<[^>]+>")
var scriptTagRegex = regexp.MustCompile(`(?is)<script.*?>.*?</script>`)
var eventAttrRegex = regexp.MustCompile(`(?i)\s+on[a-z]+\s*=\s*(".*?"|'.*?')`)
var javascriptProtoRegex = regexp.MustCompile(`(?i)javascript:`)
// Go regexp (RE2) supports \x{....} for Unicode code points (not \u....).
var tamilCharRegex = regexp.MustCompile(`[\x{0B80}-\x{0BFF}]`)

func proofreadTimeoutFor(wordCount int, textLen int) time.Duration {
	// Keep interactive submits fast, but allow long-form pastes (like transcripts) enough time.
	switch {
	case wordCount <= 250 && textLen <= 1500:
		return 25 * time.Second
	case wordCount <= 800 && textLen <= 6000:
		return 45 * time.Second
	default:
		return 75 * time.Second
	}
}

// storedSuggestion matches the JSON objects stored in Submission.Suggestions.
// Note: Some engines return start/end indexes as 0 even when a correction exists.
type storedSuggestion struct {
	Type       string `json:"type"`
	Reason     string `json:"reason"`
	Original   string `json:"original"`
	Corrected  string `json:"corrected"`
	StartIndex int    `json:"start_index"`
	EndIndex   int    `json:"end_index"`
}

func normalizeComparableText(s string) string {
	// Normalize for duplicate/no-op detection: trim, collapse whitespace, remove zero-width chars, strip quotes.
	t := strings.TrimSpace(s)
	if t == "" {
		return ""
	}
	// remove common zero-width chars
	t = strings.Map(func(r rune) rune {
		switch r {
		case '\u200B', '\u200C', '\u200D', '\uFEFF':
			return -1
		default:
			return r
		}
	}, t)
	// collapse whitespace
	t = strings.Join(strings.Fields(t), " ")
	// strip wrapping quotes (ASCII + common smart quotes)
	t = strings.Trim(t, `"'“”‘’«»‹›`)
	t = strings.TrimSpace(t)
	return t
}

type usedRange struct {
	Start int
	End   int
}

func overlapsAny(start, end int, used []usedRange) bool {
	for _, r := range used {
		if start < r.End && end > r.Start {
			return true
		}
	}
	return false
}

func findFirstUnusedOccurrence(haystack, needle string, used []usedRange) (int, int) {
	if needle == "" || haystack == "" {
		return 0, 0
	}
	// simple scan from beginning; pick first non-overlapping occurrence
	searchFrom := 0
	for {
		idx := strings.Index(haystack[searchFrom:], needle)
		if idx < 0 {
			return 0, 0
		}
		start := searchFrom + idx
		end := start + len(needle)
		if !overlapsAny(start, end, used) {
			return start, end
		}
		// continue search after this occurrence
		searchFrom = end
		if searchFrom >= len(haystack) {
			return 0, 0
		}
	}
}

func buildCorrectionsForSubmission(sub models.Submission) []gin.H {
	corrections := []gin.H{}
	raw := strings.TrimSpace(sub.Suggestions)
	if raw == "" || raw == "[]" {
		return corrections
	}

	var suggs []storedSuggestion
	if err := json.Unmarshal([]byte(raw), &suggs); err != nil {
		return corrections
	}

	used := []usedRange{}
	for _, s := range suggs {
		orig := s.Original
		corr := s.Corrected

		// Hard validation: suggestion must be grounded in the original text.
		// If the model hallucinated an "original" span that doesn't exist, drop it.
		if orig == "" || !strings.Contains(sub.OriginalText, orig) {
			continue
		}

		oNorm := normalizeComparableText(orig)
		cNorm := normalizeComparableText(corr)
		if oNorm == "" || cNorm == "" || oNorm == cNorm {
			// skip no-op / duplicate suggestions
			continue
		}

		startIdx := s.StartIndex
		endIdx := s.EndIndex
		// If model didn't provide indexes, compute a best-effort match location.
		if startIdx <= 0 || endIdx <= 0 || startIdx >= endIdx {
			startIdx, endIdx = findFirstUnusedOccurrence(sub.OriginalText, orig, used)
		}
		// If we still couldn't find the span (should be rare due to Contains check), drop it.
		if startIdx <= 0 || endIdx <= startIdx {
			continue
		}
		used = append(used, usedRange{Start: startIdx, End: endIdx})

		corrections = append(corrections, gin.H{
			"blockId":      "0",
			"originalText": orig,
			"correction":   corr,
			"reason":       s.Reason,
			"type":         s.Type,
			"start_index":  startIdx,
			"end_index":    endIdx,
		})
	}
	return corrections
}

func stripHTML(input string) string {
	if strings.TrimSpace(input) == "" {
		return ""
	}
	noTags := htmlTagRegex.ReplaceAllString(input, " ")
	collapsed := strings.Join(strings.Fields(noTags), " ")
	return html.UnescapeString(collapsed)
}

func sanitizeHTML(input string) string {
	if strings.TrimSpace(input) == "" {
		return ""
	}
	safe := scriptTagRegex.ReplaceAllString(input, "")
	safe = eventAttrRegex.ReplaceAllString(safe, "")
	safe = javascriptProtoRegex.ReplaceAllString(safe, "")
	return safe
}

// SubmitText handles text submission for proofreading
func (h *Handlers) SubmitText(c *gin.Context) {
	requestID := middleware.GetRequestID(c)
	if requestID == "" {
		requestID = strconv.FormatInt(time.Now().UnixNano(), 36)
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
	req.HTML = sanitizeHTML(strings.TrimSpace(req.HTML))

	if req.Text == "" && req.HTML != "" {
		req.Text = stripHTML(req.HTML)
	}

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

	// Fast path: if there are no Tamil characters, don't call AI.
	// This improves latency and avoids unnecessary provider calls.
	if !tamilCharRegex.MatchString(req.Text) {
		c.Header("Cache-Control", "no-store, max-age=0")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"request_id":  requestID,
			"corrections": []any{},
			"message":     "No Tamil text detected.",
		})
		return
	}

	saveDraft := true
	if req.SaveDraft != nil {
		saveDraft = *req.SaveDraft
	}

	// For inline analysis (demo/homepage), no auth required
	if !saveDraft {
		ctx, cancel := context.WithTimeout(c.Request.Context(), proofreadTimeoutFor(wordCount, len(req.Text)))
		defer cancel()
		result, err := h.llmService.ProofreadText(ctx, req.Text, wordCount, req.IncludeAlternatives, requestID, 0)
		if err != nil {
			// NEVER hard-fail inline submit due to AI/provider errors.
			// Keep a stable, success-shaped response so the UI can continue gracefully.
			c.Header("Cache-Control", "no-store, max-age=0")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
			c.JSON(http.StatusOK, gin.H{
				"success":     true,
				"request_id":  requestID,
				"corrections": []any{},
				"message":     "AI temporarily unavailable. Please try again.",
			})
			return
		}
		auditlog.Info(c, "submission.inline_completed", map[string]any{
			"request_id": requestID,
			"word_count": wordCount,
		})

		// Map to required corrections format (stable schema)
		type correction struct {
			BlockID      string `json:"blockId"`
			OriginalText string `json:"originalText"`
			Correction   string `json:"correction"`
			Reason       string `json:"reason"`
			Type         string `json:"type"`
			StartIndex   int    `json:"start_index"`
			EndIndex     int    `json:"end_index"`
		}
		corrections := []correction{}
		blockID := "0"
		used := []usedRange{}
		for _, s := range result.Suggestions {
			// best-effort indices
			startIdx := s.StartIndex
			endIdx := s.EndIndex
			if startIdx <= 0 || endIdx <= 0 || startIdx >= endIdx {
				startIdx, endIdx = findFirstUnusedOccurrence(req.Text, s.Original, used)
			}
			if startIdx > 0 && endIdx > startIdx {
				used = append(used, usedRange{Start: startIdx, End: endIdx})
			}
			corrections = append(corrections, correction{
				BlockID:      blockID,
				OriginalText: s.Original,
				Correction:   s.Corrected,
				Reason:       s.Reason,
				Type:         s.Type,
				StartIndex:   startIdx,
				EndIndex:     endIdx,
			})
		}

		c.Header("Cache-Control", "no-store, max-age=0")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")

		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"request_id":  requestID,
			"corrections": corrections,
		})
		return
	}

	// Require authentication for draft saving
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized - please login"})
		return
	}

	// Daily Gemini token usage limit.
	// Enforced only for authenticated, draft-saving submits (Workspace).
	const dailyTokenLimit = 2000

	// Admin bypass: do not enforce daily quota for the admin email(s) or admin role.
	// This allows you to demo/test freely without hitting limits.
	isAdminBypass := false
	{
		var u models.User
		if err := h.db.Select("email", "role").First(&u, userID).Error; err == nil {
			email := strings.ToLower(strings.TrimSpace(u.Email))
			if u.Role == models.RoleAdmin || email == "palkani.r@gmail.com" || email == "prooftamil@gmail.com" {
				isAdminBypass = true
			}
		}
	}
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	usedToday := 0
	remaining := dailyTokenLimit
	capOutput := 0
	reservedTokens := 0

	if !isAdminBypass {
		if err := h.db.Model(&models.Usage{}).
			Where("user_id = ? AND date >= ? AND date < ?", userID, startOfDay, endOfDay).
			Select("COALESCE(SUM(token_count), 0)").
			Scan(&usedToday).Error; err != nil {
			// Do not block the user if usage lookup fails (best-effort limit).
			log.Printf("Error checking daily usage: %v", err)
			usedToday = 0
		}
		remaining = dailyTokenLimit - usedToday
		if remaining < 0 {
			remaining = 0
		}
		if remaining == 0 {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":      "daily_limit_exceeded",
				"message":    "You are exceeded your limit for the day.",
				"limit":      dailyTokenLimit,
				"used":       usedToday,
				"remaining":  remaining,
				"request_id": requestID,
			})
			return
		}

		// Compute prompt token count (Gemini countTokens) so we can cap output tokens
		// and guarantee we never exceed the remaining daily quota.
		ctxPlan, cancelPlan := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancelPlan()
		plan, planErr := h.llmService.BuildGeminiTokenPlan(ctxPlan, req.Text, wordCount, req.IncludeAlternatives, requestID)
		// Fallback: if countTokens fails, use a conservative estimate so we still enforce a limit.
		promptTokens := 0
		maxOutputTokens := 768
		if planErr == nil && plan != nil {
			promptTokens = plan.PromptTokens
			maxOutputTokens = plan.MaxOutputTokens
		} else {
			// Conservative heuristic: Tamil tends to tokenize more densely than English.
			// This is only used when countTokens is unavailable.
			runes := len([]rune(req.Text))
			promptTokens = (runes / 2) + 300
		}

		// Minimum output budget needed for JSON corrections envelope.
		const minOutputTokens = 128
		capOutput = remaining - promptTokens
		if capOutput > maxOutputTokens {
			capOutput = maxOutputTokens
		}
		if capOutput < minOutputTokens {
			c.JSON(http.StatusTooManyRequests, gin.H{
				// Not a full-day exhaustion: the *current request* cannot fit within remaining tokens.
				"error":      "quota_insufficient_for_request",
				"message":    "This text is too large for your remaining token budget today. Please try a shorter text or come back tomorrow.",
				"limit":      dailyTokenLimit,
				"used":       usedToday,
				"remaining":  remaining,
				"required":   promptTokens + minOutputTokens,
				"prompt":     promptTokens,
				"min_output": minOutputTokens,
				"request_id": requestID,
			})
			return
		}
		reservedTokens = promptTokens + capOutput
	}

	// Determine model to use
	modelType := h.selectModel(wordCount)

	// Create submission record with pending status first
	submission := &models.Submission{
		UserID:              userID,
		OriginalText:        req.Text,
		OriginalHTML:        req.HTML,
		RequestID:           requestID,
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
		// If we can't save the draft, fall back to inline proofread so the user still gets suggestions.
		ctx, cancel := context.WithTimeout(c.Request.Context(), proofreadTimeoutFor(wordCount, len(req.Text)))
		defer cancel()
		result, perr := h.llmService.ProofreadText(ctx, req.Text, wordCount, req.IncludeAlternatives, requestID, capOutput)
		if perr != nil {
			c.JSON(http.StatusOK, gin.H{
				"success":     true,
				"request_id":  requestID,
				"corrections": []any{},
				"message":     "Draft save temporarily unavailable. Please try again.",
			})
			return
		}
		type correction struct {
			BlockID      string `json:"blockId"`
			OriginalText string `json:"originalText"`
			Correction   string `json:"correction"`
			Reason       string `json:"reason"`
			Type         string `json:"type"`
		}
		corrections := []correction{}
		for _, s := range result.Suggestions {
			corrections = append(corrections, correction{
				BlockID:      "0",
				OriginalText: s.Original,
				Correction:   s.Corrected,
				Reason:       s.Reason,
				Type:         s.Type,
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"request_id":  requestID,
			"corrections": corrections,
			"message":     "Draft save temporarily unavailable. Showing inline suggestions.",
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

	auditlog.Info(c, "submission.enqueued", map[string]any{
		"submission_id": submission.ID,
		"request_id":    requestID,
		"word_count":    wordCount,
	})

	// Reserve tokens up-front so quota enforcement is strict and consistent.
	// We'll update this to actual usageMetadata.totalTokenCount after Gemini completes.
	usage := &models.Usage{
		UserID:       userID,
		WordCount:    wordCount,
		TokenCount:   reservedTokens,
		ModelUsed:    modelType,
		SubmissionID: &submission.ID,
		Date:         time.Now(),
	}
	if err := h.db.Create(usage).Error; err != nil {
		log.Printf("Error creating usage record: %v", err)
		// Don't fail submission if usage tracking fails; quota is best-effort in this scenario.
	}

	// Start proofreading process immediately in background
	go h.processSubmission(context.Background(), submission.ID, requestID, req.Text, wordCount, modelType, req.IncludeAlternatives, capOutput, usage.ID)

	// Return success response immediately with the created submission record
	c.JSON(http.StatusAccepted, gin.H{
		"success":    true,
		"submission": submission,
		// Keep a stable response shape for clients that expect GoTamil-style fields.
		// The async pipeline will populate corrections later (via GET submission / SSE result).
		"corrections": []any{},
		"message":    "Submission received, proofreading started...",
		"request_id": requestID,
		"quota": gin.H{
			"limit":     dailyTokenLimit,
			"used":      usedToday,
			"reserved":  reservedTokens,
			"remaining": remaining,
		},
	})
}

// processSubmission processes the text submission asynchronously
func (h *Handlers) processSubmission(ctx context.Context, submissionID uint, requestID, text string, wordCount int, modelType models.ModelType, includeAlternatives bool, maxOutputTokensCap int, usageID uint) {
	log.Printf("Starting proofreading for submission ID: %d (request_id=%s)", submissionID, requestID)
	auditlog.LogStandalone(auditlog.LevelInfo, "submission.processing_started", requestID, map[string]any{
		"submission_id": submissionID,
		"word_count":    wordCount,
		"model":         modelType,
	})
	defer h.streamHub.close(submissionID)

	// Update status to processing
	if err := h.db.Model(&models.Submission{}).
		Where("id = ?", submissionID).
		Update("status", models.StatusProcessing).Error; err != nil {
		log.Printf("Error updating submission status to processing: %v", err)
		return
	}

	h.streamHub.broadcast(submissionID, submissionEvent{
		Event: "status",
		Data:  gin.H{"status": models.StatusProcessing},
	})

	// Process with LLM service (hard timeout so the job can't hang indefinitely)
	ctx2, cancel := context.WithTimeout(ctx, proofreadTimeoutFor(wordCount, len(text)))
	defer cancel()
	result, err := h.llmService.ProofreadText(ctx2, text, wordCount, includeAlternatives, requestID, maxOutputTokensCap)
	if err != nil {
		log.Printf("Error processing submission %d (request_id=%s): %v", submissionID, requestID, err)
		auditlog.LogStandalone(auditlog.LevelWarn, "submission.processing_failed", requestID, map[string]any{
			"submission_id": submissionID,
			"error":         err.Error(),
		})

		// NEVER hard-fail drafts due to AI/provider errors.
		// Mark completed with empty suggestions so clients always get a result event.
		updates := map[string]interface{}{
			"status":          models.StatusCompleted,
			"proofread_text":  text,
			"suggestions":     "[]",
			"alternatives":    "[]",
			"processing_time": 0,
			"error":           err.Error(),
		}
		if updateErr := h.db.Model(&models.Submission{}).
			Where("id = ?", submissionID).
			Updates(updates).Error; updateErr != nil {
			log.Printf("Error updating submission after AI failure: %v", updateErr)
		}

		var updated models.Submission
		if loadErr := h.db.First(&updated, submissionID).Error; loadErr != nil {
			log.Printf("Error loading submission after AI failure %d: %v", submissionID, loadErr)
		}

		h.streamHub.broadcast(submissionID, submissionEvent{
			Event: "status",
			Data:  gin.H{"status": models.StatusCompleted, "request_id": requestID},
		})
		h.streamHub.broadcast(submissionID, submissionEvent{
			Event: "result",
			Data:  gin.H{"success": true, "submission": updated, "request_id": requestID, "corrections": []any{}, "message": "AI temporarily unavailable. Please try again."},
		})
		h.streamHub.broadcast(submissionID, submissionEvent{
			Event: "end",
			Data:  gin.H{"status": models.StatusCompleted, "request_id": requestID},
		})
		return
	}

	// Best-effort: update reserved usage with actual Gemini token usage if available.
	if usageID != 0 && result != nil && result.TotalTokens > 0 {
		if err := h.db.Model(&models.Usage{}).
			Where("id = ?", usageID).
			Updates(map[string]any{
				"token_count": result.TotalTokens,
			}).Error; err != nil {
			log.Printf("Error updating usage token_count: %v", err)
		}
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

	var updated models.Submission
	if err := h.db.First(&updated, submissionID).Error; err != nil {
		log.Printf("Error loading updated submission %d: %v", submissionID, err)
	} else {
		// Broadcast a normalized corrections[] so SSE clients don't have to parse stringified suggestions.
		corrections := buildCorrectionsForSubmission(updated)
		h.streamHub.broadcast(submissionID, submissionEvent{
			Event: "status",
			Data:  gin.H{"status": models.StatusCompleted, "request_id": requestID},
		})
		h.streamHub.broadcast(submissionID, submissionEvent{
			Event: "result",
			Data:  gin.H{"success": true, "submission": updated, "request_id": requestID, "corrections": corrections},
		})
	}

	h.streamHub.broadcast(submissionID, submissionEvent{
		Event: "end",
		Data:  gin.H{"status": models.StatusCompleted, "request_id": requestID},
	})

	log.Printf("Successfully completed proofreading for submission ID: %d (request_id=%s)", submissionID, requestID)
	auditlog.LogStandalone(auditlog.LevelInfo, "submission.processing_completed", requestID, map[string]any{
		"submission_id": submissionID,
	})
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
		Where("archived = ?", false).
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

	// Provide a stable "corrections" array for frontend clients (GoTamil-style),
	// while keeping the raw submission object for backward compatibility.
	corrections := []gin.H{}
	if submission.Status == models.StatusCompleted {
		corrections = buildCorrectionsForSubmission(submission)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"request_id": submission.RequestID,
		"submission": submission,
		"corrections": corrections,
	})
}

// ArchiveSubmission marks a submission as archived for 45 days before deletion
func (h *Handlers) ArchiveSubmission(c *gin.Context) {
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
	if err := h.db.Where("id = ? AND user_id = ?", submissionID, userID).First(&submission).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to locate submission"})
		return
	}

	if submission.Archived {
		c.JSON(http.StatusOK, gin.H{
			"status":      "already_archived",
			"archived_at": submission.ArchivedAt,
		})
		return
	}

	now := time.Now()
	if err := h.db.Model(&models.Submission{}).
		Where("id = ?", submission.ID).
		Updates(map[string]interface{}{
			"archived":    true,
			"archived_at": now,
		}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to archive submission"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":       "archived",
		"archived_at":  now,
		"retention_in": 45,
	})
}

// GetArchivedSubmissions returns archived submissions still within retention window
func (h *Handlers) GetArchivedSubmissions(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	if err := h.cleanupArchivedSubmissions(); err != nil {
		log.Printf("archive cleanup error: %v", err)
	}

	var submissions []models.Submission
	if err := h.db.Where("user_id = ? AND archived = ?", userID, true).
		Order("archived_at DESC").
		Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch archived drafts",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"submissions":    submissions,
		"retention_days": 45,
		"message":        "Drafts stay here for 45 days before permanent deletion.",
	})
}

// StreamSubmission streams submission updates using Server-Sent Events
func (h *Handlers) StreamSubmission(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	submissionIDStr := c.Param("id")
	submissionIDUint64, err := strconv.ParseUint(submissionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid submission ID"})
		return
	}
	submissionID := uint(submissionIDUint64)

	var submission models.Submission
	if err := h.db.Where("id = ? AND user_id = ?", submissionID, userID).First(&submission).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch submission"})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming unsupported"})
		return
	}

	listener, unsubscribe := h.streamHub.register(submissionID)
	defer unsubscribe()

	// Send initial snapshot
	payload := gin.H{"status": submission.Status, "request_id": submission.RequestID}
	c.SSEvent("status", payload)
	if submission.Status == models.StatusCompleted {
		// Also include a normalized "corrections" array for clients, with best-effort indices.
		corrections := buildCorrectionsForSubmission(submission)

		c.SSEvent("result", gin.H{
			"success":     true,
			"submission":  submission,
			"request_id":  submission.RequestID,
			"corrections": corrections,
		})
		c.SSEvent("end", gin.H{"status": submission.Status, "request_id": submission.RequestID})
		flusher.Flush()
		return
	}

	if submission.Status == models.StatusFailed {
		// Never fail the client stream; send an empty result so UI can continue.
		c.SSEvent("result", gin.H{
			"success":     true,
			"submission":  submission,
			"request_id":  submission.RequestID,
			"corrections": []any{},
			"message":     "AI temporarily unavailable. Please try again.",
		})
		c.SSEvent("end", gin.H{"status": submission.Status, "request_id": submission.RequestID})
		flusher.Flush()
		return
	}

	flusher.Flush()

	c.Stream(func(w io.Writer) bool {
		select {
		case <-c.Request.Context().Done():
			return false
		case event, ok := <-listener:
			if !ok {
				return false
			}
			c.SSEvent(event.Event, event.Data)
			flusher.Flush()
			return true
		case <-time.After(25 * time.Second):
			c.SSEvent("ping", gin.H{"time": time.Now().Unix(), "request_id": submission.RequestID})
			flusher.Flush()
			return true
		}
	})
}
