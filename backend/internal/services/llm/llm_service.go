package llm

import (
        "context"
	"crypto/sha256"
        "encoding/json"
        "errors"
        "fmt"
        "log"
        "os"
        "strings"
	"sync"
        "time"

        "tamil-proofreading-platform/backend/internal/models"
        "tamil-proofreading-platform/backend/internal/services/nlp"
        "tamil-proofreading-platform/backend/internal/util/properties"

        openai "github.com/sashabaranov/go-openai"
)

type LLMService struct {
        openAIClient *openai.Client
        googleAPIKey string
        anthropicKey string
        nlpService   *nlp.TamilNLPService
	proofreadCache *proofreadCache
}

type GeminiTokenPlan struct {
	Model          models.ModelType
	PromptTokens   int
	MaxOutputTokens int
}

type ProofreadResult struct {
        CorrectedText  string           `json:"corrected_text"`
        Suggestions    []Suggestion     `json:"suggestions"`
        Changes        []Change         `json:"changes"`
        Alternatives   []string         `json:"alternatives"`
        ModelUsed      models.ModelType `json:"model_used"`
        PromptTokens   int              `json:"prompt_tokens,omitempty"`
        OutputTokens   int              `json:"output_tokens,omitempty"`
        TotalTokens    int              `json:"total_tokens,omitempty"`
        ProcessingTime float64          `json:"processing_time"`
}

type Suggestion struct {
        Original   string `json:"original"`
        Corrected  string `json:"corrected"`
        Reason     string `json:"reason"`
        Type       string `json:"type"`
        StartIndex int    `json:"start_index"`
        EndIndex   int    `json:"end_index"`
}

type Change struct {
        Original  string `json:"original"`
        Corrected string `json:"corrected"`
        Position  int    `json:"position"`
}

func NewLLMService(openAIKey, googleKey, anthropicKey string, nlpService *nlp.TamilNLPService) *LLMService {
        cleanedKey := strings.TrimSpace(openAIKey)
        var client *openai.Client
        if cleanedKey != "" {
                client = openai.NewClient(cleanedKey)
        }

        return &LLMService{
                openAIClient: client,
                googleAPIKey: strings.TrimSpace(googleKey),
                anthropicKey: strings.TrimSpace(anthropicKey),
                nlpService:   nlpService,
		proofreadCache: newProofreadCache(5 * time.Minute),
        }
}

// ProviderError is a normalized error type used for provider fallback decisions.
type ProviderError struct {
        Provider   string
        StatusCode int
        Message    string
        Retryable  bool
}

func (e *ProviderError) Error() string {
        if e == nil {
                return "provider error"
        }
        if e.StatusCode != 0 {
                return fmt.Sprintf("%s error (status=%d): %s", e.Provider, e.StatusCode, e.Message)
        }
        return fmt.Sprintf("%s error: %s", e.Provider, e.Message)
}

func getEnvTrim(key, def string) string {
        v := strings.TrimSpace(os.Getenv(key))
        if v == "" {
                if pv, ok := properties.Get(key); ok {
                        return pv
                }
                return def
        }
        return v
}

func shouldFallbackOn(err error) bool {
        if err == nil {
                return false
        }
        var pe *ProviderError
        if errors.As(err, &pe) {
                if pe.Retryable {
                        return true
                }
                if pe.StatusCode == 429 || pe.StatusCode == 408 {
                        return true
                }
                if pe.StatusCode >= 500 && pe.StatusCode <= 599 {
                        return true
                }
        }
        return false
}

var promptInjectionPhrases = []string{
        "ignore previous instructions",
        "disregard earlier directives",
        "you are now",
        "system prompt",
        "developer message",
        "forget the previous",
}

// selectOptimalModel chooses the best model based on text characteristics
// - flash-lite: Faster for short texts (<200 chars or <50 words)
// - flash: More accurate for longer or complex texts
func (s *LLMService) selectOptimalModel(text string, wordCount int) models.ModelType {
        charCount := len(text)
        
	// Latency-first: most interactive submits are short/medium.
	// Use flash-lite for <= ~200 words, or generally small payloads.
	if wordCount <= 250 || charCount <= 1500 {
                log.Printf("[MODEL-SELECT] Using flash-lite (chars=%d, words=%d)", charCount, wordCount)
                return models.ModelType(models.ModelGeminiFlashLite)
        }
        
        // Use full flash for longer texts (better accuracy)
        log.Printf("[MODEL-SELECT] Using flash (chars=%d, words=%d)", charCount, wordCount)
        return models.ModelType(models.ModelGeminiFlash)
}

func maxOutputTokensForProofread(wordCount int, charCount int) int {
        // Latency lever: smaller max tokens -> faster decoding.
        switch {
	case charCount < 800 && wordCount <= 150:
		return 1024
	case charCount < 1800 && wordCount <= 300:
		return 2048
	case charCount < 3500 && wordCount <= 700:
		return 4096
        default:
		return 8192
        }
}

