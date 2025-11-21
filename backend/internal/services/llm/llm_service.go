package llm

import (
        "bytes"
        "context"
        "encoding/json"
        "errors"
        "fmt"
        "io"
        "log"
        "net/http"
        "regexp"
        "strings"
        "time"
        "unicode"

        "tamil-proofreading-platform/backend/internal/models"
        "tamil-proofreading-platform/backend/internal/services/nlp"

        openai "github.com/sashabaranov/go-openai"
)

type LLMService struct {
        openAIClient *openai.Client
        googleAPIKey string
        httpClient   *http.Client
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

func NewLLMService(openAIKey, googleKey string, nlpService *nlp.TamilNLPService) *LLMService {
        cleanedKey := strings.TrimSpace(openAIKey)
        var client *openai.Client
        if cleanedKey != "" {
                client = openai.NewClient(cleanedKey)
        }

        return &LLMService{
                openAIClient: client,
                googleAPIKey: strings.TrimSpace(googleKey),
                httpClient:   &http.Client{Timeout: 20 * time.Second},
                nlpService:   nlpService,
        }
}

var promptInjectionPhrases = []string{
        "ignore previous instructions",
        "disregard earlier directives",
        "you are now",
        "system prompt",
        "developer message",
        "forget the previous",
}

var restrictedContentPatterns = []*regexp.Regexp{
        regexp.MustCompile(`(?i)\b(?:bomb|explosive|weapon|assassinate|suicide)\b`),
        regexp.MustCompile(`(?i)\b(?:porn|nude|sexual assault)\b`),
}

const maxEstimatedTokens = 4000

func sanitizeUserInput(text string) string {
        if text == "" {
                return text
        }

        builder := strings.Builder{}
        builder.Grow(len(text))
        for _, r := range text {
                if r == '\n' || r == '\t' || (r >= 32 && !unicode.IsControl(r)) {
                        builder.WriteRune(r)
                }
        }

        normalized := builder.String()
        return strings.Join(strings.FieldsFunc(normalized, func(r rune) bool {
                return r == '\r'
        }), " ")
}

func estimateTokens(wordCount int) int {
        if wordCount <= 0 {
                return 0
        }
        return wordCount * 4
}

func containsRestrictedContent(text string) bool {
        for _, pattern := range restrictedContentPatterns {
                if pattern.MatchString(text) {
                        return true
                }
        }
        return false
}

func detectPromptInjection(text string) bool {
        lower := strings.ToLower(text)
        for _, phrase := range promptInjectionPhrases {
                if strings.Contains(lower, phrase) {
                        return true
                }
        }
        return false
}

func (s *LLMService) validateInput(text string, wordCount int, requestID string) error {
        if detectPromptInjection(text) {
                log.Printf("prompt injection detected (request_id=%s)", requestID)
                return errors.New("input rejected by security policy")
        }

        lower := strings.ToLower(text)
        if containsRestrictedContent(lower) {
                log.Printf("restricted content detected (request_id=%s)", requestID)
                return errors.New("content violates usage policy")
        }

        if estimateTokens(wordCount) > maxEstimatedTokens {
                return fmt.Errorf("text is too long for processing (request_id=%s)", requestID)
        }

        return nil
}

func (s *LLMService) ProofreadText(ctx context.Context, text string, wordCount int, includeAlternatives bool, requestID string) (*ProofreadResult, error) {
        start := time.Now()
        if err := s.validateInput(text, wordCount, requestID); err != nil {
                return nil, err
        }

        cleaned := s.nlpService.Preprocess(text)
        cleaned = sanitizeUserInput(cleaned)
        prompt := s.createProofreadingPrompt(cleaned, includeAlternatives)

        if s.googleAPIKey != "" {
                if content, err := s.invokeGoogle(ctx, prompt); err == nil && strings.TrimSpace(content) != "" {
                        return s.buildResult(content, cleaned, start), nil
                } else if err != nil {
                        log.Printf("google proofread error (request_id=%s): %v", requestID, err)
                }
        }

        if s.openAIClient == nil {
                return nil, errors.New("no LLM provider available (Google attempt failed and OpenAI key not configured)")
        }

        content, err := s.invokeOpenAI(ctx, prompt)
        if err != nil {
                return nil, err
        }

        return s.buildResult(content, cleaned, start), nil
}

func (s *LLMService) createProofreadingPrompt(text string, includeAlternatives bool) string {
	base := `You are an expert Tamil Proofreading Assistant.

Your job is to carefully analyze the given Tamil text (multiple sentences or paragraphs) and produce detailed corrections.

For every mistake you find, you must identify:
- The original text (word or phrase)
- The corrected version
- A clear Tamil explanation of the correction
- The type of the issue: "grammar", "spelling", "punctuation", or "suggestion"

### VERY IMPORTANT RULES:
- Respond ONLY in Tamil.
- Preserve the original meaning.
- Do NOT rewrite entire sentences unless a correction is needed.
- Return ONLY the corrections found (no duplicates).
- Each correction must be precise and explain the linguistic rule.
- Keep output as clean JSON — **strict format** below.
- If no corrections, return an empty list.

### STRICT OUTPUT FORMAT (MANDATORY):
{
    "success": true,
    "corrections": [
        {
            "originalText": "",
            "correction": "",
            "reason": "",
            "type": ""
        }
    ]
}

### FIELD DEFINITIONS:
- "originalText": The exact incorrect Tamil word or phrase.
- "correction": The corrected form.
- "reason": A short but clear Tamil explanation (grammatical rule, spelling rule, sandhi rule, etc.)
- "type": One of the following:
     - "grammar"
     - "spelling"
     - "punctuation"
     - "suggestion"

### INPUT TEXT:
%s`
	return fmt.Sprintf(base, text)
}

FIND THESE ERRORS:
1. Incomplete verbs (words ending in -ற்ற, -த at sentence end need completion)
2. Spelling (wrong vowels, consonants, gemination)
3. Case markers (missing -ஐ, -க்கு, -ஆல், -இன், -இல்)
4. Subject-verb agreement mismatch
5. Sandhi errors (வல்லினம் மிகம், உயிரெழுத்து விதிகள்)

Return ONLY valid JSON. No markdown or extra text.

CRITICAL: Find and correct EVERY error. Do not miss obvious mistakes.

SPELLING DETECTION (AGGRESSIVE):
1. Double letter consonants (ட/ண்ட): Verify correct gemination in words
2. Vowel length errors: ஆ vs அ, ஈ vs இ, ஊ vs உ, ஏ vs எ, ஓ vs ஒ
3. Word ending suffixes: Words ending in -த, -ம், -ன், -ல் must match gender/number
4. Incorrect consonant usage: ற vs ர, ட vs த, ண vs ந
5. Vowel sign placement: ு vs ு் placements and correct usage
6. Doubled letters at word endings: Words like "அமைந்தத" (incorrect) should be "அமைந்த" (correct)

VERBAL & GRAMMATICAL ERRORS (MUST CATCH):
7. **Verb suffix errors**: 
   - Words ending in -த: Check if it's past tense, perfect, or attribute form (ஆன், அற்ற, உணர்வ், ஆனவ்)
   - Words ending in -ம்: Imperative and other forms must match verb root
   - Example: "அமைந்தத" is WRONG (extra உ sound) → Should be "அமைந்த" (past tense of அமைய்)

8. **INCOMPLETE VERB FORMS (CRITICAL)**:
   - Words ending in -ற்ற (like நடைபெற்ற, நடந்த, வந்த) MUST be checked for context
   - If -ற்ற form appears at END OF SENTENCE without a noun to modify: ERROR (should have -ற்றன/-ற்றது/-ற்ற நிலை)
   - If -ற்ற form appears before a noun: OK (attribute form modifying the noun)
   - Example ERRORS:
     * "நடைபெற்ற" (at end of sentence alone) → Wrong (incomplete)
     * Should be: "நடைபெற்றன" (they happened) OR "நடைபெற்றது" (it happened) OR "நடைபெற்ற நிலை" (the state that happened)
   - Watch for: வந்த, சென்ற, நடந்த, செய்த, பார்த்த, கொண்ட, இருந்த at sentence end without completion

9. **Case markers (வேற்றுமை)**:
   - Nominative (எ): விடு
   - Accusative (ஐ): விடுக்கிறெ → விடுக்கிறாய் (check direct object)
   - Dative (க்கு): விடுக்க → விடுக்க్கு (recipient)
   - Instrumental (ஆல்): விடால் (by means of)
   - Genitive (இன்): விடুவினிய् (possessive)
   - Locative (இல்): விடையில् (place/time)
   - Ablative (இருंध्): விडुভिंध् (from/away)

10. **Subject-verb agreement**:
   - Masculine (ஆ): விडु் मास्क्यूलिन
   - Feminine (ஆள்): விডु् फेमिनिन
   - Neuter (उं): விडु் न्यूटर
   - Singular vs Plural agreement

11. **Verb conjugations & tenses**:
    - Present: -க్ఱ్ఱु (விดుक్ఱ్ఱు)
    - Past: -த् (విដుत్), -ఇ్ఇ (విడిసుష్ఠ్), -इनै (విడుইनై)
    - Future: -उ́m् (విడుఆఁ్)
    - Perfect: -అ్న్, अ्त्त, उணर्व्

11. **Word order violations**: Tamil is SOV - check Subject comes before Object before Verb

12. **Particle errors**: உ్, ఓ, ఏ, ఆ్, केఖ్ usage

13. **Postposition errors**: Verify postpositions with correct case markers

CONTEXTUAL & STRUCTURAL ERRORS:
14. Vague pronouns (අ़్ட, ఇ్ట, अ્व) should be specific nouns
15. Incomplete sentences missing predicates
16. Contradictory or unclear meanings
17. Awkward phrasing that violates Tamil syntax
18. Run-on sentences needing breaks
19. Parallel structure violations in lists

PUNCTUATION & FORMATTING:
20. Missing punctuation at sentence ends
21. Incorrect spacing around punctuation
22. Multiple consecutive punctuation marks (!!!, ???)
23. Proper use of Tamil diacritics

FOR EACH ERROR FOUND - YOU MUST:
1. Specify "original": exact incorrect text
2. Provide "corrected": exact correct version  
3. Explain "reason": detailed explanation of error type and why it's wrong
4. Categorize "type": spelling, grammar (with subtype like "tense", "agreement", "case"), punctuation, clarity, style
` + (func() string {
                if includeAlternatives {
                        return `5. List 2-3 "alternatives": different correct ways to express the same meaning (if applicable)

ALTERNATIVE GENERATION RULES:
- Provide genuine alternative phrasings, not just case variations
- Use different word choices or structures where appropriate
- Ensure all alternatives are grammatically correct Tamil
- Include synonyms or stylistic variations for clarity improvements

Example: 
Original error: "அமைந்தத"
Corrected: "அமைந்த"
Alternatives: ["அமைந்ததை", "அமைந்த நிலை", "ஏற்பாடு செய்யப்பட்ட"]`
                }
                return ""
        })() + `

**OUTPUT FORMAT (MUST BE VALID JSON)**:
{
  "corrected_text": "full corrected text",
  "suggestions": [
    {
      "original": "error text",
      "corrected": "corrected text",
      "reason": "explanation",
      "type": "category"` + (func() string {
                if includeAlternatives {
                        return `,
      "alternatives": ["alt1", "alt2", "alt3"]`
                }
                return ""
        })() + `
    }
  ]
}

**QUALITY REQUIREMENTS**:
- Find EVERY error - do not miss any
- Provide SPECIFIC corrections with exact Tamil text
- Give CLEAR reasons for each correction
- For each error, list actual alternative phrasings if includeAlternatives is true
- Return valid JSON only - no markdown, no explanations outside JSON

Text to proofread: %s`
        return fmt.Sprintf(base, text)
}

func (s *LLMService) invokeGoogle(ctx context.Context, prompt string) (string, error) {
        if s.googleAPIKey == "" {
                return "", errors.New("google api key not configured")
        }

        payload := map[string]any{
                "contents": []map[string]any{
                        {
                                "parts": []map[string]string{
                                        {"text": prompt},
                                },
                        },
                },
        }

        body, err := json.Marshal(payload)
        if err != nil {
                return "", fmt.Errorf("google request marshal error: %w", err)
        }

        url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s", s.googleAPIKey)
        req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
        if err != nil {
                return "", fmt.Errorf("google request build error: %w", err)
        }
        req.Header.Set("Content-Type", "application/json")

        resp, err := s.httpClient.Do(req)
        if err != nil {
                return "", fmt.Errorf("google request error: %w", err)
        }
        defer resp.Body.Close()

        respBody, err := io.ReadAll(resp.Body)
        if err != nil {
                return "", fmt.Errorf("google read error: %w", err)
        }

        if resp.StatusCode < 200 || resp.StatusCode >= 300 {
                return "", fmt.Errorf("google error: status %d, response %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
        }

        var parsed struct {
                Candidates []struct {
                        Content struct {
                                Parts []struct {
                                        Text string `json:"text"`
                                } `json:"parts"`
                        } `json:"content"`
                } `json:"candidates"`
        }

        if err := json.Unmarshal(respBody, &parsed); err != nil {
                return "", fmt.Errorf("google response parse error: %w", err)
        }

        for _, candidate := range parsed.Candidates {
                for _, part := range candidate.Content.Parts {
                        if strings.TrimSpace(part.Text) != "" {
                                return strings.TrimSpace(stripCodeFence(part.Text)), nil
                        }
                }
        }

        return "", errors.New("google response contained no content")
}

func (s *LLMService) invokeOpenAI(ctx context.Context, prompt string) (string, error) {
        if s.openAIClient == nil {
                return "", errors.New("openai client not configured")
        }

        resp, err := s.openAIClient.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
                Model:       "gpt-4o-mini",
                Temperature: 0.2,
                MaxTokens:   1200,
                Messages: []openai.ChatCompletionMessage{
                        {Role: openai.ChatMessageRoleSystem, Content: "You are an expert Tamil proofreader. Return JSON."},
                        {Role: openai.ChatMessageRoleUser, Content: prompt},
                },
        })
        if err != nil {
                return "", fmt.Errorf("openai request error: %w", err)
        }

        if len(resp.Choices) == 0 {
                return "", errors.New("openai returned no choices")
        }

        return strings.TrimSpace(stripCodeFence(resp.Choices[0].Message.Content)), nil
}

func (s *LLMService) buildResult(content, cleaned string, start time.Time) *ProofreadResult {
        result := &ProofreadResult{
                ModelUsed:      models.ModelA,
                ProcessingTime: time.Since(start).Seconds(),
        }

        if corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(content); ok {
                if corrected != "" {
                        result.CorrectedText = corrected
                }
                if len(suggestions) > 0 {
                        result.Suggestions = suggestions
                }
                if len(changes) > 0 {
                        result.Changes = changes
                }
                if len(alternatives) > 0 {
                        result.Alternatives = alternatives
                }
        }

        if result.CorrectedText == "" {
                result.CorrectedText = content
        }

        if len(result.Suggestions) == 0 {
                result.Suggestions = s.extractSuggestions(cleaned, result.CorrectedText)
        }

        if len(result.Alternatives) == 0 && result.CorrectedText != "" {
                result.Alternatives = extractAlternativeSentences(cleaned, result.CorrectedText)
        }

        return result
}

func (s *LLMService) extractSuggestions(original, corrected string) []Suggestion {
        if original == corrected {
                return nil
        }

        return []Suggestion{
                {
                        Original:  original,
                        Corrected: corrected,
                        Reason:    "Text was corrected",
                        Type:      "general",
                },
        }
}

var codeFenceRegex = regexp.MustCompile("(?s)^```[a-zA-Z0-9]*\\s*(.*?)\\s*```$")

func stripCodeFence(input string) string {
        trimmed := strings.TrimSpace(input)
        if matches := codeFenceRegex.FindStringSubmatch(trimmed); len(matches) == 2 {
                return matches[1]
        }
        return trimmed
}

func parseProofreadJSON(raw string) (string, []Suggestion, []Change, []string, bool) {
        if raw == "" {
                return "", nil, nil, nil, false
        }

        var data any
        if err := json.Unmarshal([]byte(raw), &data); err != nil {
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
                // Support both old format (original/corrected) and new format (originalText/correction)
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
                if suggestion.Original != "" && suggestion.Corrected != "" {
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

func getStringInsensitive(m map[string]any, key string) (string, bool) {
        lowerKey := strings.ToLower(key)
        for k, v := range m {
                if strings.ToLower(k) == lowerKey {
                        if s, ok := v.(string); ok {
                                return s, true
                        }
                        if f, ok := v.(float64); ok {
                                return fmt.Sprintf("%v", f), true
                        }
                }
        }
        return "", false
}

func getIntInsensitive(m map[string]any, key string) (int, bool) {
        lowerKey := strings.ToLower(key)
        for k, v := range m {
                if strings.ToLower(k) == lowerKey {
                        switch val := v.(type) {
                        case float64:
                                return int(val), true
                        case int:
                                return val, true
                        case json.Number:
                                if i, err := val.Int64(); err == nil {
                                        return int(i), true
                                }
                        }
                }
        }
        return 0, false
}

func toStringSlice(val any) ([]string, bool) {
        switch v := val.(type) {
        case []any:
                res := make([]string, 0, len(v))
                for _, item := range v {
                        if s, ok := item.(string); ok && s != "" {
                                res = append(res, s)
                        }
                }
                return res, len(res) > 0
        case []string:
                return v, len(v) > 0
        case string:
                trimmed := strings.TrimSpace(v)
                if trimmed == "" {
                        return nil, false
                }
                return []string{trimmed}, true
        default:
                return nil, false
        }
}

func extractAlternativeSentences(original, proofread string) []string {
        if proofread == "" {
                return nil
        }

        suggestions := make([]string, 0, 2)

        if proofread != original {
                suggestions = append(suggestions, proofread)
        }

        proofSentences := splitSentences(proofread)
        for _, sentence := range proofSentences {
                trimmed := strings.TrimSpace(sentence)
                if trimmed != "" && trimmed != proofread {
                        suggestions = append(suggestions, trimmed)
                }
        }

        return uniqueStrings(suggestions)
}

func splitSentences(text string) []string {
        separators := []string{".", "?", "!", "\n"}
        result := []string{text}

        for _, sep := range separators {
                temp := make([]string, 0)
                for _, chunk := range result {
                        parts := strings.Split(chunk, sep)
                        for _, part := range parts {
                                trimmed := strings.TrimSpace(part)
                                if trimmed != "" {
                                        temp = append(temp, trimmed+sep)
                                }
                        }
                }
                if len(temp) > 0 {
                        result = temp
                }
        }

        return result
}

func uniqueStrings(values []string) []string {
        seen := make(map[string]struct{}, len(values))
        unique := make([]string, 0, len(values))
        for _, v := range values {
                trimmed := strings.TrimSpace(v)
                if trimmed == "" {
                        continue
                }
                if _, exists := seen[trimmed]; exists {
                        continue
                }
                seen[trimmed] = struct{}{}
                unique = append(unique, trimmed)
        }
        return unique
}
