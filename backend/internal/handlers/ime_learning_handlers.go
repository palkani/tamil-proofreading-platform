package handlers

import (
	"net/http"
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

	type Row struct {
		Selected string
		Prev     *string
		Mode     string
		Cnt      int64
	}
	var rows []Row

	// Aggregate all pending events. We delete them after a successful update to avoid double counting.
	if err := h.db.Model(&models.SuggestionAcceptEvent{}).
		Select("selected, prev, mode, COUNT(*) as cnt").
		Group("selected, prev, mode").
		Scan(&rows).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": "scan failed"})
		return
	}

	if len(rows) == 0 {
		c.JSON(http.StatusOK, gin.H{"ok": true, "processed": 0})
		return
	}

	processed := 0
	txErr := h.db.Transaction(func(tx *gorm.DB) error {
		for _, r := range rows {
			sel := strings.TrimSpace(r.Selected)
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
				if err := tx.Model(&models.TamilWord{}).
					Where("tamil_text = ?", sel).
					Updates(map[string]any{
						"frequency":      gorm.Expr("frequency + ?", r.Cnt),
						"user_confirmed": gorm.Expr("user_confirmed + ?", r.Cnt),
						"updated_at":     time.Now(),
					}).Error; err != nil {
					return err
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
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": "aggregation failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "processed": processed})
}


