package middleware

import (
	"strings"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// OptionalAuthMiddleware attempts to authenticate a request if an access token is present.
// - If no token is present, it does NOT block the request.
// - If a token is present but invalid/expired, it does NOT block the request, but it will not set user context.
//
// This is used for endpoints like POST /api/v1/submit where:
// - anonymous inline proofreading is allowed when save_draft=false
// - authenticated draft saving is allowed when save_draft=true
// The handler can enforce auth based on the request body.
func OptionalAuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""

		// Prefer cookie if present
		if cookieToken, err := c.Cookie("access_token"); err == nil && strings.TrimSpace(cookieToken) != "" {
			tokenString = cookieToken
		}

		// Fallback to Authorization header
		if tokenString == "" && authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			} else {
				// malformed header: treat as unauthenticated
				auditlog.Warn(c, "auth.optional_invalid_header", map[string]any{"header": authHeader})
				c.Next()
				return
			}
		}

		// Fallback to query/header param
		if tokenString == "" {
			tokenString = c.Query("access_token")
			if tokenString == "" {
				tokenString = c.GetHeader("X-Access-Token")
			}
		}

		// No token at all → anonymous request allowed
		if strings.TrimSpace(tokenString) == "" {
			c.Next()
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})
		if err != nil || token == nil || !token.Valid {
			// Invalid token → treat as anonymous. Handler may still reject if auth is required.
			auditlog.Warn(c, "auth.optional_invalid_token", map[string]any{"error": func() string {
				if err != nil {
					return err.Error()
				}
				return "token invalid"
			}()})
			c.Next()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.Next()
			return
		}

		var userID uint
		if uid, ok := claims["user_id"].(float64); ok {
			userID = uint(uid)
		} else if uid, ok := claims["user_id"].(uint); ok {
			userID = uid
		} else {
			c.Next()
			return
		}

		email, _ := claims["email"].(string)
		roleStr, _ := claims["role"].(string)
		role := models.UserRole(roleStr)

		c.Set("user_id", userID)
		c.Set("user_email", email)
		c.Set("user_role", role)
		c.Next()
	}
}


