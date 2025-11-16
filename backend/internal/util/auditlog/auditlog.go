package auditlog

import (
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type Level string

const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

var maskedKeys = map[string]struct{}{
	"email":        {},
	"user_email":   {},
	"token":        {},
	"refreshToken": {},
	"password":     {},
}

func maskValue(key string, value any) any {
	if _, ok := maskedKeys[strings.ToLower(key)]; !ok {
		return value
	}
	if str, ok := value.(string); ok {
		if len(str) <= 4 {
			return "***"
		}
		return str[:2] + strings.Repeat("*", len(str)-4) + str[len(str)-2:]
	}
	return "***"
}

func logEntry(entry map[string]any) {
	encoded, err := json.Marshal(entry)
	if err != nil {
		log.Printf("audit_log_error: %v", err)
		return
	}
	log.Printf("audit_log %s", encoded)
}

func Log(c *gin.Context, level Level, event string, meta map[string]any) {
	entry := map[string]any{
		"ts":         time.Now().UTC().Format(time.RFC3339Nano),
		"level":      level,
		"event":      event,
		"request_id": getRequestID(c),
		"ip":         c.ClientIP(),
		"user_id":    c.GetUint("user_id"),
		"path":       c.FullPath(),
		"method":     c.Request.Method,
	}

	for k, v := range meta {
		entry[k] = maskValue(k, v)
	}

	logEntry(entry)
}

func Info(c *gin.Context, event string, meta map[string]any) {
	Log(c, LevelInfo, event, meta)
}

func Warn(c *gin.Context, event string, meta map[string]any) {
	Log(c, LevelWarn, event, meta)
}

func Error(c *gin.Context, event string, meta map[string]any) {
	Log(c, LevelError, event, meta)
}

func LogStandalone(level Level, event, requestID string, meta map[string]any) {
	entry := map[string]any{
		"ts":         time.Now().UTC().Format(time.RFC3339Nano),
		"level":      level,
		"event":      event,
		"request_id": requestID,
	}

	for k, v := range meta {
		entry[k] = maskValue(k, v)
	}

	logEntry(entry)
}

func getRequestID(c *gin.Context) string {
	if v, ok := c.Get("request_id"); ok {
		if id, ok := v.(string); ok {
			return id
		}
	}
	return ""
}
