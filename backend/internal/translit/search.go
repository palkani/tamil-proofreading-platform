package translit

import (
        "math"
        "sort"
        "strings"
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

        // Common-word overrides for high-confidence everyday terms where
        // users expect Google-eTamil-style results.
        // NOTE: Keep these minimal and high-signal; they should only correct
        // clearly wrong/undesirable top results from the generic lexicon ranking.
        // Example: "therkku" (south) should prefer "தெற்கு" over "தெருக்கு".
        commonOverride := map[string]string{
                "therkku": "தெற்கு",
                "therku":  "தெற்கு",
                "therkk":  "தெற்கு", // user may pause before typing the last vowel
                // Very common function words
                "enna":    "என்ன",
                "namma":   "நம்ம",
                "enathu":  "எனது",
                "enadu":   "எனது",
                "enadhu":  "எனது",
        }
        if fixed, ok := commonOverride[key]; ok && fixed != "" {
                // Still include other results as fallback, but ensure the expected word is top.
                rest := GetSuggestionsFromKeyNoOverride(key)
                out := []Suggestion{{Word: fixed, Score: 1.01}}
                for _, s := range rest {
                        if s.Word == fixed {
                                continue
                        }
                        // Drop very low-confidence tail suggestions for longer inputs.
                        if len(key) >= 4 && s.Score < 0.45 {
                                continue
                        }
                        out = append(out, s)
                        if len(out) >= 10 {
                                break
                        }
                }
                return out
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
                phon := normalize(candidate.Phonetic)
                // Phonetic similarity score (0-1)
                simScore := phoneticSimilarity(key, phon)

                // Frequency score (0-1)
                freqScore := float64(candidate.Frequency) / float64(maxFreq)

                // Rank principle: "perfect/close phonetic match" must beat generic high-frequency short words.
                // This makes inputs like "enna" prefer "என்ன" over "என".
                dist := levenshteinDistance(key, phon)
                lenDelta := len(key) - len(phon)
                if lenDelta < 0 {
                        lenDelta = -lenDelta
                }

                // High-signal quality gate:
                // For longer inputs, drop candidates that are just a short prefix of the key.
                // These often produce partial/invalid outputs (e.g., "enathu" -> "எநா", "எநாம்").
                // Keep exact/prefix hits only when the phonetic is close in length.
                if len(key) >= 5 && phon != "" && strings.HasPrefix(key, phon) {
                        // Allow near-complete prefixes (off by <= 1) to support "pause before last vowel".
                        if (len(key) - len(phon)) >= 2 {
                                continue
                        }
                }

                // Filter obvious low-quality matches for longer inputs.
                // This helps ensure we show meaningful words for inputs like "enathu".
                if len(key) >= 6 {
                        if dist > 2 && simScore < 0.55 {
                                continue
                        }
                } else if len(key) >= 4 {
                        if dist > 3 && simScore < 0.45 {
                                continue
                        }
                }
                // Similarity-dominant score with small frequency influence
                finalScore := 0.85*simScore + 0.15*freqScore
                // Penalize edit distance + length mismatch (helps avoid short common words ranking too high)
                finalScore -= 0.08 * float64(dist)
                finalScore -= 0.03 * float64(lenDelta)
                // Strong boost for exact phonetic match (ensures exact match is at the top)
                if phon == key {
                        finalScore += 0.60
                }
                if finalScore < 0 {
                        finalScore = 0
                }
                if finalScore > 1.5 {
                        finalScore = 1.5
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

	// Filter out low-quality/meaningless suggestions for longer inputs.
	// Keep this permissive to avoid returning only 1 suggestion.
	suggestions = filterByRelativeScore(key, suggestions)

        // Return top 10 (ranked; UI can choose how many to display)
        if len(suggestions) > 10 {
                suggestions = suggestions[:10]
        }

        return suggestions
}

// GetSuggestionsFromKeyNoOverride runs the normal lexicon-based scoring without
// applying the commonOverride map above. This avoids recursion when we prepend
// an override candidate.
func GetSuggestionsFromKeyNoOverride(key string) []Suggestion {
        // key is assumed normalized + non-empty
        var candidates []Entry

        if entries, exists := exactMap[key]; exists {
                candidates = entries
        } else if entries, exists := prefixMap[key]; exists {
                candidates = entries
        } else {
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

        type scoredEntry struct {
                entry Entry
                score float64
        }
        var scored []scoredEntry
        for _, candidate := range candidates {
                phon := normalize(candidate.Phonetic)
                simScore := phoneticSimilarity(key, phon)
                freqScore := float64(candidate.Frequency) / float64(maxFreq)
                dist := levenshteinDistance(key, phon)
                lenDelta := len(key) - len(phon)
                if lenDelta < 0 {
                        lenDelta = -lenDelta
                }

                if len(key) >= 6 {
                        if dist > 2 && simScore < 0.55 {
                                continue
                        }
                } else if len(key) >= 4 {
                        if dist > 3 && simScore < 0.45 {
                                continue
                        }
                }

                finalScore := 0.85*simScore + 0.15*freqScore
                finalScore -= 0.08 * float64(dist)
                finalScore -= 0.03 * float64(lenDelta)
                if phon == key {
                        finalScore += 0.60
                }
                if finalScore < 0 {
                        finalScore = 0
                }
                if finalScore > 1.5 {
                        finalScore = 1.5
                }
                scored = append(scored, scoredEntry{entry: candidate, score: finalScore})
        }

        sort.Slice(scored, func(i, j int) bool {
                if math.Abs(scored[i].score-scored[j].score) < 0.01 {
                        return scored[i].entry.Frequency > scored[j].entry.Frequency
                }
                return scored[i].score > scored[j].score
        })

        var suggestions []Suggestion
        for _, s := range scored {
                suggestions = append(suggestions, Suggestion{Word: s.entry.Tamil, Score: s.score})
        }
        suggestions = deduplicateSuggestions(suggestions)
        suggestions = filterByRelativeScore(key, suggestions)
        if len(suggestions) > 5 {
                suggestions = suggestions[:10]
        }
        return suggestions
}

// filterByRelativeScore drops the "long tail" of low-confidence suggestions.
// This is intentionally conservative and only kicks in for longer Latin inputs,
// where users expect meaningful Tamil words rather than fuzzy near-misses.
func filterByRelativeScore(key string, suggestions []Suggestion) []Suggestion {
        if len(suggestions) == 0 {
                return suggestions
        }
        if len(key) < 4 {
                return suggestions
        }

        top := suggestions[0].Score
	// Absolute floor (more permissive for low-frequency words)
	absMin := 0.35
	if len(key) >= 6 {
		absMin = 0.45
	}
	// Relative floor vs top score
	relMin := top * 0.5
        if relMin < absMin {
                relMin = absMin
        }

        out := make([]Suggestion, 0, len(suggestions))
        for i, s := range suggestions {
                // Always keep the top suggestion.
                if i == 0 {
                        out = append(out, s)
                        continue
                }
                if s.Score >= relMin {
                        out = append(out, s)
                }
        }
        // Never return empty if we had at least one candidate.
        if len(out) == 0 {
                return suggestions[:1]
        }
        return out
}
