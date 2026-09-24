package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ShutdownMiddleware is the definitive "no Gemini spend" boundary.
//
// When enabled (Cloud Run env SHUTDOWN_MODE=true), it returns 503 for
// every AI-billing endpoint on the backend — proofreading submit, the
// re-analysis SSE stream, OCR upload, transliteration suggest that
// falls back to Gemini, the AI-content-writer, and new signups.
//
// The Express layer also runs a matching shutdownGuard middleware, but
// the backend gate is what actually stops spend: a scripted client
// that bypasses Vercel (e.g. hits api.prooftamil.com directly with a
// stale JWT) reaches this middleware before any Gemini call.
//
// Explicitly ALLOWED, so drafts stay readable and existing users can
// still sign in / out:
//
//   GET  /health
//   POST /api/v1/auth/login        (existing users)
//   POST /api/v1/auth/refresh
//   POST /api/v1/auth/logout
//   GET  /api/v1/auth/me
//   POST /api/v1/auth/supabase-token
//   GET  /api/v1/submissions            (drafts list)
//   GET  /api/v1/submissions/:id        (draft read — NOT the /stream sibling)
//   GET  /api/v1/billing/me             (so UI can hide upgrade CTAs)
//   All  /api/v1/admin/*                (operators can still investigate)
//
// Every other path either goes through the block list or returns 503
// via the default branch. Fail-CLOSED by design: a new endpoint added
// after the app is in shutdown mode is blocked until explicitly
// allow-listed here.
func ShutdownMiddleware(enabled bool) gin.HandlerFunc {
	if !enabled {
		// Cheap identity middleware — no allocations on the hot path.
		return func(c *gin.Context) { c.Next() }
	}

	return func(c *gin.Context) {
		method := c.Request.Method
		path := c.Request.URL.Path

		if shutdownAllows(method, path) {
			c.Next()
			return
		}

		// Match the Express shutdownGuard response shape so a client that
		// hits either surface parses one JSON contract.
		msg := "ProofTamil is winding down. AI proofreading, OCR and editing tools are disabled. Your drafts remain accessible at /drafts."
		if method == "POST" && (path == "/api/v1/auth/register" || path == "/api/v1/auth/social") {
			msg = "ProofTamil is winding down and is no longer accepting new signups."
		}
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"error":      "shutdown_mode",
			"message":    msg,
			"drafts_url": "/drafts",
		})
	}
}

// shutdownAllows returns true for paths that must keep working while
// the app is in wind-down mode. Kept as a straight-line function
// (rather than a slice of regexes) for readability and zero-alloc
// dispatch — this runs on every request.
func shutdownAllows(method, path string) bool {
	// Always allow health checks so Cloud Run / UptimeRobot keep working.
	if path == "/health" || path == "/api/v1/health" {
		return true
	}

	// CORS preflights — never billed, always allow.
	if method == "OPTIONS" {
		return true
	}

	// Auth: existing users can still sign in, refresh, log out, view
	// their profile, exchange Supabase tokens. Register + social are
	// blocked (new signups).
	if strings.HasPrefix(path, "/api/v1/auth/") {
		switch path {
		case "/api/v1/auth/login",
			"/api/v1/auth/refresh",
			"/api/v1/auth/logout",
			"/api/v1/auth/me",
			"/api/v1/auth/supabase-token":
			return true
		}
		// Everything else under /auth/ (register, social, forgot-password,
		// reset-password, otp/*) — blocked. Existing users don't need
		// them; new users can't sign up anyway.
		return false
	}

	// Admin surface stays fully open — operators need to investigate
	// during the wind-down (top users by spend, close-out reports).
	if strings.HasPrefix(path, "/api/v1/admin/") {
		return true
	}

	// Submissions (drafts): reads only. POST creates a new proofread
	// job (Gemini spend); PUT/PATCH re-analyzes. Only GETs pass.
	if strings.HasPrefix(path, "/api/v1/submissions") {
		return method == "GET"
	}

	// Billing read paths — let the client fetch the plan so the UI can
	// hide upgrade CTAs and cancellation still works.
	if path == "/api/v1/billing/me" || path == "/api/v1/billing/pricing" ||
		path == "/api/v1/billing/checkout-status" {
		return method == "GET"
	}

	// Blog GET — read-only, no Gemini cost, harmless.
	if strings.HasPrefix(path, "/api/v1/blog/") && method == "GET" {
		return true
	}

	// Internal service endpoints (X-Job-Secret; Express → Go bridge).
	// Left open so any late-in-flight AI log rows still land in
	// ai_requests during the ramp-down window.
	if strings.HasPrefix(path, "/api/v1/internal/") {
		return true
	}

	// Everything else — the AI/OCR/proofread endpoints, submissions
	// writes, transliterate/suggest, IME, ai-content-writer — is
	// blocked by default. Fail-CLOSED.
	return false
}
