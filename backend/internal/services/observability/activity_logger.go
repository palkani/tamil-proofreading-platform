package observability

import (
	"encoding/json"
	"log"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

// ActivityLogger writes user-action events to the activity_events table.
// Every meaningful moment in the product (login, register, logout, draft
// create/update/delete, AI request, suggestion accept/reject) fires
// exactly one row so the admin activity feed shows a live timeline.
//
// Kept separate from AILogger because these are different concerns:
// activity_events answers "what did users DO?", ai_requests answers
// "what did it COST and how did it PERFORM?". Both matter; they're
// consumed by different admin pages.
//
// Writes are async by design — Log fires a goroutine so the request
// path never waits on a DB insert. Non-fatal at every layer.
type ActivityLogger struct {
	db *gorm.DB
}

// NewActivityLogger constructs a logger bound to the given DB handle.
func NewActivityLogger(db *gorm.DB) *ActivityLogger {
	return &ActivityLogger{db: db}
}

// Log records an activity event. Fires a goroutine so callers never
// wait on the DB. Nil-safe — a nil logger drops the log silently
// (useful for tests that don't wire the full handler).
//
// metadata should be a small, JSON-serializable map. Anything nil or
// empty produces a `{}` payload in the row.
func (l *ActivityLogger) Log(userID uint, eventType models.ActivityEventType, metadata map[string]any) {
	if l == nil || l.db == nil {
		return
	}
	go l.doLog(userID, eventType, metadata)
}

// doLog is the synchronous implementation, exposed on the struct so a
// future batch-writer refactor can call this from a worker without
// changing the Log() surface.
func (l *ActivityLogger) doLog(userID uint, eventType models.ActivityEventType, metadata map[string]any) {
	metaJSON := "{}"
	if len(metadata) > 0 {
		if b, err := json.Marshal(metadata); err == nil {
			metaJSON = string(b)
		}
	}

	row := models.ActivityEvent{
		UserID:     userID,
		EventType:  eventType,
		Metadata:   metaJSON,
		OccurredAt: time.Now(),
	}

	if err := l.db.Create(&row).Error; err != nil {
		log.Printf("[ACTIVITY_LOG] Warning: failed to persist activity event (user=%d type=%s): %v", userID, eventType, err)
	}
}
