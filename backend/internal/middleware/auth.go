package middleware

import (
	"net/http"
	"strings"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type Claims struct {
	UserID uint            `json:"user_id"`
	Email  string          `json:"email"`
	Role   models.UserRole `json:"role"`
	jwt.RegisteredClaims
}

func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""

		if authHeader != "" {
			// Extract token from "Bearer <token>"
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				auditlog.Warn(c, "auth.invalid_header", map[string]any{"header": authHeader})
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
				c.Abort()
				return
			}

			tokenString = parts[1]
		} else {
			tokenString = c.Query("access_token")
			if tokenString == "" {
				tokenString = c.GetHeader("X-Access-Token")
			}
			if tokenString == "" {
				auditlog.Warn(c, "auth.missing_token", nil)
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization token required"})
				c.Abort()
				return
			}
		}

		// Parse token with MapClaims since auth service uses MapClaims
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			auditlog.Warn(c, "auth.invalid_token", map[string]any{"error": err})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Extract claims from token
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			auditlog.Warn(c, "auth.invalid_claims", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		// Extract user_id (handle both float64 and uint types)
		var userID uint
		if uid, ok := claims["user_id"].(float64); ok {
			userID = uint(uid)
		} else if uid, ok := claims["user_id"].(uint); ok {
			userID = uid
		} else {
			auditlog.Warn(c, "auth.invalid_user_id", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID in token"})
			c.Abort()
			return
		}

		// Extract email
		email, _ := claims["email"].(string)

		// Extract role
		roleStr, _ := claims["role"].(string)
		role := models.UserRole(roleStr)

		// Set user info in context
		c.Set("user_id", userID)
		c.Set("user_email", email)
		c.Set("user_role", role)

		c.Next()
	}
}

func AdminMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			auditlog.Warn(c, "auth.admin_missing_user", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found"})
			c.Abort()
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			auditlog.Warn(c, "auth.admin_user_not_found", map[string]any{"user_id": userID})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		if user.Role != models.RoleAdmin {
			auditlog.Warn(c, "auth.admin_forbidden", map[string]any{"user_id": user.ID})
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// GetUserFromContext extracts user ID from context (set by AuthMiddleware)
func GetUserFromContext(c *gin.Context) (uint, error) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, gin.Error{}
	}
	return userID.(uint), nil
}
