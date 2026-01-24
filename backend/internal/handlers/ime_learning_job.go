package handlers

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// startIMEAggregateJob runs aggregation periodically inside the backend, without external schedulers.
//
// IMPORTANT:
// - On Cloud Run, instances can scale to zero. To ensure this job runs regularly, set **min instances = 1**
//   for the backend service.
// - Multiple instances can run in parallel; we use a Postgres advisory lock to avoid double-processing.
func (h *Handlers) startIMEAggregateJob() {
	if h == nil || h.db == nil {
		return
	}
	mins := getEnvInt("IME_AGGREGATE_INTERVAL_MINUTES", 0)
	if mins <= 0 {
		return
	}
	// Only safe with Postgres advisory locks; otherwise skip.
	if h.db.Dialector == nil || h.db.Dialector.Name() != "postgres" {
		log.Printf("[IME-AGGREGATE] disabled: db dialect=%v (requires postgres)", func() string {
			if h.db.Dialector == nil {
				return ""
			}
			return h.db.Dialector.Name()
		}())
		return
	}

	interval := time.Duration(mins) * time.Minute
	log.Printf("[IME-AGGREGATE] enabled: interval=%s", interval)

	go func() {
		// Small delay after startup so DB is ready under cold starts
		time.Sleep(20 * time.Second)

		runOnce := func() {
			locked, err := tryAdvisoryLock(h.db, 991187041222) // stable lock key
			if err != nil {
				log.Printf("[IME-AGGREGATE] lock error: %v", err)
				return
			}
			if !locked {
				// Another instance is doing it
				return
			}
			defer func() { _ = advisoryUnlock(h.db, 991187041222) }()

			start := time.Now()
			n, err := h.aggregateIMEAccepts()
			if err != nil {
				log.Printf("[IME-AGGREGATE] failed: %v", err)
				return
			}
			log.Printf("[IME-AGGREGATE] ok processed=%d duration_ms=%d", n, time.Since(start).Milliseconds())
		}

		// Run immediately, then on schedule
		runOnce()
		t := time.NewTicker(interval)
		defer t.Stop()
		for range t.C {
			runOnce()
		}
	}()
}

func getEnvInt(key string, dflt int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return dflt
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return dflt
	}
	return n
}

func tryAdvisoryLock(db *gorm.DB, key int64) (bool, error) {
	var ok bool
	if err := db.Raw("SELECT pg_try_advisory_lock(?)", key).Scan(&ok).Error; err != nil {
		return false, err
	}
	return ok, nil
}

func advisoryUnlock(db *gorm.DB, key int64) error {
	var ok bool
	return db.Raw("SELECT pg_advisory_unlock(?)", key).Scan(&ok).Error
}


