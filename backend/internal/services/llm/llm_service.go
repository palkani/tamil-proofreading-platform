package llm

import (
        "context"
        "encoding/json"
        "errors"
        "fmt"
        "log"
        "os"
        "strings"
        "time"

        "tamil-proofreading-platform/backend/internal/models"
        "tamil-proofreading-platform/backend/internal/services/nlp"

        openai "github.com/sashabaranov/go-openai"
)

type LLMService struct {
        openAIClient *openai.Client
        googleAPIKey string
        anthropicKey string
        nlpService   *nlp.TamilNLPService
}

type ProofreadResult struct {
        CorrectedText  string           `json:"corrected_text"`
        Suggestions    []Suggestion     `json:"suggestions"`
        Changes        []Change         `json:"changes"`
        Alternatives   []string         `json:"alternatives"`
        ModelUsed      models.ModelType `json:"model_used"`
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
        
        // Use flash-lite for short, simple texts (faster response)
        if charCount < 200 || wordCount < 50 {
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
        case charCount < 600 && wordCount < 120:
                return 1024
        case charCount < 2000 && wordCount < 400:
                return 2048
        default:
                return 4096
        }
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

func (s *LLMService) ProofreadWithGoogle(ctx context.Context, text string, requestID string, includeAlternatives bool) (*ProofreadResult, error) {
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

        // Use the Gemini API with the selected model
        content, err := CallGeminiProofread(cleaned, string(selectedModel), s.googleAPIKey, maxTokens)
        if err != nil {
                log.Printf("gemini proofread error (request_id=%s): %v", requestID, err)
                return nil, err
        }

        if strings.TrimSpace(content) == "" {
                return nil, fmt.Errorf("empty response from Gemini")
        }

        corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(content)
        if !ok {
                log.Printf("failed to parse gemini response (request_id=%s): %s", requestID, content)
                return nil, fmt.Errorf("failed to parse Gemini response")
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
                ModelUsed:      selectedModel,
                ProcessingTime: time.Since(start).Seconds(),
        }, nil
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

        // Default to Gemini 1.5 Flash for lower latency; allow override.
        geminiModel := getEnvTrim("GEMINI_PROOFREAD_MODEL", "gemini-1.5-flash")
        content, err := CallGeminiProofread(cleaned, geminiModel, s.googleAPIKey, maxTokens)
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
                return nil, fmt.Errorf("failed to parse Gemini response")
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
                ModelUsed:      models.ModelType(geminiModel),
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
                log.Printf("[PARSE-ERROR] JSON unmarshal failed: %v, cleaned text: %q", err, cleaned)
                return "", nil, nil, nil, false
        }

        corrected, suggestions, changes, alternatives := extractFromInterface(data)
        ok := corrected != "" || len(suggestions) > 0 || len(changes) > 0 || len(alternatives) > 0
        return corrected, suggestions, changes, alternatives, ok
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
func (s *LLMService) ProofreadText(ctx context.Context, text string, wordCount int, includeAlternatives bool, requestID string) (*ProofreadResult, error) {
        return s.Proofread(ctx, text, requestID)
}