func isLikelyTruncatedJSON(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" {
		return false
	}
	// Heuristics: starts with '{' but doesn't end with '}' or ends mid-string/array/object.
	if strings.HasPrefix(t, "{") && !strings.HasSuffix(t, "}") {
		return true
	}
	// If JSON unmarshal failed with "unexpected end" we won't have error here; this is a cheap check
	// used before retrying Gemini.
	return false
}

type proofreadCacheEntry struct {
	value     *ProofreadResult
	expiresAt time.Time
}

type proofreadCache struct {
	ttl time.Duration
	mu  sync.RWMutex
	m   map[string]proofreadCacheEntry
}

func newProofreadCache(ttl time.Duration) *proofreadCache {
	return &proofreadCache{
		ttl: ttl,
		m:   make(map[string]proofreadCacheEntry, 256),
	}
}

func (c *proofreadCache) get(key string) (*ProofreadResult, bool) {
	if c == nil {
		return nil, false
	}
	now := time.Now()
	c.mu.RLock()
	entry, ok := c.m[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	if now.After(entry.expiresAt) {
		c.mu.Lock()
		delete(c.m, key)
		c.mu.Unlock()
		return nil, false
	}
	return entry.value, true
}

func (c *proofreadCache) set(key string, val *ProofreadResult) {
	if c == nil || val == nil {
		return
	}
	c.mu.Lock()
	// simple size guard to avoid unbounded growth
	if len(c.m) > 2000 {
		for k := range c.m {
			delete(c.m, k)
			break
		}
	}
	c.m[key] = proofreadCacheEntry{value: val, expiresAt: time.Now().Add(c.ttl)}
	c.mu.Unlock()
}

func proofreadCacheKey(cleaned string, includeAlternatives bool, model models.ModelType, maxTokens int) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s|alt=%t|model=%s|maxt=%d", cleaned, includeAlternatives, string(model), maxTokens)))
	return fmt.Sprintf("%x", h[:])
}

func normalizeComparable(s string) string {
        t := strings.TrimSpace(s)
        t = strings.Trim(t, `"'`)
        t = strings.Join(strings.Fields(t), " ")
        t = strings.ReplaceAll(t, "\u200b", "")
        t = strings.ReplaceAll(t, "\u200c", "")
        t = strings.ReplaceAll(t, "\u200d", "")
        t = strings.ReplaceAll(t, "\ufeff", "")
        return t
}

func fillSuggestionIndices(originalText string, suggestions []Suggestion) []Suggestion {
        if len(suggestions) == 0 || strings.TrimSpace(originalText) == "" {
                return suggestions
        }
        used := make(map[int]bool)
        out := make([]Suggestion, 0, len(suggestions))
        for _, s := range suggestions {
                orig := strings.TrimSpace(s.Original)
                corr := strings.TrimSpace(s.Corrected)
                if orig == "" || corr == "" {
                        continue
                }
                if normalizeComparable(orig) == normalizeComparable(corr) {
                        continue
                }
                if (s.StartIndex <= 0 || s.EndIndex <= 0) && orig != "" {
                        idx := 0
                        for {
                                pos := strings.Index(originalText[idx:], orig)
                                if pos < 0 {
                                        break
                                }
                                start := idx + pos
                                end := start + len(orig)
                                if !used[start] {
                                        s.StartIndex = start
                                        s.EndIndex = end
                                        used[start] = true
                                        break
                                }
                                idx = end
                                if idx >= len(originalText) {
                                        break
                                }
                        }
                }
                out = append(out, s)
        }
        return out
}

// detectChangesFromText auto-generates suggestions by finding differences between original and corrected text
// This is a fallback when Gemini doesn't return explicit corrections array
func detectChangesFromText(original, corrected string) []Suggestion {
        if original == corrected {
                return []Suggestion{}
        }

        var suggestions []Suggestion

        // Split into words for comparison
        origWords := strings.Fields(original)
        corrWords := strings.Fields(corrected)

        // Simple word-by-word comparison
        minLen := len(origWords)
        if len(corrWords) < minLen {
                minLen = len(corrWords)
        }

        for i := 0; i < minLen; i++ {
                if origWords[i] != corrWords[i] {
                        // Find the position in the original text
                        pos := strings.Index(original, origWords[i])
                        if pos >= 0 {
                                suggestions = append(suggestions, Suggestion{
                                        Original:   origWords[i],
                                        Corrected:  corrWords[i],
                                        Reason:     "சரி செய்யப்பட்ட சொல்", // "Corrected word" in Tamil
                                        Type:       "correction",
                                        StartIndex: pos,
                                        EndIndex:   pos + len(origWords[i]),
                                })
                        }
                }
        }

        // If different lengths, capture the extra/missing content
        if len(corrWords) > len(origWords) {
                remaining := strings.Join(corrWords[len(origWords):], " ")
                if remaining != "" {
                        suggestions = append(suggestions, Suggestion{
                                Original:   "",
                                Corrected:  remaining,
                                Reason:     "சேர்க்கப்பட்ட வார்த்தைகள்", // "Added words" in Tamil
                                Type:       "addition",
                                StartIndex: len(original),
                                EndIndex:   len(corrected),
                        })
                }
        }

        return suggestions
}

