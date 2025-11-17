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
        // Get user ID from context
        userID, err := middleware.GetUserFromContext(c)
        if err != nil {
                c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized - please login"})
                return
        }

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

        saveDraft := true
        if req.SaveDraft != nil {
                saveDraft = *req.SaveDraft
        }

        if !saveDraft {
                result, err := h.llmService.ProofreadText(c.Request.Context(), req.Text, wordCount, req.IncludeAlternatives, requestID)
                if err != nil {
                        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "request_id": requestID})
                        return
                }
                auditlog.Info(c, "submission.inline_completed", map[string]any{
                        "request_id": requestID,
                        "word_count": wordCount,
                })
                c.JSON(http.StatusOK, gin.H{
                        "request_id": requestID,
                        "result":     result,
                        "message":    "Proofreading completed",
                })
                return
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

        auditlog.Info(c, "submission.enqueued", map[string]any{
                "submission_id": submission.ID,
                "request_id":    requestID,
                "word_count":    wordCount,
        })

        // Start proofreading process immediately in background
        go h.processSubmission(context.Background(), submission.ID, requestID, req.Text, wordCount, modelType, req.IncludeAlternatives)

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
                "request_id": requestID,
        })
}

// processSubmission processes the text submission asynchronously
func (h *Handlers) processSubmission(ctx context.Context, submissionID uint, requestID, text string, wordCount int, modelType models.ModelType, includeAlternatives bool) {
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

        // Process with LLM service
        result, err := h.llmService.ProofreadText(ctx, text, wordCount, includeAlternatives, requestID)
        if err != nil {
                log.Printf("Error processing submission %d (request_id=%s): %v", submissionID, requestID, err)
                auditlog.LogStandalone(auditlog.LevelWarn, "submission.processing_failed", requestID, map[string]any{
                        "submission_id": submissionID,
                        "error":         err.Error(),
                })

                // Update submission with error
                if updateErr := h.db.Model(&models.Submission{}).
                        Where("id = ?", submissionID).
                        Updates(map[string]interface{}{
                                "status": models.StatusFailed,
                                "error":  err.Error(),
                        }).Error; updateErr != nil {
                        log.Printf("Error updating submission with error status: %v", updateErr)
                }

                h.streamHub.broadcast(submissionID, submissionEvent{
                        Event: "status",
                        Data:  gin.H{"status": models.StatusFailed, "request_id": requestID},
                })
                h.streamHub.broadcast(submissionID, submissionEvent{
                        Event: "failure",
                        Data:  gin.H{"message": err.Error(), "request_id": requestID},
                })
                h.streamHub.broadcast(submissionID, submissionEvent{
                        Event: "end",
                        Data:  gin.H{"status": models.StatusFailed, "request_id": requestID},
                })
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

        var updated models.Submission
        if err := h.db.First(&updated, submissionID).Error; err != nil {
                log.Printf("Error loading updated submission %d: %v", submissionID, err)
        } else {
                h.streamHub.broadcast(submissionID, submissionEvent{
                        Event: "status",
                        Data:  gin.H{"status": models.StatusCompleted, "request_id": requestID},
                })
                h.streamHub.broadcast(submissionID, submissionEvent{
                        Event: "result",
                        Data:  gin.H{"submission": updated, "request_id": requestID},
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

        c.JSON(http.StatusOK, gin.H{"submission": submission})
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
                c.SSEvent("result", gin.H{"submission": submission, "request_id": submission.RequestID})
                c.SSEvent("end", gin.H{"status": submission.Status, "request_id": submission.RequestID})
                flusher.Flush()
                return
        }

        if submission.Status == models.StatusFailed {
                c.SSEvent("failure", gin.H{"message": submission.Error, "request_id": submission.RequestID})
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
