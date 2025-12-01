package logger

import (
	"fmt"
	"log"
	"time"
)

func LogRequest(ip string, mode string, textLen int) {
	log.Printf("[REQUEST] ip=%s mode=%s length=%d", ip, mode, textLen)
}

func LogResponseTime(mode string, duration time.Duration) {
	durationMs := duration.Milliseconds()
	log.Printf("[RESPONSE] mode=%s duration_ms=%d", mode, durationMs)
}

func LogError(mode string, err error) {
	errorMsg := "unknown error"
	if err != nil {
		errorMsg = err.Error()
	}
	log.Printf("[ERROR] mode=%s error=%s", mode, errorMsg)
}

func LogAIError(mode string, errorType string, err error) {
	errorMsg := "unknown error"
	if err != nil {
		errorMsg = err.Error()
	}
	log.Printf("[ERROR] mode=%s type=%s error=%s", mode, errorType, errorMsg)
}

func LogRateLimitViolation(ip string) {
	log.Printf("[RATE_LIMIT_VIOLATION] ip=%s", ip)
}

func LogValidationError(ip string, field string, reason string) {
	log.Printf("[VALIDATION_ERROR] ip=%s field=%s reason=%s", ip, field, reason)
}

func LogInfo(message string) {
	log.Printf("[INFO] %s", message)
}

func LogDebug(format string, args ...interface{}) {
	log.Printf("[DEBUG] %s", fmt.Sprintf(format, args...))
}