func (s *LLMService) ProofreadWithGoogle(ctx context.Context, text string, requestID string, includeAlternatives bool, maxOutputTokensCap int) (*ProofreadResult, error) {
        start := time.Now()

        if text == "" {
                return nil, errors.New("empty text provided")
        }

        if strings.TrimSpace(text) == "" {
                return &ProofreadResult{
                        CorrectedText: text,
                        Suggestions:   []Suggestion{},
                        ModelUsed:     models.ModelGeminiFlash,
                        ProcessingTime: time.Since(start).Seconds(),
                }, nil
        }

        cleaned := s.nlpService.Preprocess(text)
        cleaned = sanitizeUserInput(cleaned)
        
        // Smart model selection based on text length
        wordCount := s.nlpService.CountWords(cleaned)
        selectedModel := s.selectOptimalModel(cleaned, wordCount)
        maxTokens := maxOutputTokensForProofread(wordCount, len(cleaned))
        if maxOutputTokensCap > 0 && maxOutputTokensCap < maxTokens {
                maxTokens = maxOutputTokensCap
        }

	// Fast path cache: identical inputs within TTL return instantly.
	if cached, ok := s.proofreadCache.get(proofreadCacheKey(cleaned, includeAlternatives, selectedModel, maxTokens)); ok && cached != nil {
		out := *cached
		out.ProcessingTime = time.Since(start).Seconds()
		return &out, nil
	}

        // Use the Gemini API with the selected model
        content, geminiResp, err := CallGeminiProofread(cleaned, string(selectedModel), s.googleAPIKey, maxTokens)
        if err != nil {
                log.Printf("gemini proofread error (request_id=%s): %v", requestID, err)
                return nil, err
        }

        if strings.TrimSpace(content) == "" {
                return nil, fmt.Errorf("empty response from Gemini")
        }

        corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(content)
        if !ok {
                // If Gemini output is truncated (most common cause), do ONE retry with a larger
                // maxOutputTokens so we actually receive the full JSON and can parse it.
                // This preserves "never breaks" while still prioritizing Gemini quality.
                retryMax := maxTokens
                if isLikelyTruncatedJSON(content) {
                        retryMax = maxTokens * 2
                        if retryMax < 2048 {
                                retryMax = 2048
                        }
                        if retryMax > 8192 {
                                retryMax = 8192
                        }
                }
                if retryMax > maxTokens {
                        log.Printf("[GEMINI-RETRY] Parse failed; retrying with higher maxOutputTokens=%d (was %d) (request_id=%s)", retryMax, maxTokens, requestID)
                        if content2, geminiResp2, err2 := CallGeminiProofread(cleaned, string(selectedModel), s.googleAPIKey, retryMax); err2 == nil && strings.TrimSpace(content2) != "" {
                                if corrected2, suggestions2, changes2, alternatives2, ok2 := parseProofreadJSON(content2); ok2 {
                                        corrected, suggestions, changes, alternatives = corrected2, suggestions2, changes2, alternatives2
                                        geminiResp = geminiResp2
                                        ok = true
                                }
                        }
                }
        }
        if !ok {
                // Final safety net: never break submit. Return best-effort corrected_text or original.
                clipped := content
                if len(clipped) > 600 {
                        clipped = clipped[:600] + "..."
                }
                log.Printf("[GEMINI-PARSE-FAIL] (request_id=%s) Unable to parse after retry. content=%s", requestID, clipped)
                if best, ok2 := extractCorrectedTextBestEffort(content); ok2 {
                        corrected = best
                } else {
                        corrected = cleaned
                }
                return &ProofreadResult{
                        CorrectedText:  corrected,
                        Suggestions:    []Suggestion{},
                        Changes:        []Change{},
                        Alternatives:   []string{},
                        ModelUsed:      selectedModel,
                        PromptTokens:   geminiRespUsage(geminiResp, "prompt"),
                        OutputTokens:   geminiRespUsage(geminiResp, "candidates"),
                        TotalTokens:    geminiRespUsage(geminiResp, "total"),
                        ProcessingTime: time.Since(start).Seconds(),
                }, nil
        }

        if corrected == "" {
                corrected = cleaned
        }

        // Fallback: If suggestions array is empty but text was corrected, auto-detect changes
        if len(suggestions) == 0 && corrected != cleaned {
                log.Printf("[FALLBACK] Auto-detecting changes (request_id=%s)", requestID)
                suggestions = detectChangesFromText(cleaned, corrected)
        }
        suggestions = fillSuggestionIndices(cleaned, suggestions)

	out := &ProofreadResult{
                CorrectedText:  corrected,
                Suggestions:    suggestions,
                Changes:        changes,
                Alternatives:   alternatives,
                ModelUsed:      selectedModel,
                PromptTokens:   geminiRespUsage(geminiResp, "prompt"),
                OutputTokens:   geminiRespUsage(geminiResp, "candidates"),
                TotalTokens:    geminiRespUsage(geminiResp, "total"),
                ProcessingTime: time.Since(start).Seconds(),
	}
	s.proofreadCache.set(proofreadCacheKey(cleaned, includeAlternatives, selectedModel, maxTokens), out)
	return out, nil
}

