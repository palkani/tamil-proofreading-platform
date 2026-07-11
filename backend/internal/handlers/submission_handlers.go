package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"hash/fnv"
	"html"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/observability"
	"tamil-proofreading-platform/backend/internal/util/auditlog"
	"tamil-proofreading-platform/backend/internal/util/geo"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// optionalUserID returns a *uint of the authenticated user or nil when
// the request came in anonymously (homepage demo path). Used by the
// AI observability logger so the ai_requests row's user_id is nullable
// and correctly distinguishes "no user" from "user 0".
func optionalUserID(c *gin.Context) *uint {
	uid, err := middleware.GetUserFromContext(c)
	if err != nil || uid == 0 {
		return nil
	}
	return &uid
}

// ptrIfNonZero returns &v when v != 0, else nil. Used to pack a
// discovered user_id or submission_id into an optional pointer for
// AI-request logging so a zero value doesn't get mistaken for a
// legitimate ID.
func ptrIfNonZero(v uint) *uint {
	if v == 0 {
		return nil
	}
	return &v
}

// classifyAIError maps a raw LLM-service error to one of the AIRequest
// status constants so admin dashboards can filter by failure class
// (timeout vs rate-limit vs generic API error). String-matching on the
// error message is brittle, but the llm package doesn't yet expose a
// typed error hierarchy — good candidate for a follow-up refactor when
// we add a second provider (OpenAI, Anthropic) and need the taxonomy.
func classifyAIError(err error) string {
	if err == nil {
		return models.AIStatusOK
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "context canceled") || strings.Contains(msg, "context deadline exceeded") || strings.Contains(msg, "timeout"):
		return models.AIStatusTimeout
	case strings.Contains(msg, "429") || strings.Contains(msg, "rate limit") || strings.Contains(msg, "quota"):
		return models.AIStatusRateLimited
	case strings.Contains(msg, "invalid") && strings.Contains(msg, "response"):
		return models.AIStatusInvalidResponse
	default:
		return models.AIStatusAPIError
	}
}

// truncateIPv4 keeps only the first 3 octets of an IPv4 address so the row
// doesn't identify the visitor uniquely. "1.2.3.4" → "1.2.3". Leaves
// IPv6 addresses (with colons) unchanged since they're already hard to
// deanonymise via the first N octets alone; the presence of an IPv6
// address is signal enough.
func truncateIPv4(ip string) string {
	if strings.ContainsRune(ip, ':') {
		return ip
	}
	parts := strings.SplitN(ip, ".", 4)
	if len(parts) < 4 {
		return ip
	}
	return strings.Join(parts[:3], ".")
}

// hashUserAgent returns the first 16 hex chars of a SHA-256 of the UA.
// Enough to cluster distinct browsers over time without persisting the
// full string.
func hashUserAgent(ua string) string {
	if ua == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(ua))
	return hex.EncodeToString(sum[:8])
}

// recordAnonymousSubmission writes an AnonymousSubmissionEvent for a
// completed inline demo submission. Non-fatal — failures log a warning
// and never surface to the caller, so an analytics write never delays
// or breaks the demo response.
func (h *Handlers) recordAnonymousSubmission(c *gin.Context, requestID string, textLength, wordCount, correctionCount int, cacheHit bool) {
	event := &models.AnonymousSubmissionEvent{
		RequestID:       requestID,
		TextLength:      textLength,
		WordCount:       wordCount,
		CorrectionCount: correctionCount,
		CacheHit:        cacheHit,
		CountryCode:     geo.CountryFromContext(c),
		TruncatedIP:     truncateIPv4(c.ClientIP()),
		UserAgentHash:   hashUserAgent(c.GetHeader("User-Agent")),
		Referrer:        c.GetHeader("Referer"),
		OccurredAt:      time.Now(),
	}
	if err := h.db.Create(event).Error; err != nil {
		log.Printf("[ANALYTICS] Failed to record anonymous submission (request_id=%s): %v", requestID, err)
	}
}

