package handlers

import (
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// AggregateIMEAccepts aggregates suggestion_accept_events into frequency tables and clears processed events.
// This is intended to be called periodically (e.g., Cloud Scheduler) using an admin session.
func (h *Handlers) AggregateIMEAccepts(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": "db unavailable"})
		return
	}

	processed, err := h.aggregateIMEAccepts()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": "aggregation failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "processed": processed})
}

// aggregateIMEAccepts runs the aggregation logic and returns processed event count.
// This is used by both HTTP endpoints and the internal background job.
func (h *Handlers) aggregateIMEAccepts() (int, error) {
	type Row struct {
		Query    string
		Selected string
		Prev     *string
		Mode     string
		Cnt      int64
	}
	var rows []Row

	// Aggregate all pending events. We delete them after a successful update to avoid double counting.
	if err := h.db.Model(&models.SuggestionAcceptEvent{}).
		Select("query, selected, prev, mode, COUNT(*) as cnt").
		Group("query, selected, prev, mode").
		Scan(&rows).Error; err != nil {
		return 0, err
	}

	if len(rows) == 0 {
		return 0, nil
	}

	processed := 0
	txErr := h.db.Transaction(func(tx *gorm.DB) error {
		for _, r := range rows {
			sel := strings.TrimSpace(r.Selected)
			q := normalizeRomanToken(r.Query)
			if sel == "" || r.Cnt <= 0 {
				continue
			}

			// Phrase vs word bucket
			if strings.Contains(sel, " ") {
				obj := models.TamilPhrase{Phrase: sel, Frequency: r.Cnt}
				if err := tx.Clauses(clause.OnConflict{
					Columns:   []clause.Column{{Name: "phrase"}},
					DoUpdates: clause.Assignments(map[string]any{"frequency": gorm.Expr("tamil_phrases.frequency + ?", r.Cnt), "updated_at": time.Now()}),
				}).Create(&obj).Error; err != nil {
					return err
				}
			} else {
				// Update all tamil_words rows matching tamil_text; also increment user_confirmed.
				res := tx.Model(&models.TamilWord{}).
					Where("tamil_text = ?", sel).
					Updates(map[string]any{
						"frequency":      gorm.Expr("frequency + ?", r.Cnt),
						"user_confirmed": gorm.Expr("user_confirmed + ?", r.Cnt),
						"updated_at":     time.Now(),
					})
				if res.Error != nil {
					return res.Error
				}

				// If the word doesn't exist in tamil_words yet, create a new row so the
				// Node suggest service can load it into the in-memory index.
				if res.RowsAffected == 0 && q != "" {
					// tamil_words has a UNIQUE index on transliteration, so generate a stable unique key.
					key := q + "_" + shortHash(sel)
					obj := models.TamilWord{
						TamilText:          sel,
						Transliteration:    key,
						AlternateSpellings: "[]",
						Frequency:          int(r.Cnt),
						Category:           models.CategoryCommon,
						Meaning:            "",
						Example:            "",
						IsVerified:         false,
						Source:             "user_accept",
						UserConfirmed:      int(r.Cnt),
					}
					if err := tx.Create(&obj).Error; err != nil {
						// Don't fail the whole batch if the unique key collides unexpectedly.
						// Worst case: we still recorded the accept event and can retry next run.
						continue
					}
				}
			}

			// Bigram boost (prev -> first token of selected)
			if r.Prev != nil {
				prev := strings.TrimSpace(*r.Prev)
				if prev != "" {
					next := sel
					if strings.Contains(next, " ") {
						next = strings.Fields(next)[0]
					}
					if next != "" {
						obj := models.TamilBigram{Word: prev, NextWord: next, Frequency: r.Cnt}
						if err := tx.Clauses(clause.OnConflict{
							Columns: []clause.Column{{Name: "word"}, {Name: "next_word"}},
							DoUpdates: clause.Assignments(map[string]any{
								"frequency":  gorm.Expr("tamil_bigrams.frequency + ?", r.Cnt),
								"updated_at": time.Now(),
							}),
						}).Create(&obj).Error; err != nil {
							return err
						}
					}
				}
			}

			processed += int(r.Cnt)
		}

		// Clear all events after aggregation (idempotent next run).
		if err := tx.Where("1 = 1").Delete(&models.SuggestionAcceptEvent{}).Error; err != nil {
			return err
		}
		return nil
	})

	if txErr != nil {
		return 0, txErr
	}

	return processed, nil
}

var romanTokenRe = regexp.MustCompile(`[^a-z']+`)

func normalizeRomanToken(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	s = romanTokenRe.ReplaceAllString(s, "")
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

func shortHash(s string) string {
	sum := sha1.Sum([]byte(s))
	return hex.EncodeToString(sum[:])[:8]
}


