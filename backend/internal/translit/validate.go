package translit

import (
	"strings"
	"unicode"
)

// Tamil Unicode block (U+0B80–U+0BFF): letters, vowel signs, virama, digits.
// We allow Tamil script and common punctuation (space, pulli is inside Tamil block).
const (
	tamilLo = 0x0B80
	tamilHi = 0x0BFF
)

// IsValidTamilWord returns true if s is non-empty, contains no Latin/ASCII letters,
// and every rune is in the Tamil Unicode block (or space for multi-word).
func IsValidTamilWord(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	for _, r := range s {
		if r == ' ' {
			continue
		}
		if r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' {
			return false // Latin leakage
		}
		if r < tamilLo || r > tamilHi {
			return false
		}
	}
	return true
}

// IsValidSuggestion returns true if the suggestion has a valid Tamil word and a sane score.
func IsValidSuggestion(s Suggestion) bool {
	if !IsValidTamilWord(s.Word) {
		return false
	}
	// Score can be 0..2 in practice (overrides use 1.01)
	if s.Score < 0 || s.Score > 10 {
		return false
	}
	return true
}

// ValidateSuggestions filters out invalid suggestions and deduplicates by Word
// (keeps first occurrence, preserving order). Returns a new slice.
func ValidateSuggestions(suggestions []Suggestion) []Suggestion {
	if len(suggestions) == 0 {
		return suggestions
	}
	seen := make(map[string]bool)
	out := make([]Suggestion, 0, len(suggestions))
	for _, s := range suggestions {
		if !IsValidSuggestion(s) {
			continue
		}
		norm := strings.TrimSpace(s.Word)
		if seen[norm] {
			continue
		}
		seen[norm] = true
		out = append(out, Suggestion{Word: norm, Score: s.Score})
	}
	return out
}

// ValidateTamilString returns true if the string is composed only of Tamil script
// and spaces (no digits or symbols from other blocks). Used for strict display checks.
func ValidateTamilString(s string) bool {
	for _, r := range s {
		if r == ' ' || r == '\n' || r == '\t' {
			continue
		}
		if !unicode.Is(unicode.Tamil, r) {
			return false
		}
	}
	return true
}