func (s *LLMService) BuildGeminiTokenPlan(ctx context.Context, text string, wordCount int, includeAlternatives bool, requestID string) (*GeminiTokenPlan, error) {
	if strings.TrimSpace(s.googleAPIKey) == "" {
		return nil, fmt.Errorf("Gemini AI not configured: missing GOOGLE_GENAI_API_KEY (or AI_INTEGRATIONS_GEMINI_API_KEY)")
	}
	cleaned := s.nlpService.Preprocess(text)
	cleaned = sanitizeUserInput(cleaned)
	wordCount2 := s.nlpService.CountWords(cleaned)
	if wordCount2 > 0 {
		wordCount = wordCount2
	}
	selectedModel := s.selectOptimalModel(cleaned, wordCount)
	maxTokens := maxOutputTokensForProofread(wordCount, len(cleaned))
	prompt := buildProofreadPrompt(cleaned)
	// CountTokens is typically very fast; still respect ctx by early abort if cancelled.
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	promptTokens, err := CallGeminiCountTokens(prompt, string(selectedModel), s.googleAPIKey)
	if err != nil {
		return nil, err
	}
	return &GeminiTokenPlan{
		Model:           selectedModel,
		PromptTokens:    promptTokens,
		MaxOutputTokens: maxTokens,
	}, nil
}

func geminiRespUsage(resp *GeminiResponse, which string) int {
        if resp == nil || resp.UsageMetadata == nil {
                return 0
        }
        switch which {
        case "prompt":
                return resp.UsageMetadata.PromptTokenCount
        case "candidates":
                return resp.UsageMetadata.CandidatesTokenCount
        case "total":
                return resp.UsageMetadata.TotalTokenCount
        default:
                return 0
        }
}

