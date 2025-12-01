package translit

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
	"unicode"
)

type Entry struct {
	Tamil     string `json:"tam"`
	Phonetic  string `json:"eng"`
	Frequency int    `json:"freq"`
}

type Suggestion struct {
	Word  string  `json:"word"`
	Score float64 `json:"score"`
}

var (
	exactMap  map[string][]Entry
	prefixMap map[string][]Entry
	maxFreq   int
	mu        sync.RWMutex
)

func init() {
	exactMap = make(map[string][]Entry)
	prefixMap = make(map[string][]Entry)
}

func normalize(s string) string {
	// Convert to lowercase and trim spaces
	s = strings.ToLower(strings.TrimSpace(s))
	
	// Remove any non-alphanumeric characters except spaces
	var result strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			result.WriteRune(r)
		}
	}
	
	return result.String()
}

func LoadLexicon(filePath string) error {
	mu.Lock()
	defer mu.Unlock()

	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	var entries []Entry
	if err := json.Unmarshal(data, &entries); err != nil {
		return err
	}

	// Reset maps
	exactMap = make(map[string][]Entry)
	prefixMap = make(map[string][]Entry)
	maxFreq = 0

	// Process entries
	for _, entry := range entries {
		normalized := normalize(entry.Phonetic)
		if normalized == "" {
			continue
		}

		// Track max frequency for scoring
		if entry.Frequency > maxFreq {
			maxFreq = entry.Frequency
		}

		// Add to exact map
		exactMap[normalized] = append(exactMap[normalized], entry)

		// Add to prefix map (all prefixes)
		for i := 1; i <= len(normalized); i++ {
			prefix := normalized[:i]
			prefixMap[prefix] = append(prefixMap[prefix], entry)
		}
	}

	// If maxFreq is 0, set it to 1 to avoid division by zero
	if maxFreq == 0 {
		maxFreq = 1
	}

	return nil
}

func phoneticSimilarity(key, phonetic string) float64 {
	if key == phonetic {
		return 1.0
	}

	// Common prefix length based similarity
	commonLen := 0
	for i := 0; i < len(key) && i < len(phonetic); i++ {
		if key[i] == phonetic[i] {
			commonLen++
		} else {
			break
		}
	}

	maxLen := len(key)
	if len(phonetic) > maxLen {
		maxLen = len(phonetic)
	}

	if maxLen == 0 {
		return 0.0
	}

	return float64(commonLen) / float64(maxLen)
}

func deduplicateSuggestions(suggestions []Suggestion) []Suggestion {
	seen := make(map[string]bool)
	var result []Suggestion

	for _, s := range suggestions {
		if !seen[s.Word] {
			seen[s.Word] = true
			result = append(result, s)
		}
	}

	return result
}
