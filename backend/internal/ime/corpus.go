package ime

import (
	"context"
	"database/sql"
	"log"
	"strings"
)

// CorpusResult represents a word from the corpus database
type CorpusResult struct {
	TamilWord        string
	LatinEquivalent  string
	Frequency        int
	Mode             string
}

// queryCorpus searches the corpus_words table for transliteration candidates.
// Returns corpus-based candidates sorted by frequency (higher = better).
func (s *Service) queryCorpus(ctx context.Context, latinInput, mode string, limit int) ([]Candidate, error) {
	if s.db == nil {
		log.Printf("[CORPUS] No database connection, skipping corpus query")
		return nil, nil
	}

	// Normalize input for case-insensitive matching
	latinInput = strings.ToLower(strings.TrimSpace(latinInput))
	if latinInput == "" {
		return nil, nil
	}

	// Query corpus_words table
	// Match on exact latin_equivalent (case-insensitive)
	// Filter by mode (or 'all' mode which matches everything)
	// Order by frequency DESC (most common words first)
	query := `
		SELECT tamil_word, latin_equivalent, frequency, mode
		FROM corpus_words
		WHERE LOWER(latin_equivalent) = $1
		AND (mode = $2 OR mode = 'all')
		ORDER BY frequency DESC, tamil_word ASC
		LIMIT $3
	`

	rows, err := s.db.QueryContext(ctx, query, latinInput, mode, limit)
	if err != nil {
		// Database error - log but don't fail (fallback to Aksharamukha)
		log.Printf("[CORPUS] Query error for input=%q mode=%s: %v", latinInput, mode, err)
		return nil, err
	}
	defer rows.Close()

	var cands []Candidate
	for rows.Next() {
		var result CorpusResult
		if err := rows.Scan(&result.TamilWord, &result.LatinEquivalent, &result.Frequency, &result.Mode); err != nil {
			log.Printf("[CORPUS] Row scan error: %v", err)
			continue
		}

		// Calculate score based on frequency
		// Base score: 5.0 (higher than Aksharamukha's 1.0)
		// Bonus: +0.001 per frequency point (so freq=1000 adds +1.0)
		// This ensures corpus results always rank higher than Aksharamukha
		score := 5.0 + (float64(result.Frequency) / 1000.0)

		cands = append(cands, Candidate{
			Word:       result.TamilWord,
			Score:      score,
			Source:     "corpus",
			RankReason: "corpus_verified",
		})
	}

	if err := rows.Err(); err != nil {
		log.Printf("[CORPUS] Rows iteration error: %v", err)
		return nil, err
	}

	if len(cands) > 0 {
		log.Printf("[CORPUS] Found %d candidates for input=%q mode=%s", len(cands), latinInput, mode)
	}

	return cands, nil
}

// queryCorpusPhrases searches the corpus_phrases table for multi-word transliterations.
// This is useful for common phrases like "vanakkam eppadi irukinga"
func (s *Service) queryCorpusPhrases(ctx context.Context, latinInput, mode string, limit int) ([]Candidate, error) {
	if s.db == nil {
		return nil, nil
	}

	latinInput = strings.ToLower(strings.TrimSpace(latinInput))
	if latinInput == "" || !strings.Contains(latinInput, " ") {
		return nil, nil // Only query phrases if input has spaces
	}

	query := `
		SELECT tamil_phrase, latin_equivalent, frequency, mode
		FROM corpus_phrases
		WHERE LOWER(latin_equivalent) = $1
		AND (mode = $2 OR mode = 'all')
		ORDER BY frequency DESC, tamil_phrase ASC
		LIMIT $3
	`

	rows, err := s.db.QueryContext(ctx, query, latinInput, mode, limit)
	if err != nil {
		log.Printf("[CORPUS_PHRASE] Query error for input=%q mode=%s: %v", latinInput, mode, err)
		return nil, err
	}
	defer rows.Close()

	var cands []Candidate
	for rows.Next() {
		var tamilPhrase, latinEq, phraseMode string
		var freq int
		if err := rows.Scan(&tamilPhrase, &latinEq, &freq, &phraseMode); err != nil {
			log.Printf("[CORPUS_PHRASE] Row scan error: %v", err)
			continue
		}

		// Phrases get even higher score since they're more specific
		score := 10.0 + (float64(freq) / 1000.0)

		cands = append(cands, Candidate{
			Word:       tamilPhrase,
			Score:      score,
			Source:     "corpus_phrase",
			RankReason: "phrase_match",
		})
	}

	if len(cands) > 0 {
		log.Printf("[CORPUS_PHRASE] Found %d phrase candidates for input=%q mode=%s", len(cands), latinInput, mode)
	}

	return cands, nil
}