func (s *LLMService) Proofread(ctx context.Context, text string, requestID string) (*ProofreadResult, error) {
        start := time.Now()

        if text == "" {
                return nil, errors.New("empty text provided")
        }

        if strings.TrimSpace(text) == "" {
                return &ProofreadResult{
                        CorrectedText: text,
                        Suggestions:   []Suggestion{},
                        ModelUsed:     models.ModelGeminiFlash,
                        ProcessingTime: time.Since(start).Seconds(),
                }, nil
        }

        cleaned := s.nlpService.Preprocess(text)
        cleaned = sanitizeUserInput(cleaned)
        
        // Smart model selection based on text length
        wordCount := s.nlpService.CountWords(cleaned)
        _ = s.selectOptimalModel(cleaned, wordCount)
        maxTokens := maxOutputTokensForProofread(wordCount, len(cleaned))

        // Try Google Gemini first
        if s.googleAPIKey == "" {
                // IMPORTANT: Don't silently return empty suggestions (it looks like "no issues found").
                // Fail loudly so deployments fix env configuration.
                log.Printf("[GEMINI-NO-KEY] Google API key not configured (request_id=%s)", requestID)
                return nil, fmt.Errorf("Gemini AI not configured: missing GOOGLE_GENAI_API_KEY (or AI_INTEGRATIONS_GEMINI_API_KEY)")
        }

        // Gemini model selection:
        // - Prefer explicit env override if provided
        // - Otherwise use our known-good constants (models.ModelGeminiFlash)
        // - If a model is unavailable (404), retry with flash-lite then flash.
        primaryGeminiModel := getEnvTrim("GEMINI_PROOFREAD_MODEL", models.ModelGeminiFlash)
        geminiModelCandidates := []string{
                primaryGeminiModel,
                models.ModelGeminiFlashLite,
                models.ModelGeminiFlash,
        }

        var (
                content    string
                err        error
                geminiUsed string
                geminiMeta *GeminiResponse
        )
        for _, m := range geminiModelCandidates {
                if strings.TrimSpace(m) == "" {
                        continue
                }
                geminiUsed = m
                var meta *GeminiResponse
                content, meta, err = CallGeminiProofread(cleaned, m, s.googleAPIKey, maxTokens)
                if err == nil {
                        geminiMeta = meta
                }
                if err == nil {
                        break
                }
                // If model is missing, try next Gemini model before falling back to other providers.
                var pe *ProviderError
                if errors.As(err, &pe) && pe.StatusCode == 404 {
                        log.Printf("[GEMINI-MODEL-NOT-FOUND] model=%s (request_id=%s): %s", m, requestID, pe.Message)
                        continue
                }
                // Otherwise, don't spam multiple Gemini calls; break and evaluate fallback.
                break
        }
        if err != nil {
                log.Printf("[GEMINI-API-ERROR] gemini proofread error (request_id=%s): %v", requestID, err)
                // Provider fallback pipeline on quota/rate-limit/5xx when configured:
                // 1) GPT-4.1-mini (OpenAI)
                // 2) Claude 3.7 Sonnet (Anthropic)
                if shouldFallbackOn(err) {
                        if s.openAIClient != nil {
                                if out, ferr := s.proofreadWithOpenAI(ctx, cleaned, requestID); ferr == nil {
                                        return out, nil
                                } else {
                                        log.Printf("[FALLBACK-OPENAI-ERROR] (request_id=%s): %v", requestID, ferr)
                                }
                        }
                        if strings.TrimSpace(s.anthropicKey) != "" {
                                if out, ferr := s.proofreadWithAnthropic(ctx, cleaned, requestID); ferr == nil {
                                        return out, nil
                                } else {
                                        log.Printf("[FALLBACK-ANTHROPIC-ERROR] (request_id=%s): %v", requestID, ferr)
                                }
                        }
                }
                return nil, err
        }
        if strings.TrimSpace(content) == "" {
                return nil, fmt.Errorf("empty response from Gemini")
        }

        log.Printf("[GEMINI-SUCCESS] Got response (request_id=%s, len=%d)", requestID, len(content))
        corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(content)
        if !ok {
                log.Printf("[GEMINI-PARSE-FAIL] Failed to parse Gemini JSON response (request_id=%s): %s", requestID, content)
                // Treat parse failure as retryable: try other providers before failing the submission.
                if s.openAIClient != nil {
                        if out, ferr := s.proofreadWithOpenAI(ctx, cleaned, requestID); ferr == nil {
                                return out, nil
                        } else {
                                log.Printf("[FALLBACK-OPENAI-ERROR] (request_id=%s): %v", requestID, ferr)
                        }
                }
                if strings.TrimSpace(s.anthropicKey) != "" {
                        if out, ferr := s.proofreadWithAnthropic(ctx, cleaned, requestID); ferr == nil {
                                return out, nil
                        } else {
                                log.Printf("[FALLBACK-ANTHROPIC-ERROR] (request_id=%s): %v", requestID, ferr)
                        }
                }
                // Final fallback: do not fail the submission; return best-effort corrected_text if present.
                if best, ok2 := extractCorrectedTextBestEffort(content); ok2 {
                        corrected = best
                } else {
                        corrected = cleaned
                }
                return &ProofreadResult{
                        CorrectedText:  corrected,
                        Suggestions:    []Suggestion{},
                        Changes:        []Change{},
                        Alternatives:   []string{},
                        ModelUsed:      models.ModelType(geminiUsed),
                        ProcessingTime: time.Since(start).Seconds(),
                }, nil
        }

        if corrected == "" {
                corrected = cleaned
        }

        // Fallback: If suggestions array is empty but text was corrected, auto-detect changes
        if len(suggestions) == 0 && corrected != cleaned {
                log.Printf("[FALLBACK] Auto-detecting changes (request_id=%s)", requestID)
                suggestions = detectChangesFromText(cleaned, corrected)
        }
        suggestions = fillSuggestionIndices(cleaned, suggestions)

        return &ProofreadResult{
                CorrectedText:  corrected,
                Suggestions:    suggestions,
                Changes:        changes,
                Alternatives:   alternatives,
                ModelUsed:      models.ModelType(geminiUsed),
                PromptTokens:   geminiRespUsage(geminiMeta, "prompt"),
                OutputTokens:   geminiRespUsage(geminiMeta, "candidates"),
                TotalTokens:    geminiRespUsage(geminiMeta, "total"),
                ProcessingTime: time.Since(start).Seconds(),
        }, nil
}

func stripCodeFence(input string) string {
        trimmed := strings.TrimSpace(input)
        
        // Check if wrapped in code fences
        if strings.HasPrefix(trimmed, "```") && strings.HasSuffix(trimmed, "```") {
                lines := strings.Split(trimmed, "\n")
                if len(lines) >= 3 {
                        // Skip first line (```json or similar) and last line (```)
                        // Join everything in between
                        content := strings.Join(lines[1:len(lines)-1], "\n")
                        return strings.TrimSpace(content)
                }
        }
        
        return trimmed
}

