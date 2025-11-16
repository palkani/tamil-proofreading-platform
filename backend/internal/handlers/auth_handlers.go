package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/auth"
	"tamil-proofreading-platform/backend/internal/util/auditlog"
	"tamil-proofreading-platform/backend/internal/util/securecookie"

	"github.com/gin-gonic/gin"
	"google.golang.org/api/idtoken"
)

const refreshTokenCookieName = "proof_refresh_token"
const refreshTokenCookiePath = "/"

func (h *Handlers) refreshCookieSecure() bool {
	if strings.HasPrefix(strings.ToLower(h.cfg.FrontendURL), "https://") {
		return true
	}
	return false
}

func (h *Handlers) encryptRefreshToken(raw string) (string, error) {
	if len(h.cfg.RefreshCookieKey) == 0 {
		return "", errors.New("refresh cookie key not configured")
	}
	return securecookie.Encrypt([]byte(raw), h.cfg.RefreshCookieKey)
}

func (h *Handlers) decryptRefreshToken(encoded string) (string, error) {
	if len(h.cfg.RefreshCookieKey) == 0 {
		return "", errors.New("refresh cookie key not configured")
	}
	plaintext, err := securecookie.Decrypt(encoded, h.cfg.RefreshCookieKey)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func (h *Handlers) setRefreshCookie(c *gin.Context, token string, expiresAt time.Time) {
	if strings.TrimSpace(token) == "" {
		return
	}

	encrypted, err := h.encryptRefreshToken(token)
	if err != nil {
		c.Error(err)
		return
	}

	maxAge := int(time.Until(expiresAt).Seconds())
	if maxAge < 0 {
		maxAge = 0
	}

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     refreshTokenCookieName,
		Value:    encrypted,
		Path:     refreshTokenCookiePath,
		HttpOnly: true,
		Secure:   h.refreshCookieSecure(),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   maxAge,
		Expires:  expiresAt,
	})
}

