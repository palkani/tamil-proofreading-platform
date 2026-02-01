package middleware

import (
	"net/http"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PremiumMiddleware checks if the user has premium access
// Premium access requires:
// 1. Global premium flag is enabled
// 2. User has active subscription OR admin-granted premium override
func PremiumMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := GetUserFromContext(c)
		if err != nil || userID == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Unauthorized",
				"code":    "AUTH_REQUIRED",
				"message": "Please log in to access this feature",
			})
			c.Abort()
			return
		}

		// Check global premium flag
		var flag models.FeatureFlag
		if err := db.Where("key = ?", "premium_enabled").First(&flag).Error; err == nil {
			if !flag.Enabled {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"error":   "Premium features temporarily unavailable",
					"code":    "PREMIUM_DISABLED",
					"message": "Premium features are currently disabled. Please try again later.",
				})
				c.Abort()
				return
			}
		}
		// If flag doesn't exist, default to enabled

		// Get user with premium status
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "User not found",
				"code":    "USER_NOT_FOUND",
			})
			c.Abort()
			return
		}

		// Check if user has premium override from admin
		if user.PremiumOverride {
			// Admin-granted premium access
			c.Set("premium_source", "admin_override")
			c.Next()
			return
		}

		// Check for active subscription
		var subscription models.Subscription
		if err := db.Where("user_id = ? AND status IN ?", userID,
			[]models.BillingSubscriptionStatus{
				models.BillingSubStatusActive,
				models.BillingSubStatusTrialing,
			}).First(&subscription).Error; err != nil {
			// No active subscription
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "Premium subscription required",
				"code":    "PREMIUM_REQUIRED",
				"message": "This feature requires a premium subscription. Please upgrade to access.",
			})
			c.Abort()
			return
		}

		// User has active subscription
		c.Set("premium_source", "subscription")
		c.Set("subscription_id", subscription.ID)
		c.Next()
	}
}

// TokenVersionMiddleware validates that the token version matches the database
// If token version doesn't match, force client to refresh token
func TokenVersionMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := GetUserFromContext(c)
		if err != nil || userID == 0 {
			// No user context, skip validation
			c.Next()
			return
		}

		// Get token version from JWT claims
		tokenVersion, exists := c.Get("token_version")
		if !exists {
			// No token version in claims, skip validation
			c.Next()
			return
		}

		// Get current token version from database
		var user models.User
		if err := db.Select("token_version").First(&user, userID).Error; err != nil {
			// User not found, let other middleware handle it
			c.Next()
			return
		}

		// Compare versions
		claimedVersion, ok := tokenVersion.(int)
		if !ok {
			// Invalid type, skip validation
			c.Next()
			return
		}

		if claimedVersion != user.TokenVersion {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Token version mismatch",
				"code":    "TOKEN_REFRESH_REQUIRED",
				"message": "Your session needs to be refreshed. Please refresh your token.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// OptionalPremiumMiddleware checks premium status but doesn't block
// Sets "is_premium" context variable for handlers to use
func OptionalPremiumMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := GetUserFromContext(c)
		if err != nil || userID == 0 {
			c.Set("is_premium", false)
			c.Next()
			return
		}

		// Check global premium flag
		var flag models.FeatureFlag
		globalEnabled := true
		if err := db.Where("key = ?", "premium_enabled").First(&flag).Error; err == nil {
			globalEnabled = flag.Enabled
		}

		if !globalEnabled {
			c.Set("is_premium", false)
			c.Next()
			return
		}

		// Get user
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.Set("is_premium", false)
			c.Next()
			return
		}

		// Check admin override
		if user.PremiumOverride {
			c.Set("is_premium", true)
			c.Set("premium_source", "admin_override")
			c.Next()
			return
		}

		// Check subscription
		var subscription models.Subscription
		if err := db.Where("user_id = ? AND status IN ?", userID,
			[]models.BillingSubscriptionStatus{
				models.BillingSubStatusActive,
				models.BillingSubStatusTrialing,
			}).First(&subscription).Error; err == nil {
			c.Set("is_premium", true)
			c.Set("premium_source", "subscription")
		} else {
			c.Set("is_premium", false)
		}

		c.Next()
	}
}