func parseProofreadJSON(raw string) (string, []Suggestion, []Change, []string, bool) {
        if raw == "" {
                return "", nil, nil, nil, false
        }

        cleaned := stripCodeFence(raw)
        log.Printf("[PARSE-DEBUG] After stripCodeFence: %q", cleaned)

        var data any
        if err := json.Unmarshal([]byte(cleaned), &data); err != nil {
                // Common failure mode: Gemini returns truncated JSON (cut mid-object).
                // Try a best-effort repair by dropping the last partial correction object and
                // closing the top-level structure.
                if repaired, ok := repairProofreadJSON(cleaned); ok {
                        var data2 any
                        if err2 := json.Unmarshal([]byte(repaired), &data2); err2 == nil {
                                corrected, suggestions, changes, alternatives := extractFromInterface(data2)
                                ok2 := corrected != "" || len(suggestions) > 0 || len(changes) > 0 || len(alternatives) > 0
                                if ok2 {
                                        log.Printf("[PARSE-RECOVER] Repaired truncated JSON (len=%d -> %d)", len(cleaned), len(repaired))
                                        return corrected, suggestions, changes, alternatives, true
                                }
                        } else {
                                log.Printf("[PARSE-RECOVER-ERROR] Repair attempt JSON unmarshal failed: %v", err2)
                        }
                }

                // Don't log gigantic payloads; they can be large and contain user content.
                clipped := cleaned
                if len(clipped) > 600 {
                        clipped = clipped[:600] + "..."
                }
                log.Printf("[PARSE-ERROR] JSON unmarshal failed: %v, cleaned text: %q", err, clipped)
                return "", nil, nil, nil, false
        }

        corrected, suggestions, changes, alternatives := extractFromInterface(data)
        ok := corrected != "" || len(suggestions) > 0 || len(changes) > 0 || len(alternatives) > 0
        return corrected, suggestions, changes, alternatives, ok
}

// repairProofreadJSON tries to salvage a partially truncated JSON response by:
// - finding the "corrections" array
// - keeping only fully closed correction objects
// - closing the array and top-level object
// This is intentionally conservative: it may drop the final partial correction, but never invents content.
func repairProofreadJSON(cleaned string) (string, bool) {
        s := strings.TrimSpace(cleaned)
        if s == "" {
                return "", false
        }
        // Ensure we start at an object.
        if idx := strings.Index(s, "{"); idx >= 0 {
                s = s[idx:]
        } else {
                return "", false
        }
        // Must contain corrections array key.
        k := strings.Index(s, "\"corrections\"")
        if k < 0 {
                return "", false
        }
        // Find array open after the key.
        arrOpenRel := strings.Index(s[k:], "[")
        if arrOpenRel < 0 {
                return "", false
        }
        arrOpen := k + arrOpenRel

        // Scan inside the array to find the last fully closed object boundary.
        inString := false
        escaped := false
        braceDepth := 0
        startedObj := false
        lastGoodEnd := -1
        for i := arrOpen + 1; i < len(s); i++ {
                ch := s[i]
                if inString {
                        if escaped {
                                escaped = false
                                continue
                        }
                        if ch == '\\' {
                                escaped = true
                                continue
                        }
                        if ch == '"' {
                                inString = false
                        }
                        continue
                }
                // not in string
                if ch == '"' {
                        inString = true
                        continue
                }
                if ch == '{' {
                        braceDepth++
                        startedObj = true
                        continue
                }
                if ch == '}' && braceDepth > 0 {
                        braceDepth--
                        if braceDepth == 0 && startedObj {
                                lastGoodEnd = i
                        }
                        continue
                }
        }
        if lastGoodEnd < 0 {
            return "", false
        }

        // Keep array content up to the end of the last fully closed object.
        inside := strings.TrimSpace(s[arrOpen+1 : lastGoodEnd+1])
        inside = strings.TrimRight(inside, ", \n\r\t")

        // Rebuild minimal JSON shape.
        out := s[:arrOpen+1] + inside + "]"
        if !strings.Contains(out, "\"corrected_text\"") {
                out += ",\"corrected_text\":\"\""
        }
        out += "}"
        return out, true
}
func extractCorrectedTextBestEffort(raw string) (string, bool) {
        cleaned := stripCodeFence(raw)
        idx := strings.Index(cleaned, "\"corrected_text\"")
        if idx < 0 {
                return "", false
        }
        // Find ':' after the key
        colon := strings.Index(cleaned[idx:], ":")
        if colon < 0 {
                return "", false
        }
        colonAbs := idx + colon + 1
        // Skip spaces
        for colonAbs < len(cleaned) && (cleaned[colonAbs] == ' ' || cleaned[colonAbs] == '\n' || cleaned[colonAbs] == '\t' || cleaned[colonAbs] == '\r') {
                colonAbs++
        }
        if colonAbs >= len(cleaned) || cleaned[colonAbs] != '"' {
                return "", false
        }
        start := colonAbs + 1
        // Scan for next unescaped quote
        escaped := false
        for i := start; i < len(cleaned); i++ {
                ch := cleaned[i]
                if escaped {
                        escaped = false
                        continue
                }
                if ch == '\\' {
                        escaped = true
                        continue
                }
                if ch == '"' {
                        // Try to unescape using json.Unmarshal on a JSON string literal
                        lit := cleaned[start:i]
                        var out string
                        if err := json.Unmarshal([]byte("\""+lit+"\""), &out); err == nil {
                                return out, strings.TrimSpace(out) != ""
                        }
                        // fallback: return raw slice
                        return lit, strings.TrimSpace(lit) != ""
                }
        }
        // Unterminated string: take remainder and try to decode by appending quote
        lit := strings.TrimSpace(cleaned[start:])
        lit = strings.TrimRight(lit, "}\n\r\t ")
        var out string
        if err := json.Unmarshal([]byte("\""+lit+"\""), &out); err == nil {
                return out, strings.TrimSpace(out) != ""
        }
        return lit, strings.TrimSpace(lit) != ""
}

