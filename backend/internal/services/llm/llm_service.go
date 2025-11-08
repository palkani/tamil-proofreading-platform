package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/nlp"

	"github.com/sashabaranov/go-openai"
)

type LLMService struct {
	openAIClient *openai.Client
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
	Type       string `json:"type"` // grammar, spelling, style, etc.
	StartIndex int    `json:"start_index"`
	EndIndex   int    `json:"end_index"`
}

type Change struct {
	Original  string `json:"original"`
	Corrected string `json:"corrected"`
	Position  int    `json:"position"`
}

func NewLLMService(apiKey string, nlpService *nlp.TamilNLPService) *LLMService {
	var client *openai.Client
	cleanedKey := strings.TrimSpace(apiKey)
	lowerKey := strings.ToLower(cleanedKey)

	if cleanedKey != "" && !strings.HasPrefix(lowerKey, "your-") && !strings.Contains(lowerKey, "changeme") {
		client = openai.NewClient(cleanedKey)
	}
	return &LLMService{
		openAIClient: client,
		nlpService:   nlpService,
	}
}

// ProofreadText processes Tamil text through appropriate model
func (s *LLMService) ProofreadText(ctx context.Context, text string, wordCount int, includeAlternatives bool) (*ProofreadResult, error) {
	startTime := time.Now()

	// Check if OpenAI client is available (API key is set)
	if s.openAIClient == nil {
		return nil, fmt.Errorf("OpenAI API key is not configured")
	}

	// Determine which model to use
	modelType := s.selectModel(wordCount)
	modelName := s.getModelName(modelType)

	// Preprocess text
	cleanedText := s.nlpService.Preprocess(text)

	// Create prompt for proofreading
	prompt := s.createProofreadingPrompt(cleanedText, includeAlternatives)

	// Call OpenAI API
	resp, err := s.openAIClient.CreateChatCompletion(
		ctx,
		openai.ChatCompletionRequest{
			Model: modelName,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: "You are an expert Tamil language proofreader. Your task is to proofread Tamil text, correct grammatical errors, spelling mistakes, and improve style while preserving the original meaning and tone. Return the corrected text and provide suggestions for improvements in JSON format.",
				},
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
			Temperature: 0.3,
			MaxTokens:   s.getMaxTokens(wordCount),
		},
	)

	if err != nil {
		// Try fallback to Model B if Model A fails
		if modelType == models.ModelA {
			return s.proofreadWithFallback(ctx, cleanedText, wordCount, startTime, includeAlternatives)
		}
		return nil, fmt.Errorf("LLM API error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no response from LLM")
	}

	// Parse response
	result := &ProofreadResult{
		ModelUsed:      modelType,
		ProcessingTime: time.Since(startTime).Seconds(),
	}

	responseText := resp.Choices[0].Message.Content
	cleanedResponse := strings.TrimSpace(stripCodeFence(responseText))

	if corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(cleanedResponse); ok {
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
		result.CorrectedText = cleanedResponse
	}

	if len(result.Suggestions) == 0 {
		result.Suggestions = s.extractSuggestions(cleanedText, result.CorrectedText)
	}

	if len(result.Alternatives) == 0 && result.CorrectedText != "" {
		result.Alternatives = extractAlternativeSentences(cleanedText, result.CorrectedText)
	}

	return result, nil
}

func (s *LLMService) selectModel(wordCount int) models.ModelType {
	if wordCount <= 1200 {
		return models.ModelA
	}
	return models.ModelB
}

func (s *LLMService) getModelName(modelType models.ModelType) string {
	switch modelType {
	case models.ModelA:
		return "gpt-4o-mini" // Fast, cost-effective
	case models.ModelB:
		return "gpt-4o" // More accurate, better understanding
	default:
		return "gpt-4o-mini"
	}
}

func (s *LLMService) getMaxTokens(wordCount int) int {
	// Estimate: Tamil text typically needs ~1.5x tokens compared to words
	// Add buffer for suggestions
	estimatedTokens := int(float64(wordCount) * 2.5)
	if estimatedTokens < 500 {
		return 500
	}
	if estimatedTokens > 1500 {
		return 1500
	}
	return estimatedTokens
}

func (s *LLMService) createProofreadingPrompt(text string, includeAlternatives bool) string {
	base := `Act as a meticulous Tamil proofreader. Correct grammar, spelling, and style while keeping the meaning intact. Respond in compact JSON with: {"corrected_text": string, "suggestions": [{"original": string, "corrected": string, "reason": string}]`
	if includeAlternatives {
		base += `, "alternatives": [string]`
	}
	base += `}. Text: %s`
	return fmt.Sprintf(base, text)
}

func (s *LLMService) proofreadWithFallback(ctx context.Context, text string, wordCount int, startTime time.Time, includeAlternatives bool) (*ProofreadResult, error) {
	// Fallback to Model B
	modelName := s.getModelName(models.ModelB)

	resp, err := s.openAIClient.CreateChatCompletion(
		ctx,
		openai.ChatCompletionRequest{
			Model: modelName,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: "You are an expert Tamil language proofreader. Your task is to proofread Tamil text, correct grammatical errors, spelling mistakes, and improve style while preserving the original meaning and tone.",
				},
				{
					Role:    openai.ChatMessageRoleUser,
					Content: s.createProofreadingPrompt(text, includeAlternatives),
				},
			},
			Temperature: 0.3,
			MaxTokens:   s.getMaxTokens(wordCount),
		},
	)

	if err != nil {
		return nil, fmt.Errorf("LLM fallback error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no response from LLM fallback")
	}

	fallbackResponse := resp.Choices[0].Message.Content
	cleanedResponse := strings.TrimSpace(stripCodeFence(fallbackResponse))

	result := &ProofreadResult{
		ModelUsed: models.ModelB,
	}

	if corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(cleanedResponse); ok {
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
		result.CorrectedText = cleanedResponse
	}

	if len(result.Suggestions) == 0 {
		result.Suggestions = s.extractSuggestions(text, result.CorrectedText)
	}

	if len(result.Alternatives) == 0 && result.CorrectedText != "" {
		result.Alternatives = extractAlternativeSentences(text, result.CorrectedText)
	}

	return result, nil
}

func (s *LLMService) extractSuggestions(original, corrected string) []Suggestion {
	// Simple diff-based suggestion extraction
	// In production, use a proper diff algorithm
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
		}
		if v, ok := getStringInsensitive(obj, "corrected"); ok {
			suggestion.Corrected = v
		}
		if v, ok := getStringInsensitive(obj, "reason"); ok {
			suggestion.Reason = v
		}
		if v, ok := getStringInsensitive(obj, "type"); ok {
			suggestion.Type = v
		}
		if v, ok := getIntInsensitive(obj, "start_index"); ok {
			suggestion.StartIndex = v
		}
		if v, ok := getIntInsensitive(obj, "end_index"); ok {
			suggestion.EndIndex = v
		}
		suggestions = append(suggestions, suggestion)
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
