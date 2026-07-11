package billing

import (
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

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
	// Operator allowlist. Kept in sync with:
	//   - usage_today_handler.go:74-78
	//   - submission_handlers.go:635-639 + 663-664
	// If a sixth admin email lands, add here + those two spots + the
	// blog-publish allowlist (see doc-export.js / api.js). Worth
	// consolidating into a shared const at that point.
	switch strings.ToLower(strings.TrimSpace(user.Email)) {
	case "palkani.r@gmail.com", "prooftamil@gmail.com",
		"banu.palkani@gmail.com", "contact@prooftamil.com":
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