type SubmitTextRequest struct {
	Text                string `json:"text"`
	HTML                string `json:"html"`
	IncludeAlternatives bool   `json:"include_alternatives"`
	SaveDraft           *bool  `json:"save_draft"`
	SubmissionID        *uint  `json:"submission_id,omitempty"`
}

var htmlTagRegex = regexp.MustCompile("<[^>]+>")
var scriptTagRegex = regexp.MustCompile(`(?is)<script.*?>.*?</script>`)
var eventAttrRegex = regexp.MustCompile(`(?i)\s+on[a-z]+\s*=\s*(".*?"|'.*?')`)
var javascriptProtoRegex = regexp.MustCompile(`(?i)javascript:`)
// Go regexp (RE2) supports \x{....} for Unicode code points (not \u....).
var tamilCharRegex = regexp.MustCompile(`[\x{0B80}-\x{0BFF}]`)

// submitResponseCache: in-memory cache for inline submit responses so repeat identical text returns in <100ms.
// Increased TTL and cache size for better performance with 1000+ concurrent users.
const submitCacheTTL = 30 * time.Minute    // Extended TTL for better cache hit rate
const submitCacheMaxEntries = 5000          // Increased for high concurrency

type submitCachedCorrection struct {
	BlockID      string `json:"blockId"`
	OriginalText string `json:"originalText"`
	Correction   string `json:"correction"`
	Reason       string `json:"reason"`
	Type         string `json:"type"`
	StartIndex   int    `json:"start_index"`
	EndIndex     int    `json:"end_index"`
}

type submitCacheEntry struct {
	corrections []submitCachedCorrection
	expiresAt   time.Time
}

var (
	submitCacheMu sync.RWMutex
	submitCache   = make(map[string]submitCacheEntry)
)

func submitCacheKey(normalizedText string, includeAlternatives bool) string {
	// FNV-1a is much faster than SHA256 for in-memory cache keys; collision risk is acceptable.
	h := fnv.New64a()
	_, _ = h.Write([]byte(normalizedText))
	if includeAlternatives {
		h.Write([]byte("|alt=1"))
	}
	return strconv.FormatUint(h.Sum64(), 36)
}

func getSubmitCache(key string) []submitCachedCorrection {
	submitCacheMu.RLock()
	ent, ok := submitCache[key]
	submitCacheMu.RUnlock()
	if !ok || time.Now().After(ent.expiresAt) {
		return nil
	}
	return ent.corrections
}

func setSubmitCache(key string, corrections []submitCachedCorrection) {
	if len(corrections) == 0 {
		return
	}
	submitCacheMu.Lock()
	defer submitCacheMu.Unlock()
	if len(submitCache) >= submitCacheMaxEntries {
		// Evict one random entry (oldest would require tracking; simple eviction)
		for k := range submitCache {
			delete(submitCache, k)
			break
		}
	}
	submitCache[key] = submitCacheEntry{corrections: corrections, expiresAt: time.Now().Add(submitCacheTTL)}
}

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

