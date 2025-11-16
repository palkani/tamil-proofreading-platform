package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
)

type securityEventTracker struct {
	mu       sync.Mutex
	records  map[string][]time.Time
	limit    int
	window   time.Duration
	event    string
	logLevel auditlog.Level
}

func newSecurityEventTracker(limit int, window time.Duration, event string, level auditlog.Level) *securityEventTracker {
	return &securityEventTracker{
		records:  make(map[string][]time.Time),
		limit:    limit,
		window:   window,
		event:    event,
		logLevel: level,
	}
}

func (t *securityEventTracker) record(c *gin.Context, key string, meta map[string]any) {
	if t.limit <= 0 {
		return
	}

	now := time.Now()

	t.mu.Lock()
	defer t.mu.Unlock()

	timestamps := t.records[key]
	filtered := timestamps[:0]
	for _, ts := range timestamps {
		if now.Sub(ts) < t.window {
			filtered = append(filtered, ts)
		}
	}

	filtered = append(filtered, now)
	t.records[key] = filtered

	if len(filtered) >= t.limit {
		switch t.logLevel {
		case auditlog.LevelWarn:
			auditlog.Warn(c, t.event, meta)
		case auditlog.LevelError:
			auditlog.Error(c, t.event, meta)
		default:
			auditlog.Info(c, t.event, meta)
		}
		t.records[key] = filtered[:0]
	}
}

func SecurityMonitoring(threshold int, window time.Duration) gin.HandlerFunc {
	if threshold <= 0 {
		threshold = 5
	}
	if window <= 0 {
		window = 5 * time.Minute
	}

	failedLoginTracker := newSecurityEventTracker(threshold, window, "security.failed_login", auditlog.LevelWarn)
	forbiddenTracker := newSecurityEventTracker(threshold, window, "security.forbidden_repeat", auditlog.LevelWarn)
	spikeTracker := newSecurityEventTracker(threshold*5, window, "security.traffic_spike", auditlog.LevelWarn)

	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		latency := time.Since(start)

		meta := map[string]any{
			"status":     status,
			"path":       c.FullPath(),
			"method":     c.Request.Method,
			"latency_ms": latency.Milliseconds(),
			"user_id":    c.GetUint("user_id"),
			"request_id": c.GetString("request_id"),
			"ip":         c.ClientIP(),
			"user_agent": sanitizeUserAgent(c.GetHeader("User-Agent")),
		}

		spikeTracker.record(c, "global", meta)

		switch {
		case status >= http.StatusInternalServerError:
			auditlog.Error(c, "http.server_error", meta)
		case status == http.StatusUnauthorized:
			auditlog.Warn(c, "http.unauthorized", meta)
			if strings.Contains(c.FullPath(), "/auth/login") {
				failedLoginTracker.record(c, c.ClientIP(), meta)
			}
		case status == http.StatusForbidden:
			auditlog.Warn(c, "http.forbidden", meta)
			forbiddenTracker.record(c, c.ClientIP(), meta)
		case status >= http.StatusBadRequest:
			auditlog.Warn(c, "http.client_error", meta)
		default:
			auditlog.Info(c, "http.request", meta)
		}
	}
}

func sanitizeUserAgent(ua string) string {
	if ua == "" {
		return ""
	}
	if len(ua) > 160 {
		return ua[:160]
	}
	return strings.Map(func(r rune) rune {
		if r < 32 || r == '"' {
			return -1
		}
		return r
	}, ua)
}


