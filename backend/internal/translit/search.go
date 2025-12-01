package translit

import (
	"sort"
)

func GetSuggestions(input string) []Suggestion {
	mu.RLock()
	defer mu.RUnlock()

	key := normalize(input)
	if key == "" {
		return []Suggestion{}
	}

	var candidates []Entry

	// Try exact match first
	if entries, exists := exactMap[key]; exists {
		candidates = entries
	} else if entries, exists := prefixMap[key]; exists {
		// Try prefix match
		candidates = entries
	} else {
		// No match found
		return []Suggestion{}
	}

	if len(candidates) == 0 {
		return []Suggestion{}
	}

	// Compute scores for each candidate
	type scoredEntry struct {
		entry Entry
		score float64
	}

	var scored []scoredEntry

	for _, candidate := range candidates {
		// Phonetic similarity score (0-1)
		simScore := phoneticSimilarity(key, normalize(candidate.Phonetic))

		// Frequency score (0-1)
		freqScore := float64(candidate.Frequency) / float64(maxFreq)

		// Combined score: 70% similarity, 30% frequency
		finalScore := 0.7*simScore + 0.3*freqScore

		scored = append(scored, scoredEntry{
			entry: candidate,
			score: finalScore,
		})
	}

	// Sort by score descending
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	// Convert to suggestions and deduplicate
	var suggestions []Suggestion
	for _, s := range scored {
		suggestions = append(suggestions, Suggestion{
			Word:  s.entry.Tamil,
			Score: s.score,
		})
	}

	suggestions = deduplicateSuggestions(suggestions)

	// Return top 5
	if len(suggestions) > 5 {
		suggestions = suggestions[:5]
	}

	return suggestions
}
