package middleware

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// adminEmailAllowlist is loaded once at startup from the ADMIN_ALLOWED_EMAILS
// env var (comma-separated list, case-insensitive). AdminMiddleware then
// gates access to /admin/* routes on membership in this set — even a user
// with role=admin cannot access admin endpoints unless their email is in
// the list. Defence in depth against a compromised admin account or a
// misconfigured role assignment.
//
// Empty list = admin routes are unreachable (fail-closed). Operators must
// explicitly opt in by setting the env var, matching the security default
// of most production admin panels.
var (
	adminEmailAllowlistOnce sync.Once
	adminEmailAllowlist     map[string]struct{}
)

func loadAdminEmailAllowlist() map[string]struct{} {
	adminEmailAllowlistOnce.Do(func() {
		set := make(map[string]struct{})
		raw := os.Getenv("ADMIN_ALLOWED_EMAILS")
		for _, e := range strings.Split(raw, ",") {
			e = strings.ToLower(strings.TrimSpace(e))
			if e != "" {
				set[e] = struct{}{}
			}
		}
		adminEmailAllowlist = set
		if len(set) == 0 {
			log.Println("[ADMIN] WARNING: ADMIN_ALLOWED_EMAILS is empty — all /admin routes will 403")
		} else {
			log.Printf("[ADMIN] Loaded %d admin email(s) into allowlist", len(set))
		}
	})
	return adminEmailAllowlist
}

type Claims struct {
	UserID uint            `json:"user_id"`
	Email  string          `json:"email"`
	Role   models.UserRole `json:"role"`
	jwt.RegisteredClaims
}

func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		// Never log raw Authorization headers (can leak tokens in logs).
		if authHeader != "" {
			log.Printf("[AUTH] authorization header: <present>")
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

// AdminMiddleware gates access to /admin/* endpoints. Access requires ALL of:
//
//  1. Valid JWT (established by AuthMiddleware upstream)
//  2. User row exists and IsActive
//  3. user.Role == RoleAdmin
//  4. user.Email is in ADMIN_ALLOWED_EMAILS
//
// The email allowlist is defence in depth on top of the role check. A
// compromised admin role assignment (e.g. someone runs an UPDATE users
// SET role='admin' via SQL access) still can't reach admin endpoints
// unless their email is also on the operator-managed list.
//
// Every successful admin access is logged as event="admin.access" so
// the audit trail persists in structured logs even for read-only calls.
// Failures log the specific reason (forbidden, disabled, not-allowlisted)
// so ops can distinguish attack attempts from misconfigurations.
func AdminMiddleware(db *gorm.DB) gin.HandlerFunc {
	allowlist := loadAdminEmailAllowlist()

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

		if !user.IsActive {
			auditlog.Warn(c, "auth.admin_disabled_user", map[string]any{"user_id": user.ID})
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}

		if user.Role != models.RoleAdmin {
			auditlog.Warn(c, "auth.admin_forbidden", map[string]any{"user_id": user.ID})
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}

		// Email allowlist check — the security gate the operator controls
		// out-of-band via env var. Case-insensitive.
		emailKey := strings.ToLower(strings.TrimSpace(user.Email))
		if _, ok := allowlist[emailKey]; !ok {
			auditlog.Warn(c, "auth.admin_not_allowlisted", map[string]any{"user_id": user.ID})
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}

		// Success — log so we have an audit trail of every admin call,
		// not just mutating ones. Path + method are captured by
		// auditlog.Log automatically from the gin.Context.
		auditlog.Log(c, auditlog.LevelInfo, "admin.access", map[string]any{"user_id": user.ID})

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
