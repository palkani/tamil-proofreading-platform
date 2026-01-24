package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
)

// InternalJobSecretMiddleware authorizes internal scheduled jobs (e.g., Cloud Scheduler)
// using a shared secret header.
//
// This avoids needing an interactive admin login for cron-like tasks.
//
// Env: IME_AGGREGATE_SECRET should be a long random string.
// Client: send header "X-Job-Secret: <secret>"
func InternalJobSecretMiddleware(secret string) gin.HandlerFunc {
	secret = strings.TrimSpace(secret)
	return func(c *gin.Context) {
		if secret == "" {
			auditlog.Warn(c, "job_secret.missing_config", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "job secret not configured"})
			c.Abort()
			return
		}

		got := strings.TrimSpace(c.GetHeader("X-Job-Secret"))
		if got == "" {
			auditlog.Warn(c, "job_secret.missing_header", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing job secret"})
			c.Abort()
			return
		}

		if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
			auditlog.Warn(c, "job_secret.invalid", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid job secret"})
			c.Abort()
			return
		}

		c.Next()
	}
}