// findAllUnusedOccurrences returns all non-overlapping (start, end) pairs for needle in haystack
// that do not overlap with used ranges. Used so we can show one correction per occurrence (like competitors).
func findAllUnusedOccurrences(haystack, needle string, used []usedRange) [][2]int {
	var out [][2]int
	if needle == "" || haystack == "" {
		return out
	}
	searchFrom := 0
	for {
		idx := strings.Index(haystack[searchFrom:], needle)
		if idx < 0 {
			break
		}
		start := searchFrom + idx
		end := start + len(needle)
		if !overlapsAny(start, end, used) {
			out = append(out, [2]int{start, end})
		}
		searchFrom = end
		if searchFrom >= len(haystack) {
			break
		}
	}
	return out
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
	seenKey := make(map[string]bool)
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
		key := oNorm + "|" + cNorm
		if seenKey[key] {
			continue
		}
		seenKey[key] = true

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

	// 500KB limit to support long documents; backend proofreads with timeouts and chunking
	const maxSubmitTextLen = 500000
	if len(req.Text) > maxSubmitTextLen {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Text is too long (max 500KB)"})
		return
	}

	saveDraft := true
	if req.SaveDraft != nil {
		saveDraft = *req.SaveDraft
	}

	// For inline analysis (demo/homepage): check cache first so cache hits return in <100ms
	// (no word count or Tamil check on cache hit path)
	if !saveDraft {
		normalizedForCache := strings.TrimSpace(strings.Join(strings.Fields(req.Text), " "))
		cacheKey := submitCacheKey(normalizedForCache, req.IncludeAlternatives)
		if cached := getSubmitCache(cacheKey); cached != nil {
			c.Header("Cache-Control", "no-store, max-age=0")
			c.Header("X-Proofread-Cache", "HIT")
			c.JSON(http.StatusOK, gin.H{
				"success":     true,
				"request_id":  requestID,
				"corrections": cached,
			})
			// Log to the anonymous-submission analytics table so the admin
			// dashboard sees this attempt. Non-fatal; runs after the
			// response is queued via the go routine so cache-hit latency
			// stays sub-100ms.
			go h.recordAnonymousSubmission(c.Copy(), requestID, len(req.Text),
				h.nlpService.CountWords(req.Text), len(cached), true)
			// AI observability: cache hit is a class of AI request too —
			// zero tokens, zero latency, but it still represents demand
			// so cache-hit-rate dashboards can measure how much LLM spend
			// the cache is saving us.
			h.aiLogger.Log(observability.AIRequestLog{
				RequestID:   requestID,
				UserID:      optionalUserID(c),
				Model:       "cache",
				Status:      models.AIStatusCacheHit,
				CacheHit:    true,
				CountryCode: geo.CountryFromContext(c),
			})
			return
		}

		// Cache miss: validate and call LLM
		wordCount := h.nlpService.CountWords(req.Text)
		if wordCount == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No valid words found in text"})
			return
		}

		// Free tier word limit: 200 words for anonymous or free-plan users.
		// Pro/Basic/Enterprise users get the full limit.
		const freeTierWordLimit = 200
		inlineUserID, inlineAuthErr := middleware.GetUserFromContext(c)
		isFreeTierUser := true // default to free/anonymous
		if inlineAuthErr == nil && inlineUserID > 0 {
			var inlineUser models.User
			if dbErr := h.db.Select("subscription").First(&inlineUser, inlineUserID).Error; dbErr == nil {
				switch inlineUser.Subscription {
				case models.PlanBasic, models.PlanPro, models.PlanEnterprise:
					isFreeTierUser = false
				}
			}
		}
		if isFreeTierUser && wordCount > freeTierWordLimit {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error":      "word_limit_exceeded",
				"message":    "Free plan is limited to 200 words per analysis. Upgrade to Pro for unlimited words.",
				"word_limit": freeTierWordLimit,
				"word_count": wordCount,
			})
			return
		}

		// Fast path: no Tamil characters → skip AI
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

		ctx, cancel := context.WithTimeout(c.Request.Context(), proofreadTimeoutFor(wordCount, len(req.Text)))
		defer cancel()
		llmStart := time.Now()
		result, err := h.llmService.ProofreadText(ctx, req.Text, wordCount, req.IncludeAlternatives, requestID, 0)
		llmLatencyMS := int(time.Since(llmStart) / time.Millisecond)
		if err != nil {
			// AI observability: log the failure with a classified error type
			// so the admin dashboard can distinguish rate limits, timeouts,
			// and API errors. Fires before the success-shaped response so
			// even the "graceful fallback" is measurable.
			h.aiLogger.Log(observability.AIRequestLog{
				RequestID:   requestID,
				UserID:      optionalUserID(c),
				Model:       "gemini-flash",
				Status:      classifyAIError(err),
				LatencyMS:   llmLatencyMS,
				ErrorType:   err.Error(),
				CountryCode: geo.CountryFromContext(c),
			})
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
		// AI observability: successful inline (anonymous demo) request.
		// Tokens come from result.PromptTokens/OutputTokens which
		// mirror the Gemini usageMetadata block; cost is derived
		// inside the logger.
		h.aiLogger.Log(observability.AIRequestLog{
			RequestID:    requestID,
			UserID:       optionalUserID(c),
			Model:        "gemini-flash",
			Status:       models.AIStatusOK,
			InputTokens:  result.PromptTokens,
			OutputTokens: result.OutputTokens,
			TotalTokens:  result.TotalTokens,
			LatencyMS:    llmLatencyMS,
			CountryCode:  geo.CountryFromContext(c),
		})

		// Map to required corrections format. Include every occurrence of each (original, corrected)
		// so correction count is comparable to competitors (e.g. 200+ when the same error repeats).
		blockID := "0"
		used := []usedRange{}
		corrections := []submitCachedCorrection{}
		for _, s := range result.Suggestions {
			oNorm := normalizeComparableText(s.Original)
			cNorm := normalizeComparableText(s.Corrected)
			if oNorm == "" || cNorm == "" || oNorm == cNorm {
				continue
			}
			// Must be grounded in the text
			if !strings.Contains(req.Text, s.Original) {
				continue
			}
			// Expand to all occurrences: one correction per instance (like competitor apps).
			occurrences := findAllUnusedOccurrences(req.Text, s.Original, used)
			if len(occurrences) == 0 && s.StartIndex > 0 && s.EndIndex > s.StartIndex && !overlapsAny(s.StartIndex, s.EndIndex, used) {
				occurrences = [][2]int{{s.StartIndex, s.EndIndex}}
			}
			for _, pos := range occurrences {
				startIdx, endIdx := pos[0], pos[1]
				used = append(used, usedRange{Start: startIdx, End: endIdx})
				corrections = append(corrections, submitCachedCorrection{
					BlockID:      blockID,
					OriginalText: s.Original,
					Correction:   s.Corrected,
					Reason:       s.Reason,
					Type:         s.Type,
					StartIndex:   startIdx,
					EndIndex:     endIdx,
				})
			}
		}
		setSubmitCache(cacheKey, corrections)

		c.Header("Cache-Control", "no-store, max-age=0")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")

		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"request_id":  requestID,
			"corrections": corrections,
		})
		// Record analytics after response is queued. Uses c.Copy() so the
		// goroutine keeps the request headers (IP, User-Agent) even after
		// the request context returns.
		go h.recordAnonymousSubmission(c.Copy(), requestID, len(req.Text), wordCount, len(corrections), false)
		return
	}

	// Require authentication for draft saving
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized - please login"})
		return
	}

	wordCount := h.nlpService.CountWords(req.Text)
	if wordCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid words found in text"})
		return
	}

	// Free tier word limit: 200 words per submission for free-plan users.
	// Admin bypass and paid plans are exempt.
	{
		var planUser models.User
		if dbErr := h.db.Select("subscription", "email", "role").First(&planUser, userID).Error; dbErr == nil {
			isFree := planUser.Subscription == models.PlanFree || planUser.Subscription == ""
			isAdminEmail := planUser.Role == models.RoleAdmin ||
				strings.EqualFold(planUser.Email, "palkani.r@gmail.com") ||
				strings.EqualFold(planUser.Email, "prooftamil@gmail.com") ||
				strings.EqualFold(planUser.Email, "banu.palkani@gmail.com") ||
				strings.EqualFold(planUser.Email, "contact@prooftamil.com")
			if isFree && !isAdminEmail && wordCount > 200 {
				c.JSON(http.StatusUnprocessableEntity, gin.H{
					"error":      "word_limit_exceeded",
					"message":    "Free plan is limited to 200 words per analysis. Upgrade to Pro for unlimited words.",
					"word_limit": 200,
					"word_count": wordCount,
				})
				return
			}
		}
	}

	// Daily Gemini token usage limit.
	// Enforced only for authenticated, draft-saving submits (Workspace).
	// Set to 50000 to guarantee free users at least 5 full submissions per day
	// even for max-length (200-word) Tamil texts (~8000 tokens/submission worst-case).
	const dailyTokenLimit = 50000

	// Admin bypass: do not enforce daily quota for the admin email(s) or admin role.
	// This allows you to demo/test freely without hitting limits.
	isAdminBypass := false
	{
		var u models.User
		if err := h.db.Select("email", "role").First(&u, userID).Error; err == nil {
			email := strings.ToLower(strings.TrimSpace(u.Email))
			if u.Role == models.RoleAdmin || email == "palkani.r@gmail.com" || email == "prooftamil@gmail.com" || email == "banu.palkani@gmail.com" || email == "contact@prooftamil.com" {
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
				"message":    "You have exceeded your daily limit. Please come back tomorrow.",
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

	// ---- Update existing draft if submission_id is provided ----
	if req.SubmissionID != nil && *req.SubmissionID > 0 {
		var existing models.Submission
		if err := h.db.First(&existing, *req.SubmissionID).Error; err == nil && existing.UserID == userID {
			existing.OriginalText = req.Text
			existing.OriginalHTML = req.HTML
			existing.WordCount = wordCount
			existing.ModelUsed = modelType
			existing.Status = models.StatusPending
			existing.Suggestions = "[]"
			existing.Alternatives = "[]"
			existing.ProofreadText = ""
			existing.Error = ""
			existing.RequestID = requestID
			if saveErr := h.db.Save(&existing).Error; saveErr != nil {
				log.Printf("Error updating submission %d: %v", *req.SubmissionID, saveErr)
				// Fall through to create a new submission
			} else {
				auditlog.Info(c, "submission.updated", map[string]any{
					"submission_id": existing.ID,
					"request_id":    requestID,
					"word_count":    wordCount,
				})
				updUsage := &models.Usage{
					UserID:       userID,
					WordCount:    wordCount,
					TokenCount:   reservedTokens,
					ModelUsed:    modelType,
					SubmissionID: &existing.ID,
					Date:         time.Now(),
				}
				if err := h.db.Create(updUsage).Error; err != nil {
					log.Printf("Error creating usage record for update: %v", err)
				}
				go h.processSubmission(context.Background(), existing.ID, requestID, req.Text, wordCount, modelType, req.IncludeAlternatives, capOutput, updUsage.ID)
				c.JSON(http.StatusAccepted, gin.H{
					"success":     true,
					"submission":  existing,
					"corrections": []any{},
					"message":     "Submission updated, proofreading started...",
					"request_id":  requestID,
					"quota": gin.H{
						"limit":     dailyTokenLimit,
						"used":      usedToday,
						"reserved":  reservedTokens,
						"remaining": remaining,
					},
				})
				return
			}
		}
	}

	// Create submission record with pending status first (draft name stored in DB)
	submission := &models.Submission{
		UserID:              userID,
		Title:               "Untitled draft", // user can rename on drafts page
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
		// Still log the ai_request activity below in the fallback path, but
		// draft_create doesn't get logged when the persistent write failed.
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

	// Admin activity timeline: draft was successfully saved. The AI
	// call is logged separately from processSubmission once Gemini
	// returns, so the two rows tell the operator "user created a
	// draft AND we ran an AI request against it".
	h.activityLogger.Log(userID, models.EventDraftCreate, map[string]any{
		"submission_id": submission.ID,
		"word_count":    wordCount,
		"model":         string(modelType),
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

	// Look up submission owner once so we can attribute the AI request
	// log entry to a user. Not fatal — a missing user_id in the log row
	// just means we lose per-user attribution for this one call.
	var submissionOwnerID uint
	{
		var s models.Submission
		if lookupErr := h.db.Select("user_id").First(&s, submissionID).Error; lookupErr == nil {
			submissionOwnerID = s.UserID
		}
	}

	// Process with LLM service (hard timeout so the job can't hang indefinitely)
	ctx2, cancel := context.WithTimeout(ctx, proofreadTimeoutFor(wordCount, len(text)))
	defer cancel()
	llmStart := time.Now()
	result, err := h.llmService.ProofreadText(ctx2, text, wordCount, includeAlternatives, requestID, maxOutputTokensCap)
	llmLatencyMS := int(time.Since(llmStart) / time.Millisecond)
	if err != nil {
		// AI observability: authenticated draft path failed. Classify
		// the error and log tokens=0 since Gemini didn't return usage.
		h.aiLogger.Log(observability.AIRequestLog{
			RequestID:    requestID,
			UserID:       ptrIfNonZero(submissionOwnerID),
			SubmissionID: &submissionID,
			Model:        string(modelType),
			Status:       classifyAIError(err),
			LatencyMS:    llmLatencyMS,
			ErrorType:    err.Error(),
		})
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

	// AI observability: successful authenticated draft. Same shape as
	// the inline path — tokens + latency + status, cost derived inside
	// the logger from the model string. SubmissionID is populated so
	// operators can drill from a cost row back to the actual draft.
	h.aiLogger.Log(observability.AIRequestLog{
		RequestID:    requestID,
		UserID:       ptrIfNonZero(submissionOwnerID),
		SubmissionID: &submissionID,
		Model:        string(modelType),
		Status:       models.AIStatusOK,
		InputTokens:  result.PromptTokens,
		OutputTokens: result.OutputTokens,
		TotalTokens:  result.TotalTokens,
		LatencyMS:    llmLatencyMS,
	})

	// Admin activity timeline: the AI ran successfully for this draft.
	// Only recorded when we have a real owner — the anonymous demo path
	// never reaches processSubmission, but this guard keeps the row's
	// user_id NOT NULL guarantee safe.
	if submissionOwnerID > 0 {
		h.activityLogger.Log(submissionOwnerID, models.EventAIRequest, map[string]any{
			"submission_id": submissionID,
			"model":         string(modelType),
			"total_tokens":  result.TotalTokens,
			"latency_ms":    llmLatencyMS,
		})
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

// GetSubmissions retrieves user's submissions, optionally filtered by group_id. Returns groups when not filtering.
func (h *Handlers) GetSubmissions(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	limitStr := c.DefaultQuery("limit", "100")
	offsetStr := c.DefaultQuery("offset", "0")
	groupIDStr := c.Query("group_id")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	q := h.db.Where("user_id = ?", userID).Where("archived = ?", false).Order("created_at DESC").Limit(limit).Offset(offset)
	if groupIDStr != "" {
		if groupIDStr == "0" || groupIDStr == "null" {
			q = q.Where("group_id IS NULL")
		} else {
			gID, parseErr := strconv.ParseUint(groupIDStr, 10, 32)
			if parseErr == nil {
				q = q.Where("group_id = ?", uint(gID))
			}
		}
	}

	var submissions []models.Submission
	if err := q.Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to fetch submissions",
			"details": err.Error(),
		})
		return
	}

	resp := gin.H{"submissions": submissions}
	// When not filtering by group, include user's groups so frontend can show sidebar
	if groupIDStr == "" {
		var groups []models.DraftGroup
		if err := h.db.Where("user_id = ?", userID).Order("sort_order ASC, name ASC").Find(&groups).Error; err == nil {
			resp["groups"] = groups
		} else {
			resp["groups"] = []models.DraftGroup{}
		}
	}
	c.JSON(http.StatusOK, resp)
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

// UpdateSubmissionRequest defines the body for PATCH /api/v1/submissions/:id
type UpdateSubmissionRequest struct {
	Title   *string `json:"title"`
	GroupID *uint   `json:"group_id"` // nil or omit = ungrouped; 0 = ungrouped; set to group id to assign
}

// UpdateSubmission updates a submission's title
func (h *Handlers) UpdateSubmission(c *gin.Context) {
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

	var req UpdateSubmissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	if req.Title == nil && req.GroupID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Provide at least one of title or group_id"})
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

	updates := map[string]interface{}{}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		updates["title"] = title
		submission.Title = title
	}
	if req.GroupID != nil {
		var groupID *uint
		if *req.GroupID != 0 {
			var g models.DraftGroup
			if err := h.db.Where("id = ? AND user_id = ?", *req.GroupID, userID).First(&g).Error; err == nil {
				groupID = req.GroupID
			}
		}
		updates["group_id"] = groupID
		submission.GroupID = groupID
	}
	if len(updates) > 0 {
		// Use Model(&submission) and Updates so GORM targets the loaded row; log DB error on failure.
		if err := h.db.Model(&submission).Updates(updates).Error; err != nil {
			log.Printf("[SUBMISSION] Update failed for id=%d user_id=%d: %v", submission.ID, userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update submission"})
			return
		}
	}
	log.Printf("[SUBMISSION] Updated submission %d for user %d", submission.ID, userID)

	// Activity timeline: metadata edits (title, group) count as
	// draft_update events. Body edits go through a different path
	// (draft autosave via submission stream) — instrument there
	// separately when we surface that flow.
	h.activityLogger.Log(userID, models.EventDraftUpdate, map[string]any{
		"submission_id": submission.ID,
		"changed":       len(updates),
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "submission": submission})
}

// DuplicateSubmissionRequest is the optional body for POST /submissions/:id/duplicate
type DuplicateSubmissionRequest struct {
	Name    *string `json:"name"`    // display name for the new draft (default: "Copy of <original title>")
	GroupID *uint   `json:"group_id"` // put duplicate in this group (nil = Ungrouped)
}

// DuplicateSubmission creates a copy of an existing submission and saves it to the DB
func (h *Handlers) DuplicateSubmission(c *gin.Context) {
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

	var original models.Submission
	if err := h.db.Where("id = ? AND user_id = ?", submissionID, userID).First(&original).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Submission not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to locate submission"})
		return
	}

	var body DuplicateSubmissionRequest
	_ = c.ShouldBindJSON(&body)

	copyTitle := "Copy of " + original.Title
	if original.Title == "" {
		copyTitle = "Copy of Draft " + submissionIDStr
	}
	if body.Name != nil {
		trimmed := strings.TrimSpace(*body.Name)
		if trimmed != "" {
			copyTitle = trimmed
		}
	}

	// If group_id provided, verify it belongs to user
	var groupID *uint
	if body.GroupID != nil && *body.GroupID != 0 {
		var g models.DraftGroup
		if err := h.db.Where("id = ? AND user_id = ?", *body.GroupID, userID).First(&g).Error; err == nil {
			groupID = body.GroupID
		}
	}

	modelType := models.ModelA
	if original.WordCount >= 500 {
		modelType = models.ModelB
	}

	newSubmission := models.Submission{
		UserID:       userID,
		GroupID:      groupID,
		Title:        copyTitle,
		OriginalText: original.OriginalText,
		OriginalHTML: original.OriginalHTML,
		WordCount:    original.WordCount,
		ModelUsed:    modelType,
		Status:       models.StatusPending,
	}

	if err := h.db.Create(&newSubmission).Error; err != nil {
		log.Printf("[SUBMISSION] Failed to duplicate submission %d: %v", submissionID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to duplicate draft"})
		return
	}

	log.Printf("[SUBMISSION] Duplicated submission %d as %d for user %d", submissionID, newSubmission.ID, userID)
	c.JSON(http.StatusCreated, gin.H{
		"success":    true,
		"submission": newSubmission,
		"message":    "Draft duplicated successfully",
	})
}

// ArchiveSubmission marks a submission as archived (trash); kept for 7 days before permanent deletion.
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

	// Activity timeline: archive is the soft-delete path (7-day
	// retention), so it maps to draft_delete for the admin feed. Hard
	// deletes fire the same event type — the reader doesn't need to
	// distinguish.
	h.activityLogger.Log(userID, models.EventDraftDelete, map[string]any{
		"submission_id": submission.ID,
		"kind":          "archive",
	})

	c.JSON(http.StatusOK, gin.H{
		"status":       "archived",
		"archived_at":  now,
		"retention_in": 7,
	})
}

// UnarchiveSubmission restores a submission from trash (sets archived = false).
func (h *Handlers) UnarchiveSubmission(c *gin.Context) {
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
	if !submission.Archived {
		c.JSON(http.StatusOK, gin.H{"status": "already_restored", "message": "Draft is not in trash"})
		return
	}
	if err := h.db.Model(&submission).Updates(map[string]interface{}{"archived": false, "archived_at": nil}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to restore draft"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Draft restored from trash", "submission": submission})
}

// DeleteSubmission permanently deletes a submission (draft)
func (h *Handlers) DeleteSubmission(c *gin.Context) {
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

	// Use a transaction to safely delete the submission and handle related records
	tx := h.db.Begin()
	if tx.Error != nil {
		log.Printf("[SUBMISSION] Failed to begin transaction for delete: %v", tx.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete submission"})
		return
	}

	// First, nullify any foreign key references in the usage table
	if err := tx.Model(&models.Usage{}).
		Where("submission_id = ?", submissionID).
		Update("submission_id", nil).Error; err != nil {
		tx.Rollback()
		log.Printf("[SUBMISSION] Failed to update usage records for submission %d: %v", submissionID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete submission", "details": err.Error()})
		return
	}

	// Now permanently delete the submission
	if err := tx.Unscoped().Delete(&submission).Error; err != nil {
		tx.Rollback()
		log.Printf("[SUBMISSION] Failed to delete submission %d: %v", submissionID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete submission", "details": err.Error()})
		return
	}

	// Commit the transaction
	if err := tx.Commit().Error; err != nil {
		log.Printf("[SUBMISSION] Failed to commit delete transaction for submission %d: %v", submissionID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete submission"})
		return
	}

	log.Printf("[SUBMISSION] Deleted submission %d for user %d", submissionID, userID)

	// Activity timeline: hard delete after archive (or a direct
	// delete on an unarchived draft). Kept distinct from archive
	// via the "kind" tag so admin reports can split soft vs hard.
	h.activityLogger.Log(userID, models.EventDraftDelete, map[string]any{
		"submission_id": submissionID,
		"kind":          "hard",
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Draft deleted successfully",
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
		"retention_days": 7,
		"message":        "Drafts stay here for 7 days before permanent deletion.",
	})
}

// GetDraftGroups returns the current user's draft groups
func (h *Handlers) GetDraftGroups(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var groups []models.DraftGroup
	if err := h.db.Where("user_id = ?", userID).Order("sort_order ASC, name ASC").Find(&groups).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch groups", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

// CreateDraftGroupRequest is the body for POST /draft-groups
type CreateDraftGroupRequest struct {
	Name string `json:"name" binding:"required"`
}

// CreateDraftGroup creates a new draft group for the user
func (h *Handlers) CreateDraftGroup(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var req CreateDraftGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
		return
	}
	if len(name) > 255 {
		name = name[:255]
	}
	g := models.DraftGroup{UserID: userID, Name: name}
	if err := h.db.Create(&g).Error; err != nil {
		log.Printf("[DRAFT_GROUPS] Create failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create group. Please try again."})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "group": g})
}

// UpdateDraftGroupRequest is the body for PATCH /draft-groups/:id
type UpdateDraftGroupRequest struct {
	Name string `json:"name"`
}

// UpdateDraftGroup renames a draft group
func (h *Handlers) UpdateDraftGroup(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}
	var req UpdateDraftGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name cannot be empty"})
		return
	}
	if len(name) > 255 {
		name = name[:255]
	}
	var g models.DraftGroup
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&g).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find group"})
		return
	}
	if err := h.db.Model(&g).Update("name", name).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update group"})
		return
	}
	g.Name = name
	c.JSON(http.StatusOK, gin.H{"success": true, "group": g})
}

// DeleteDraftGroup deletes a group and moves its drafts to Ungrouped (group_id = NULL)
func (h *Handlers) DeleteDraftGroup(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}
	var g models.DraftGroup
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&g).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find group"})
		return
	}
	// Unassign all drafts from this group
	if err := h.db.Model(&models.Submission{}).Where("group_id = ?", g.ID).Update("group_id", nil).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unassign drafts"})
		return
	}
	if err := h.db.Delete(&g).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete group"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Group deleted; drafts moved to Ungrouped"})
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
