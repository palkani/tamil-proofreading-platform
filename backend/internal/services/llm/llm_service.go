package llm

import (
	"context"
	"encoding/json"
	"fmt"
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
	CorrectedText string                 `json:"corrected_text"`
	Suggestions   []Suggestion           `json:"suggestions"`
	Changes       []Change               `json:"changes"`
	ModelUsed     models.ModelType       `json:"model_used"`
	ProcessingTime float64               `json:"processing_time"`
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
	Original   string `json:"original"`
	Corrected  string `json:"corrected"`
	Position   int    `json:"position"`
}

func NewLLMService(apiKey string, nlpService *nlp.TamilNLPService) *LLMService {
	client := openai.NewClient(apiKey)
	return &LLMService{
		openAIClient: client,
		nlpService:   nlpService,
	}
}

// ProofreadText processes Tamil text through appropriate model
func (s *LLMService) ProofreadText(ctx context.Context, text string, wordCount int) (*ProofreadResult, error) {
	startTime := time.Now()

	// Determine which model to use
	modelType := s.selectModel(wordCount)
	modelName := s.getModelName(modelType)

	// Preprocess text
	cleanedText := s.nlpService.Preprocess(text)

	// Create prompt for proofreading
	prompt := s.createProofreadingPrompt(cleanedText)

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
			return s.proofreadWithFallback(ctx, cleanedText, wordCount)
		}
		return nil, fmt.Errorf("LLM API error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no response from LLM")
	}

	// Parse response
	result := &ProofreadResult{
		ModelUsed:     modelType,
		ProcessingTime: time.Since(startTime).Seconds(),
	}

	responseText := resp.Choices[0].Message.Content

	// Try to parse as JSON first (if structured response)
	var structuredResponse struct {
		CorrectedText string       `json:"corrected_text"`
		Suggestions   []Suggestion `json:"suggestions"`
		Changes       []Change     `json:"changes"`
	}

	if err := json.Unmarshal([]byte(responseText), &structuredResponse); err == nil {
		result.CorrectedText = structuredResponse.CorrectedText
		result.Suggestions = structuredResponse.Suggestions
		result.Changes = structuredResponse.Changes
	} else {
		// If not JSON, treat entire response as corrected text
		result.CorrectedText = responseText
		result.Suggestions = s.extractSuggestions(cleanedText, responseText)
	}

	return result, nil
}

func (s *LLMService) selectModel(wordCount int) models.ModelType {
	if wordCount < 500 {
		return models.ModelA
	}
	return models.ModelB
}

func (s *LLMService) getModelName(modelType models.ModelType) string {
	switch modelType {
	case models.ModelA:
		return openai.GPT3Dot5Turbo // Fast, cost-effective
	case models.ModelB:
		return openai.GPT4Turbo // More accurate, better understanding
	default:
		return openai.GPT3Dot5Turbo
	}
}

func (s *LLMService) getMaxTokens(wordCount int) int {
	// Estimate: Tamil text typically needs ~1.5x tokens compared to words
	// Add buffer for suggestions
	estimatedTokens := int(float64(wordCount) * 2.5)
	if estimatedTokens < 500 {
		return 500
	}
	if estimatedTokens > 4000 {
		return 4000
	}
	return estimatedTokens
}

func (s *LLMService) createProofreadingPrompt(text string) string {
	return fmt.Sprintf(`Please proofread the following Tamil text. Correct any grammatical errors, spelling mistakes, and improve style if needed. Preserve the original meaning and tone.

Return your response in JSON format with:
1. "corrected_text": The fully corrected text
2. "suggestions": Array of suggestions with original, corrected, reason, type, and positions
3. "changes": Array of all changes made

Tamil text to proofread:
%s

Respond in JSON format only.`, text)
}

func (s *LLMService) proofreadWithFallback(ctx context.Context, text string, wordCount int) (*ProofreadResult, error) {
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
					Content: s.createProofreadingPrompt(text),
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

	result := &ProofreadResult{
		ModelUsed: models.ModelB,
		CorrectedText: resp.Choices[0].Message.Content,
	}

	return result, nil
}

func (s *LLMService) extractSuggestions(original, corrected string) []Suggestion {
	// Simple diff-based suggestion extraction
	// In production, use a proper diff algorithm
	suggestions := []Suggestion{}
	
	if original != corrected {
		suggestions = append(suggestions, Suggestion{
			Original:  original,
			Corrected: corrected,
			Reason:    "Text was corrected",
			Type:      "general",
		})
	}
	
	return suggestions
}

