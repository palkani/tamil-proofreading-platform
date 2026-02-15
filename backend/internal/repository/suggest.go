package repository

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// ScoredWord is a Tamil suggestion with score and optional match type.
type ScoredWord struct {
	TamilText  string `json:"word"`
	Score      int64  `json:"score"`
	MatchType  string `json:"match_type,omitempty"`
}

// ValidationResult is one word's validation result from validate_tamil_words.
type ValidationResult struct {
	Word       string `json:"word"`
	IsValid    bool   `json:"is_valid"`
	Suggestion string `json:"suggestion,omitempty"`
}

// SuggestRepo calls Postgres RPCs for suggest/validate. Use *sql.DB from GORM's db.DB().
type SuggestRepo struct {
	db *sql.DB
}

// NewSuggestRepo returns a repository that uses the given *sql.DB (e.g. from gorm.DB.DB()).
func NewSuggestRepo(db *sql.DB) *SuggestRepo {
	if db == nil {
		return nil
	}
	return &SuggestRepo{db: db}
}

// Suggest calls suggest_tamil RPC with 50ms timeout. Returns up to limit suggestions.
func (r *SuggestRepo) Suggest(ctx context.Context, query string, limit int, prevWord string) ([]ScoredWord, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 50*time.Millisecond)
	defer cancel()

	q := strings.TrimSpace(strings.ToLower(query))
	if q == "" {
		return []ScoredWord{}, nil
	}
	if limit <= 0 {
		limit = 8
	}
	if limit > 20 {
		limit = 20
	}

	var prevArg interface{} = nil
	if prevWord != "" {
		prevArg = prevWord
	}

	rows, err := r.db.QueryContext(ctx,
		`SELECT tamil_text, score, match_type FROM suggest_tamil($1, $2, $3)`,
		q, limit, prevArg,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []ScoredWord
	for rows.Next() {
		var w ScoredWord
		var matchType sql.NullString
		if err := rows.Scan(&w.TamilText, &w.Score, &matchType); err != nil {
			continue
		}
		if matchType.Valid {
			w.MatchType = matchType.String
		}
		results = append(results, w)
	}
	return results, rows.Err()
}

// PredictNext calls predict_next_word RPC for next-word prediction (bigrams).
func (r *SuggestRepo) PredictNext(ctx context.Context, word string, limit int) ([]ScoredWord, error) {
	if r == nil || r.db == nil || word == "" {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Millisecond)
	defer cancel()
	if limit <= 0 {
		limit = 5
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT next_word, frequency FROM predict_next_word($1, $2)`,
		strings.TrimSpace(word), limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []ScoredWord
	for rows.Next() {
		var w ScoredWord
		if err := rows.Scan(&w.TamilText, &w.Score); err != nil {
			continue
		}
		results = append(results, w)
	}
	return results, rows.Err()
}

// ValidateWords calls validate_tamil_words RPC. Batch validation for grammar/spell check.
func (r *SuggestRepo) ValidateWords(ctx context.Context, words []string) ([]ValidationResult, error) {
	if r == nil || r.db == nil || len(words) == 0 {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()

	// Postgres TEXT[] literal: {"word1","word2"} with escaped quotes inside words
	quoted := make([]string, len(words))
	for i, w := range words {
		escaped := strings.ReplaceAll(w, `\`, `\\`)
		escaped = strings.ReplaceAll(escaped, `"`, `\"`)
		quoted[i] = `"` + escaped + `"`
	}
	arrParam := "{" + strings.Join(quoted, ",") + "}"

	rows, err := r.db.QueryContext(ctx,
		`SELECT word, is_valid, suggestion FROM validate_tamil_words($1::TEXT[])`,
		arrParam,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []ValidationResult
	for rows.Next() {
		var v ValidationResult
		var sugg sql.NullString
		if err := rows.Scan(&v.Word, &v.IsValid, &sugg); err != nil {
			continue
		}
		if sugg.Valid {
			v.Suggestion = sugg.String
		}
		results = append(results, v)
	}
	return results, rows.Err()
}
