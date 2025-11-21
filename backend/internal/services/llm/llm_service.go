package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/nlp"

	openai "github.com/sashabaranov/go-openai"
)

type LLMService struct {
	openAIClient *openai.Client
	googleAPIKey string
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

func (s *LLMService) ProofreadWithGoogle(ctx context.Context, text string, requestID string, includeAlternatives bool) (*ProofreadResult, error) {
	start := time.Now()

	if text == "" {
		return nil, errors.New("empty text provided")
	}

	if strings.TrimSpace(text) == "" {
		return &ProofreadResult{
			CorrectedText: text,
			Suggestions:   []Suggestion{},
			ModelUsed:     models.ModelGoogle,
			ProcessingTime: time.Since(start).Seconds(),
		}, nil
	}

	cleaned := s.nlpService.Preprocess(text)
	cleaned = sanitizeUserInput(cleaned)

	// Use the Gemini API directly with the clean prompt
	content, err := CallGeminiProofread(cleaned, "gemini-2.5-flash")
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

	return &ProofreadResult{
		CorrectedText:  corrected,
		Suggestions:    suggestions,
		Changes:        changes,
		Alternatives:   alternatives,
		ModelUsed:      models.ModelGoogle,
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
			ModelUsed:     models.ModelGoogle,
			ProcessingTime: time.Since(start).Seconds(),
		}, nil
	}

	cleaned := s.nlpService.Preprocess(text)
	cleaned = sanitizeUserInput(cleaned)

	// Try Google Gemini first
	if s.googleAPIKey != "" {
		content, err := CallGeminiProofread(cleaned, "gemini-2.5-flash")
		if err == nil && strings.TrimSpace(content) != "" {
			corrected, suggestions, changes, alternatives, ok := parseProofreadJSON(content)
			if ok {
				if corrected == "" {
					corrected = cleaned
				}
				return &ProofreadResult{
					CorrectedText:  corrected,
					Suggestions:    suggestions,
					Changes:        changes,
					Alternatives:   alternatives,
					ModelUsed:      models.ModelGoogle,
					ProcessingTime: time.Since(start).Seconds(),
				}, nil
			}
		} else if err != nil {
			log.Printf("google proofread error (request_id=%s): %v", requestID, err)
		}
	}

	// Fallback to OpenAI
	if s.openAIClient == nil {
		return nil, errors.New("no LLM provider available")
	}

	return nil, errors.New("LLM service not available")
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

	cleaned := stripCodeFence(raw)

	var data any
	if err := json.Unmarshal([]byte(cleaned), &data); err != nil {
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
