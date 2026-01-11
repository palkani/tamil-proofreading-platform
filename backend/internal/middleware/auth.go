package middleware

import (
	"log"
	"net/http"
	"strings"
	"time"

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
		// TEMP debug log
		if authHeader != "" {
			log.Printf("[AUTH] authorization header: %s", authHeader)
		} else {
			log.Printf("[AUTH] authorization header: <empty>")
		}
		tokenString := ""

		// Prefer HTTP-only cookie if present
		if cookieToken, err := c.Cookie("access_token"); err == nil && strings.TrimSpace(cookieToken) != "" {
			tokenString = cookieToken
		}

		// Fallback to Authorization header
		if tokenString == "" && authHeader != "" {
			// Extract token from "Bearer <token>"
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				auditlog.Warn(c, "auth.invalid_header", map[string]any{"header": authHeader})
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
				c.Abort()
				return
			}

			tokenString = parts[1]
		}

		// Fallback to query/header param
		if tokenString == "" {
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
			// Verify signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil {
			log.Printf("[AUTH] JWT parse error: %v", err)
			// Log token expiration details if available
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				if exp, ok := claims["exp"].(float64); ok {
					now := time.Now().Unix()
					log.Printf("[AUTH] Token exp: %v, server now: %v, diff: %v seconds", int64(exp), now, int64(exp)-now)
				}
			}
			auditlog.Warn(c, "auth.invalid_token", map[string]any{"error": err.Error(), "token_preview": tokenString[:50] + "..."})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token", "details": err.Error()})
			c.Abort()
			return
		}
		
		if !token.Valid {
			log.Printf("[AUTH] JWT token is not valid")
			// Log token expiration details
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				if exp, ok := claims["exp"].(float64); ok {
					now := time.Now().Unix()
					log.Printf("[AUTH] Token exp: %v, server now: %v, diff: %v seconds", int64(exp), now, int64(exp)-now)
				}
			}
			auditlog.Warn(c, "auth.invalid_token", map[string]any{"error": "token.Valid is false", "token_preview": tokenString[:50] + "..."})
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
