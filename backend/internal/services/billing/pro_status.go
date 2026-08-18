package billing

import (
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

// AdminEmails is the single source of truth for the operator/admin
// allowlist across the Go backend. Every "is this a staff user?" check
// MUST use IsAdminEmail below — inline `email == "..."` chains have
// bitten us multiple times (one call site missed → the classic
// "admin sees Pro pill but hits Free daily limit" bug).
//
// Kept in sync with the Express-side ADMIN_ALLOWED_EMAILS env var
// (see express-frontend/middleware/admin.js). If you add or remove an
// entry here, update the env var in Vercel too.
var AdminEmails = []string{
	"palkani.r@gmail.com",
	"prooftamil@gmail.com",
	"banu.palkani@gmail.com",
	"contact@prooftamil.com",
}

// IsAdminEmail reports whether the given email is on the operator
// allowlist. Case-insensitive, whitespace-tolerant. Empty input → false.
func IsAdminEmail(email string) bool {
	if email == "" {
		return false
	}
	normalized := strings.ToLower(strings.TrimSpace(email))
	if normalized == "" {
		return false
	}
	for _, allowed := range AdminEmails {
		if normalized == allowed {
			return true
		}
	}
	return false
}

// IsUserPro returns true if the given user should be treated as Pro for
// feature-gating purposes. Consolidates the logic that previously lived
// inline in usage_today_handler.go (line 69-87) and mirrors what the
// frontend's /api/v1/billing/usage/today `is_pro` field returns.
//
// A user is Pro if ANY of these are true:
//
//  1. PremiumOverride flag set by an admin (grant or trial)
//  2. Role == "admin" (staff / internal accounts)
//  3. Email is on the operator allowlist (contact@, palkani.r@, etc.)
//  4. Subscription == "pro" AND SubscriptionEnd is still in the future
//     (or absent, meaning no explicit end date)
//
// Returns false if the user record can't be loaded (defensive — better
// to gate features off than to unlock paid features for a missing user).
//
// Used by:
//   - usage_today_handler.go            (Pro pill + quota display)
//   - submission_handlers.go            (word-limit + daily-token bypass)
//   - llm/llm_service.go selectOptimalModel (Pro-tier model routing)
//
// Every one of those places MUST use this function to answer "am I Pro?".
// Otherwise we get the pattern of one UI element saying Pro and another
// saying Free for the same user — a bug class we've hit multiple times.
func IsUserPro(db *gorm.DB, userID uint) bool {
	if db == nil || userID == 0 {
		return false
	}
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		return false
	}
	return IsUserRecordPro(&user)
}

// IsUserRecordPro is the pure predicate — same rules as IsUserPro but
// operates on an already-loaded User record. Preferred when the caller
// already has the user in memory (avoids a duplicate DB round-trip).
// Kept exported so tests and other services can share the logic.
func IsUserRecordPro(user *models.User) bool {
	if user == nil {
		return false
	}
	// PremiumOverride wins — an admin explicitly said "this user gets Pro".
	if user.PremiumOverride {
		return true
	}
	// Internal role / staff — never gated.
	if user.Role == models.RoleAdmin {
		return true
	}
	// Operator allowlist — single source of truth in AdminEmails
	// (defined above). Update AdminEmails to add/remove staff.
	if IsAdminEmail(user.Email) {
		return true
	}
	// Paid subscription. Basic + Enterprise both count as "Pro-tier"
	// for feature-gating (only the payment amount differs).
	switch user.Subscription {
	case models.PlanPro, models.PlanBasic, models.PlanEnterprise:
		if user.SubscriptionEnd == nil || user.SubscriptionEnd.After(time.Now()) {
			return true
		}
	}
	return false
}