func extractFromInterface(v any) (string, []Suggestion, []Change, []string) {
        switch value := v.(type) {
        case map[string]any:
                var corrected string
                var suggestions []Suggestion
                var changes []Change
                var alternatives []string

                for k, val := range value {
                        lower := strings.ToLower(k)
                        switch lower {
                        case "corrected_text", "correctedtext", "proofread_text", "proofreadtext":
                                if s, ok := val.(string); ok && s != "" {
                                        corrected = s
                                }
                        case "suggestions":
                                if parsed, ok := toSuggestionSlice(val); ok {
                                        suggestions = append(suggestions, parsed...)
                                }
                        case "corrections":
                                if parsed, ok := toSuggestionSlice(val); ok {
                                        suggestions = append(suggestions, parsed...)
                                }
                        case "changes":
                                if parsed, ok := toChangeSlice(val); ok {
                                        changes = append(changes, parsed...)
                                }
                        case "alternatives", "alternative_sentences":
                                if parsed, ok := toStringSlice(val); ok {
                                        alternatives = append(alternatives, parsed...)
                                }
                        default:
                                subCorrected, subSuggestions, subChanges, subAlternatives := extractFromInterface(val)
                                if corrected == "" {
                                        corrected = subCorrected
                                }
                                suggestions = append(suggestions, subSuggestions...)
                                changes = append(changes, subChanges...)
                                alternatives = append(alternatives, subAlternatives...)
                        }
                }

                return corrected, suggestions, changes, alternatives
        case []any:
                var corrected string
                var suggestions []Suggestion
                var changes []Change
                var alternatives []string
                for _, item := range value {
                        subCorrected, subSuggestions, subChanges, subAlternatives := extractFromInterface(item)
                        if corrected == "" {
                                corrected = subCorrected
                        }
                        suggestions = append(suggestions, subSuggestions...)
                        changes = append(changes, subChanges...)
                        alternatives = append(alternatives, subAlternatives...)
                }
                return corrected, suggestions, changes, alternatives
        default:
                return "", nil, nil, nil
        }
}

func toSuggestionSlice(val any) ([]Suggestion, bool) {
        array, ok := val.([]any)
        if !ok {
                return nil, false
        }

        suggestions := make([]Suggestion, 0, len(array))
        for _, item := range array {
                obj, ok := item.(map[string]any)
                if !ok {
                        continue
                }

                suggestion := Suggestion{}
                if v, ok := getStringInsensitive(obj, "original"); ok {
                        suggestion.Original = v
                } else if v, ok := getStringInsensitive(obj, "originaltext"); ok {
                        suggestion.Original = v
                }
                if v, ok := getStringInsensitive(obj, "corrected"); ok {
                        suggestion.Corrected = v
                } else if v, ok := getStringInsensitive(obj, "correction"); ok {
                        suggestion.Corrected = v
                }
                if v, ok := getStringInsensitive(obj, "reason"); ok {
                        suggestion.Reason = v
                }
                if v, ok := getStringInsensitive(obj, "type"); ok {
                        suggestion.Type = v
                } else if v, ok := getStringInsensitive(obj, "error_type"); ok {
                        suggestion.Type = v
                }
                if v, ok := getIntInsensitive(obj, "start_index"); ok {
                        suggestion.StartIndex = v
                }
                if v, ok := getIntInsensitive(obj, "end_index"); ok {
                        suggestion.EndIndex = v
                }
                // FILTER RULE: Only include suggestions where original ≠ corrected (as per Gemini prompt rule #7)
                if suggestion.Original != "" && suggestion.Corrected != "" && suggestion.Original != suggestion.Corrected {
                        suggestions = append(suggestions, suggestion)
                }
        }

        return suggestions, len(suggestions) > 0
}

func toChangeSlice(val any) ([]Change, bool) {
        array, ok := val.([]any)
        if !ok {
                return nil, false
        }

        changes := make([]Change, 0, len(array))
        for _, item := range array {
                obj, ok := item.(map[string]any)
                if !ok {
                        continue
                }

                change := Change{}
                if v, ok := getStringInsensitive(obj, "original"); ok {
                        change.Original = v
                }
                if v, ok := getStringInsensitive(obj, "corrected"); ok {
                        change.Corrected = v
                }
                if v, ok := getIntInsensitive(obj, "position"); ok {
                        change.Position = v
                }
                changes = append(changes, change)
        }

        return changes, len(changes) > 0
}

func toStringSlice(val any) ([]string, bool) {
        array, ok := val.([]any)
        if !ok {
                return nil, false
        }

        result := make([]string, 0, len(array))
        for _, item := range array {
                if s, ok := item.(string); ok && s != "" {
                        result = append(result, s)
                }
        }
        return result, len(result) > 0
}

