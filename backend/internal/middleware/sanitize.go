package middleware

import (
	"html"
	"strings"

	"github.com/gin-gonic/gin"
)

// SanitizeInput sanitizes user input to prevent XSS attacks
func SanitizeInput() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Sanitize query parameters
		for key, values := range c.Request.URL.Query() {
			sanitized := make([]string, len(values))
			for i, v := range values {
				sanitized[i] = html.EscapeString(strings.TrimSpace(v))
			}
			c.Request.URL.Query()[key] = sanitized
		}

		c.Next()
	}
}

// SanitizeString sanitizes a string input
func SanitizeString(input string) string {
	// Remove null bytes and escape HTML
	input = strings.ReplaceAll(input, "\x00", "")
	input = html.EscapeString(strings.TrimSpace(input))
	return input
}

