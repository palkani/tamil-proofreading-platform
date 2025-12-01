package translit

import (
        "math"
        "sort"
)

// levenshteinDistance calculates edit distance between two strings
func levenshteinDistance(a, b string) int {
        if len(a) == 0 {
                return len(b)
        }
        if len(b) == 0 {
                return len(a)
        }

        prev := make([]int, len(b)+1)
        curr := make([]int, len(b)+1)

        for j := 0; j <= len(b); j++ {
                prev[j] = j
        }

        for i := 1; i <= len(a); i++ {
                curr[0] = i
                for j := 1; j <= len(b); j++ {
                        cost := 0
                        if a[i-1] != b[j-1] {
                                cost = 1
                        }
                        curr[j] = min(
                                curr[j-1]+1,    // insertion
                                min(prev[j]+1,  // deletion
                                        prev[j-1]+cost), // substitution
                        )
                }
                prev, curr = curr, prev
        }

        return prev[len(b)]
}

func min(a, b int) int {
        if a < b {
                return a
        }
        return b
}

// fuzzyMatch finds best matches using Levenshtein distance
func fuzzyMatch(key string, allEntries []Entry, maxDistance int) []Entry {
        type scoredFuzzy struct {
                entry    Entry
                distance int
        }
        var matches []scoredFuzzy

        for _, entry := range allEntries {
                normalized := normalize(entry.Phonetic)
                distance := levenshteinDistance(key, normalized)
                if distance <= maxDistance {
                        matches = append(matches, scoredFuzzy{entry, distance})
                }
        }

        // Sort by distance ascending
        sort.Slice(matches, func(i, j int) bool {
                return matches[i].distance < matches[j].distance
        })

        // Return entries with best distances
        var result []Entry
        for _, m := range matches {
                result = append(result, m.entry)
        }
        return result
}

// getAllEntries returns all unique entries in the lexicon
func getAllEntries() []Entry {
        seen := make(map[string]bool)
        var result []Entry

        for _, entries := range exactMap {
                for _, entry := range entries {
                        key := entry.Tamil + "|" + entry.Phonetic
                        if !seen[key] {
                                seen[key] = true
                                result = append(result, entry)
                        }
                }
        }
        return result
}

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
                // Fallback: fuzzy match with Levenshtein distance
                // Allow up to 2 edits for words <= 6 chars, 3 for longer
                maxDist := 2
                if len(key) > 6 {
                        maxDist = 3
                }
                allEntries := getAllEntries()
                candidates = fuzzyMatch(key, allEntries, maxDist)
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

                // Boost score slightly if it's a close fuzzy match
                if simScore < 0.5 {
                        // For fuzzy matches, increase weight of frequency
                        finalScore = 0.5*simScore + 0.5*freqScore
                }

                scored = append(scored, scoredEntry{
                        entry: candidate,
                        score: finalScore,
                })
        }

        // Sort by score descending
        sort.Slice(scored, func(i, j int) bool {
                if math.Abs(scored[i].score-scored[j].score) < 0.01 {
                        // Tiebreaker: use frequency
                        return scored[i].entry.Frequency > scored[j].entry.Frequency
                }
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