func getStringInsensitive(m map[string]any, key string) (string, bool) {
        for k, v := range m {
                if strings.EqualFold(k, key) {
                        s, ok := v.(string)
                        return s, ok
                }
        }
        return "", false
}

func getIntInsensitive(m map[string]any, key string) (int, bool) {
        for k, v := range m {
                if strings.EqualFold(k, key) {
                        switch val := v.(type) {
                        case float64:
                                return int(val), true
                        case int:
                                return val, true
                        }
                }
        }
        return 0, false
}

func sanitizeUserInput(text string) string {
        lower := strings.ToLower(text)
        for _, phrase := range promptInjectionPhrases {
                if strings.Contains(lower, phrase) {
                        return strings.ReplaceAll(text, phrase, "")
                }
        }
        return text
}

func (s *LLMService) proofreadWithOpenAI(ctx context.Context, cleaned string, requestID string) (*ProofreadResult, error) {
        start := time.Now()
        if s.openAIClient == nil {
                return nil, &ProviderError{Provider: "openai", Message: "OpenAI client not configured", Retryable: false}
        }
        model := getEnvTrim("OPENAI_PROOFREAD_MODEL", "gpt-4.1-mini")

        sys := "You are a Tamil Proofreading Assistant. Return ONLY valid JSON (no markdown)."
        user := strings.Replace(proofreadingPrompt, "[USER'S TAMIL TEXT HERE]", cleaned, 1)

        req := openai.ChatCompletionRequest{
                Model:       model,
                Temperature: 0.1,
                Messages: []openai.ChatCompletionMessage{
                        {Role: openai.ChatMessageRoleSystem, Content: sys},
                        {Role: openai.ChatMessageRoleUser, Content: user},
                },
        }

        resp, err := s.openAIClient.CreateChatCompletion(ctx, req)
        if err != nil {
                var apiErr *openai.APIError
                if errors.As(err, &apiErr) {
                        return nil, &ProviderError{
                                Provider:   "openai",
                                StatusCode: apiErr.HTTPStatusCode,
                                Message:    apiErr.Message,
                                Retryable:  apiErr.HTTPStatusCode == 429 || apiErr.HTTPStatusCode >= 500,
                        }
                }
                return nil, &ProviderError{Provider: "openai", Message: err.Error(), Retryable: true}
        }
        if len(resp.Choices) == 0 {
                return nil, &ProviderError{Provider: "openai", Message: "no choices returned", Retryable: true}
        }

        content := resp.Choices[0].Message.Content
        corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(content)
        if !ok {
                return nil, &ProviderError{Provider: "openai", Message: "failed to parse JSON", Retryable: true}
        }
        if corrected == "" {
                corrected = cleaned
        }
        if len(suggestions) == 0 && corrected != cleaned {
                suggestions = detectChangesFromText(cleaned, corrected)
        }
        suggestions = fillSuggestionIndices(cleaned, suggestions)

        return &ProofreadResult{
                CorrectedText:  corrected,
                Suggestions:    suggestions,
                Changes:        changes,
                Alternatives:   alternatives,
                ModelUsed:      models.ModelType(model),
                ProcessingTime: time.Since(start).Seconds(),
        }, nil
}

func (s *LLMService) proofreadWithAnthropic(ctx context.Context, cleaned string, requestID string) (*ProofreadResult, error) {
        start := time.Now()
        if strings.TrimSpace(s.anthropicKey) == "" {
                return nil, &ProviderError{Provider: "anthropic", Message: "Anthropic API key not configured", Retryable: false}
        }
        model := getEnvTrim("ANTHROPIC_PROOFREAD_MODEL", "claude-3-7-sonnet-latest")

        content, err := CallAnthropicProofread(ctx, cleaned, model, s.anthropicKey)
        if err != nil {
                return nil, err
        }
        corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(content)
        if !ok {
                return nil, &ProviderError{Provider: "anthropic", Message: "failed to parse JSON", Retryable: true}
        }
        if corrected == "" {
                corrected = cleaned
        }
        if len(suggestions) == 0 && corrected != cleaned {
                suggestions = detectChangesFromText(cleaned, corrected)
        }
        suggestions = fillSuggestionIndices(cleaned, suggestions)

        return &ProofreadResult{
                CorrectedText:  corrected,
                Suggestions:    suggestions,
                Changes:        changes,
                Alternatives:   alternatives,
                ModelUsed:      models.ModelType(model),
                ProcessingTime: time.Since(start).Seconds(),
        }, nil
}

// ProofreadText is the main method called by handlers - wraps Proofread for backward compatibility
func (s *LLMService) ProofreadText(ctx context.Context, text string, wordCount int, includeAlternatives bool, requestID string, maxOutputTokensCap int) (*ProofreadResult, error) {
	// Latency-first path used by the homepage/demo submit (save_draft=false).
	// Avoid the multi-provider fallback pipeline here; it's better to be fast.
	return s.ProofreadWithGoogle(ctx, text, requestID, includeAlternatives, maxOutputTokensCap)
}