func (h *Handlers) clearRefreshCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     refreshTokenCookieName,
		Value:    "",
		Path:     refreshTokenCookiePath,
		HttpOnly: true,
		Secure:   h.refreshCookieSecure(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func sessionMetadataFromContext(c *gin.Context) auth.SessionMetadata {
	return auth.SessionMetadata{
		UserAgent: c.GetHeader("User-Agent"),
		IPAddress: c.ClientIP(),
	}
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name" binding:"required"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type OTPRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type VerifyOTPRequest struct {
	Email string `json:"email" binding:"required,email"`
	OTP   string `json:"otp" binding:"required"`
}

type SocialLoginRequest struct {
	Provider string `json:"provider" binding:"required"` // google, facebook
	Token    string `json:"token" binding:"required"`
}

// Register handles user registration
func (h *Handlers) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.authService.Register(req.Email, req.Password, req.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	auditlog.Info(c, "auth_register_success", map[string]any{
		"user_email": req.Email,
		"user_id":    user.ID,
	})

	tokenPair, err := h.authService.IssueSession(user, sessionMetadataFromContext(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	h.setRefreshCookie(c, tokenPair.RefreshToken, tokenPair.RefreshExpiresAt)

	c.JSON(http.StatusCreated, gin.H{
		"user":                    user,
		"access_token":            tokenPair.AccessToken,
		"access_token_expires_at": tokenPair.AccessExpiresAt.UTC(),
		"refresh_expires_at":      tokenPair.RefreshExpiresAt.UTC(),
	})
}

// Login handles user login
func (h *Handlers) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.authService.Login(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	auditlog.Info(c, "auth_login_success", map[string]any{
		"user_email": req.Email,
		"user_id":    user.ID,
	})

	tokenPair, err := h.authService.IssueSession(user, sessionMetadataFromContext(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	h.setRefreshCookie(c, tokenPair.RefreshToken, tokenPair.RefreshExpiresAt)

	c.JSON(http.StatusOK, gin.H{
		"user":                    user,
		"access_token":            tokenPair.AccessToken,
		"access_token_expires_at": tokenPair.AccessExpiresAt.UTC(),
		"refresh_expires_at":      tokenPair.RefreshExpiresAt.UTC(),
	})
}

// RefreshAccessToken rotates the refresh token cookie and returns a new access token
func (h *Handlers) RefreshAccessToken(c *gin.Context) {
	refreshToken, err := c.Cookie(refreshTokenCookieName)
	if err != nil || strings.TrimSpace(refreshToken) == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token missing"})
		return
	}

	rawRefresh, err := h.decryptRefreshToken(refreshToken)
	if err != nil {
		h.clearRefreshCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	tokenPair, user, err := h.authService.RefreshSession(rawRefresh, sessionMetadataFromContext(c))
	if err != nil {
		h.clearRefreshCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	h.setRefreshCookie(c, tokenPair.RefreshToken, tokenPair.RefreshExpiresAt)

	c.JSON(http.StatusOK, gin.H{
		"user":                    user,
		"access_token":            tokenPair.AccessToken,
		"access_token_expires_at": tokenPair.AccessExpiresAt.UTC(),
		"refresh_expires_at":      tokenPair.RefreshExpiresAt.UTC(),
	})
}

// Logout revokes the current refresh token and clears the cookie
func (h *Handlers) Logout(c *gin.Context) {
	refreshToken, err := c.Cookie(refreshTokenCookieName)
	if err == nil && strings.TrimSpace(refreshToken) != "" {
		if raw, decErr := h.decryptRefreshToken(refreshToken); decErr == nil {
			_ = h.authService.RevokeRefreshToken(raw)
		}
	}

	h.clearRefreshCookie(c)
	c.Status(http.StatusNoContent)
}

// GetCurrentUser returns current authenticated user
func (h *Handlers) GetCurrentUser(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	user, err := h.authService.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": user})
}

// SendOTP sends OTP to user's email (simplified - in production use Twilio/SendGrid)
func (h *Handlers) SendOTP(c *gin.Context) {
	var req OTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: Implement OTP sending via Twilio/SendGrid
	// For now, return success (in production, actually send OTP)
	c.JSON(http.StatusOK, gin.H{
		"message": "OTP sent to email (not implemented in demo)",
	})
}

// VerifyOTP verifies OTP and logs in user
func (h *Handlers) VerifyOTP(c *gin.Context) {
	var req VerifyOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: Implement OTP verification
	// For now, return error (in production, verify OTP)
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "OTP verification not implemented in demo",
	})
}

// SocialLogin handles social login (Google, Facebook)
func (h *Handlers) SocialLogin(c *gin.Context) {
	var req SocialLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var (
		user *models.User
		err  error
	)

	switch strings.ToLower(req.Provider) {
	case "google":
		user, err = h.googleOAuthLogin(c.Request.Context(), req.Token)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported provider"})
		return
	}

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	tokenPair, err := h.authService.IssueSession(user, sessionMetadataFromContext(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	h.setRefreshCookie(c, tokenPair.RefreshToken, tokenPair.RefreshExpiresAt)

	c.JSON(http.StatusOK, gin.H{
		"user":                    user,
		"access_token":            tokenPair.AccessToken,
		"access_token_expires_at": tokenPair.AccessExpiresAt.UTC(),
		"refresh_expires_at":      tokenPair.RefreshExpiresAt.UTC(),
	})
}

func (h *Handlers) googleOAuthLogin(ctx context.Context, token string) (*models.User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, errors.New("google token missing")
	}
	if h.cfg.GoogleClientID == "" {
		return nil, errors.New("google oauth not configured")
	}

	payload, err := idtoken.Validate(ctx, token, h.cfg.GoogleClientID)
	if err != nil {
		return nil, err
	}

	email, _ := payload.Claims["email"].(string)
	if email == "" {
		return nil, errors.New("google token missing email")
	}

	if verified, ok := payload.Claims["email_verified"].(bool); ok && !verified {
		return nil, errors.New("google email not verified")
	}

	name, _ := payload.Claims["name"].(string)

	return h.authService.EnsureOAuthUser(email, name)
}
