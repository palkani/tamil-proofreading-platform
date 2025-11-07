package nlp

import (
	"regexp"
	"strings"
	"unicode"
)

// TamilNLPService handles Tamil text preprocessing
type TamilNLPService struct{}

func NewTamilNLPService() *TamilNLPService {
	return &TamilNLPService{}
}

// CountWords counts words in Tamil text
// Tamil words are typically separated by spaces or specific punctuation
func (s *TamilNLPService) CountWords(text string) int {
	if text == "" {
		return 0
	}

	// Remove extra whitespace
	text = strings.TrimSpace(text)
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")

	// Split by spaces and filter empty strings
	words := strings.Fields(text)
	
	// Filter out pure punctuation
	wordCount := 0
	for _, word := range words {
		// Check if word contains at least one Tamil character or alphanumeric
		hasTamilOrAlpha := false
		for _, r := range word {
			if unicode.Is(unicode.Tamil, r) || unicode.IsLetter(r) || unicode.IsNumber(r) {
				hasTamilOrAlpha = true
				break
			}
		}
		if hasTamilOrAlpha {
			wordCount++
		}
	}

	return wordCount
}

// Tokenize splits Tamil text into tokens
func (s *TamilNLPService) Tokenize(text string) []string {
	text = strings.TrimSpace(text)
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	
	tokens := strings.Fields(text)
	result := []string{}
	
	for _, token := range tokens {
		// Remove punctuation at boundaries but keep it as separate tokens if needed
		token = strings.Trim(token, ".,;:!?()[]{}\"'")
		if token != "" {
			result = append(result, token)
		}
	}
	
	return result
}

// IsTamilText checks if the text contains Tamil characters
func (s *TamilNLPService) IsTamilText(text string) bool {
	for _, r := range text {
		if unicode.Is(unicode.Tamil, r) {
			return true
		}
	}
	return false
}

// CleanText removes extra whitespace and normalizes text
func (s *TamilNLPService) CleanText(text string) string {
	// Remove extra whitespace
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	text = strings.TrimSpace(text)
	return text
}

// Preprocess prepares text for LLM processing
func (s *TamilNLPService) Preprocess(text string) string {
	return s.CleanText(text)
}

