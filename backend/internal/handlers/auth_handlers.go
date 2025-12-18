package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/auth"
	"tamil-proofreading-platform/backend/internal/util/auditlog"
	"tamil-proofreading-platform/backend/internal/util/securecookie"

	"github.com/gin-gonic/gin"
	"google.golang.org/api/idtoken"
)

type googleTokens struct {
	IDToken      string
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
	TokenType    string
	Scope        string
}

const googleRedirectURI = "https://www.prooftamil.com/api/v1/auth/google/callback"
const googleFrontendWorkspace = "https://www.prooftamil.com/workspace"

var logOAuthConfigOnce sync.Once

// GoogleAuthStart initiates OAuth by redirecting directly to Google with backend callback
func (h *Handlers) GoogleAuthStart(c *gin.Context) {
	reqID := c.GetString("request_id")

	logOAuthConfigOnce.Do(func() {
		log.Printf("[OAUTH-CONFIG] client_id=%s redirect_uri=%s", h.cfg.GoogleClientID, googleRedirectURI)
	})

	if h.cfg.GoogleClientID == "" {
		log.Printf("[OAUTH-ERROR] step=auth_start_missing_client request_id=%s", reqID)
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/login?error=oauth_not_configured")
		return
	}

	// Build Google authorize URL with canonical redirect_uri (backend Cloud Run)
	params := url.Values{}
	params.Set("client_id", h.cfg.GoogleClientID)
	params.Set("redirect_uri", googleRedirectURI)
	params.Set("response_type", "code")
	params.Set("scope", "openid email profile")
	params.Set("access_type", "offline")
	params.Set("prompt", "consent")

	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
	log.Printf("[OAUTH-DEBUG] step=auth_start request_id=%s auth_url=%s client_id_present=%v", reqID, authURL, h.cfg.GoogleClientID != "")
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

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

func (h *Handlers) setAccessTokenCookie(c *gin.Context, token string, expiresAt time.Time) {
	if strings.TrimSpace(token) == "" {
		return
	}

	host := c.Request.Host
	var domain string
	if strings.HasSuffix(host, "prooftamil.com") {
		domain = ".prooftamil.com"
	}

	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "access_token",
		Value:    token,
		Path:     "/",
		Domain:   domain,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		Expires:  expiresAt,
	})

	log.Printf("[AUTH] set access_token cookie domain=%s secure=%v samesite=None expires=%s", domain, true, expiresAt.UTC().Format(time.RFC3339))
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
        Password string `json:"password" binding:"required,min=8"`
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
        OTP   string `json:"otp" binding:"required,len=6"`
}

type PasswordStrengthRequest struct {
        Password string `json:"password" binding:"required"`
}

type SocialLoginRequest struct {
        Provider string `json:"provider" binding:"required"` // google, facebook
        Token    string `json:"token" binding:"required"`
}

type ForgotPasswordRequest struct {
        Email string `json:"email" binding:"required,email"`
}

type ResetPasswordRequest struct {
        Token    string `json:"token" binding:"required"`
        Password string `json:"password" binding:"required,min=8"`
}

// CheckPasswordStrength validates password strength without registration
func (h *Handlers) CheckPasswordStrength(c *gin.Context) {
        var req PasswordStrengthRequest
        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        result := auth.ValidatePasswordStrength(req.Password)
        c.JSON(http.StatusOK, result)
}

// Register handles user registration with email verification
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

        // Create session and issue tokens
        tokenPair, err := h.authService.IssueSession(user, sessionMetadataFromContext(c))
        if err != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
                return
        }

        h.setRefreshCookie(c, tokenPair.RefreshToken, tokenPair.RefreshExpiresAt)

        // Return response with session tokens
        c.JSON(http.StatusCreated, gin.H{
                "user":                    user,
                "access_token":            tokenPair.AccessToken,
                "access_token_expires_at": tokenPair.AccessExpiresAt.UTC(),
                "refresh_expires_at":      tokenPair.RefreshExpiresAt.UTC(),
                "message":                 "Registration successful. Welcome to ProofTamil!",
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

// SendOTP sends OTP to user's email for verification
func (h *Handlers) SendOTP(c *gin.Context) {
        var req OTPRequest
        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        // Create new verification OTP
        _, otp, err := h.authService.ResendEmailVerification(req.Email)
        if err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        // Send verification email
        if sendErr := h.emailService.SendVerificationEmail(req.Email, otp); sendErr != nil {
                auditlog.Error(c, "email_send_failed", map[string]any{
                        "email": req.Email,
                        "error": sendErr.Error(),
                })
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send verification email"})
                return
        }

        c.JSON(http.StatusOK, gin.H{
                "message": "Verification code sent to your email",
        })
}

// VerifyOTP verifies OTP and marks email as verified, then logs in user
func (h *Handlers) VerifyOTP(c *gin.Context) {
        var req VerifyOTPRequest
        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        // Find user by email
        var user models.User
        if err := h.db.Where("email = ?", strings.ToLower(req.Email)).First(&user).Error; err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": "User not found"})
                return
        }

        // Verify OTP
        if err := h.authService.VerifyEmailOTP(user.ID, req.OTP); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        auditlog.Info(c, "email_verified", map[string]any{
                "user_id": user.ID,
                "email":   req.Email,
        })

        // Reload user to get updated EmailVerified status
        h.db.First(&user, user.ID)

        // Issue session tokens after successful verification
        tokenPair, err := h.authService.IssueSession(&user, sessionMetadataFromContext(c))
        if err != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
                return
        }

        h.setRefreshCookie(c, tokenPair.RefreshToken, tokenPair.RefreshExpiresAt)

        c.JSON(http.StatusOK, gin.H{
                "message":                 "Email verified successfully",
                "user":                    user,
                "access_token":            tokenPair.AccessToken,
                "access_token_expires_at": tokenPair.AccessExpiresAt.UTC(),
                "refresh_expires_at":      tokenPair.RefreshExpiresAt.UTC(),
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

// GoogleCallback handles the OAuth2 callback from Google
func (h *Handlers) GoogleCallback(c *gin.Context) {
	// Safety net: never allow panic to surface
	reqID := c.GetString("request_id")
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[OAUTH_FATAL] panic request_id=%s host=%s err=%v", reqID, c.Request.Host, r)
			safeRedirect := h.cfg.FrontendURL + "/login?error=oauth_failed"
			c.Redirect(http.StatusTemporaryRedirect, safeRedirect)
		}
	}()

        code := c.Query("code")
        errParam := c.Query("error")

	log.Printf("[OAUTH-DEBUG] step=callback_hit request_id=%s host=%s originalUrl=%s code_len=%d error_param=%s query_keys=%v",
		reqID, c.Request.Host, c.Request.URL.String(), len(code), errParam, c.Request.URL.Query())
	log.Printf("[OAUTH-DEBUG] step=callback_redirect_uri request_id=%s received=%s using=%s", reqID, c.Query("redirect_uri"), googleRedirectURI)

        if errParam != "" {
                c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/login?error="+errParam)
                return
        }

        if code == "" {
		log.Printf("[OAUTH-ERROR] step=missing_code request_id=%s host=%s", reqID, c.Request.Host)
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/login?error=missing_code")
                return
        }

        if h.cfg.GoogleClientID == "" || h.cfg.GoogleClientSecret == "" {
		log.Printf("[OAUTH-ERROR] step=config_missing request_id=%s client_id_present=%v client_secret_present=%v", reqID, h.cfg.GoogleClientID != "", h.cfg.GoogleClientSecret != "")
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/login?error=oauth_not_configured")
                return
        }

	// Force canonical redirect URI to match Google Console configuration
	redirectURI := "https://www.prooftamil.com/api/v1/auth/google/callback"
	log.Printf("[OAUTH-DEBUG] step=redirect_uri request_id=%s redirect_uri=%s client_id_present=%v client_secret_present=%v code_present=%v",
		reqID, redirectURI, h.cfg.GoogleClientID != "", h.cfg.GoogleClientSecret != "", code != "")

	// Capture scheme for logging (not used for redirect_uri construction)
	scheme := c.GetHeader("X-Forwarded-Proto")
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

        // Exchange authorization code for ID token
	tokens, err := h.exchangeCodeForToken(c.Request.Context(), code, redirectURI, reqID)
        if err != nil {
		log.Printf("[OAUTH-ERROR] step=token_exchange request_id=%s host=%s scheme=%s redirect_uri=%s err=%v", reqID, c.Request.Host, scheme, redirectURI, err)
		errMsg := "google_oauth_failed"
		if strings.Contains(strings.ToLower(err.Error()), "invalid_grant") {
			errMsg = "oauth_code_used"
		} else if strings.Contains(strings.ToLower(err.Error()), "redirect_uri_mismatch") {
			errMsg = "redirect_uri_mismatch"
		}
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/login?error="+errMsg)
                return
        }

	if tokens.AccessToken != "" {
		if err := h.logGoogleUserInfo(c.Request.Context(), tokens.AccessToken, reqID); err != nil {
			log.Printf("[OAUTH-WARN] step=userinfo_fetch request_id=%s err=%v", reqID, err)
		}
	}

        // Get or create user
	user, err := h.googleOAuthLogin(c.Request.Context(), tokens.IDToken)
        if err != nil {
		log.Printf("[OAUTH-ERROR] step=oauth_login request_id=%s err=%v", reqID, err)
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/login?error=oauth_login_failed")
                return
        }

        // Create session
        tokenPair, err := h.authService.IssueSession(user, sessionMetadataFromContext(c))
        if err != nil {
		log.Printf("[OAUTH-ERROR] step=session_creation request_id=%s user_id=%d err=%v", reqID, user.ID, err)
		c.Redirect(http.StatusTemporaryRedirect, h.cfg.FrontendURL+"/login?error=session_creation_failed")
                return
        }

        // Set refresh token cookie
        h.setRefreshCookie(c, tokenPair.RefreshToken, tokenPair.RefreshExpiresAt)

	// Set access token cookie
	h.setAccessTokenCookie(c, tokenPair.AccessToken, tokenPair.AccessExpiresAt)

	// Optional JSON handoff for proxy to set cookie on frontend domain
	if strings.ToLower(c.GetHeader("x-oauth-handoff")) == "json" {
		log.Printf("[OAUTH-DEBUG] step=handoff_json request_id=%s user_id=%d", reqID, user.ID)
		c.JSON(http.StatusOK, gin.H{
			"user":         user,
			"access_token": tokenPair.AccessToken,
			"redirect":     "/workspace",
		})
		return
	}

	// Redirect to workspace with access token (legacy path)
	redirectURL := h.cfg.FrontendURL + "/workspace?access_token=" + tokenPair.AccessToken
	log.Printf("[OAUTH-DEBUG] step=redirect request_id=%s user_id=%d target=%s", reqID, user.ID, redirectURL)
	c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}

func (h *Handlers) exchangeCodeForToken(ctx context.Context, code string, redirectURI string, reqID string) (*googleTokens, error) {
	// Force canonical redirect URI to match Google Console configuration
	if redirectURI == "" {
		redirectURI = "https://www.prooftamil.com/api/v1/auth/google/callback"
	}
	if redirectURI != "https://www.prooftamil.com/api/v1/auth/google/callback" {
		log.Printf("[OAUTH-WARN] redirect URI mismatch provided=%s expected=%s request_id=%s", redirectURI, "https://www.prooftamil.com/api/v1/auth/google/callback", reqID)
	}

	clientID := h.cfg.GoogleClientID
	if len(clientID) > 16 {
		clientID = clientID[:8] + "..." + clientID[len(clientID)-4:]
	}
	log.Printf("[OAUTH-DEBUG] exchanging code with redirect_uri=%s client_id=%s code_len=%d request_id=%s client_id_present=%v client_secret_present=%v code_present=%v",
		redirectURI, clientID, len(code), reqID, h.cfg.GoogleClientID != "", h.cfg.GoogleClientSecret != "", code != "")

        tokenURL := "https://oauth2.googleapis.com/token"
        data := url.Values{
                "code":           {code},
                "client_id":      {h.cfg.GoogleClientID},
                "client_secret":  {h.cfg.GoogleClientSecret},
                "redirect_uri":   {redirectURI},
                "grant_type":     {"authorization_code"},
        }.Encode()
        
	// Debug logging
	log.Printf("[OAUTH-DEBUG] Exchanging code with redirect_uri=%s request_id=%s", redirectURI, reqID)

        req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data))
        if err != nil {
		return nil, err
        }

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

        resp, err := http.DefaultClient.Do(req)
        if err != nil {
		return nil, err
        }
        defer resp.Body.Close()

        body, err := io.ReadAll(resp.Body)
        if err != nil {
		return nil, err
        }

	// Capture non-200 responses for debugging invalid_grant/redirect mismatches
	if resp.StatusCode != http.StatusOK {
		log.Printf("[OAUTH-ERROR] step=token_exchange status=%d body=%s request_id=%s redirect_uri=%s", resp.StatusCode, string(body), reqID, redirectURI)
		lower := strings.ToLower(string(body))
		if strings.Contains(lower, "invalid_grant") {
			return nil, errors.New("invalid_grant")
		}
		if strings.Contains(lower, "redirect_uri_mismatch") {
			return nil, errors.New("redirect_uri_mismatch")
		}
		return nil, errors.New("token exchange failed: status=" + http.StatusText(resp.StatusCode))
        }

        var tokenResp map[string]interface{}
        if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, err
        }

        idToken, ok := tokenResp["id_token"].(string)
        if !ok || idToken == "" {
		return nil, errors.New("id_token not in response")
        }

	accessToken, _ := tokenResp["access_token"].(string)
	refreshToken, _ := tokenResp["refresh_token"].(string)
	scope, _ := tokenResp["scope"].(string)
	expiresIn, _ := tokenResp["expires_in"].(float64)
	tokenType, _ := tokenResp["token_type"].(string)

	return &googleTokens{
		IDToken:      idToken,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		Scope:        scope,
		TokenType:    tokenType,
		ExpiresIn:    int64(expiresIn),
	}, nil
}

func (h *Handlers) logGoogleUserInfo(ctx context.Context, accessToken string, reqID string) error {
	if strings.TrimSpace(accessToken) == "" {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		log.Printf("[OAUTH-ERROR] step=userinfo status=%d body=%s request_id=%s", resp.StatusCode, string(body), reqID)
		return errors.New("userinfo fetch failed")
	}

	var info map[string]interface{}
	if err := json.Unmarshal(body, &info); err != nil {
		log.Printf("[OAUTH-WARN] step=userinfo_parse err=%v request_id=%s body=%s", err, reqID, string(body))
		return nil
	}

	slog.Info("[OAUTH-DEBUG] step=userinfo_ok",
		"request_id", reqID,
		"sub", info["sub"],
		"email_present", info["email"] != nil,
		"email_verified", info["email_verified"],
	)
	return nil
}

// ForgotPassword handles forgotten password requests
func (h *Handlers) ForgotPassword(c *gin.Context) {
        var req ForgotPasswordRequest
        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        // Create reset token (returns nil if user not found - prevents user enumeration)
        _, rawToken, err := h.authService.CreatePasswordResetToken(req.Email)
        if err != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process request"})
                return
        }

        // Send email if token was created (user exists)
        if rawToken != "" {
                if err := auth.SendPasswordResetEmail(req.Email, rawToken); err != nil {
                        log.Printf("[RESET] Failed to send email to %s: %v", req.Email, err)
                }
        }

        // Always return success to prevent user enumeration
        auditlog.Info(c, "auth_forgot_password", map[string]any{
                "email": req.Email,
        })

        c.JSON(http.StatusOK, gin.H{
                "success": true,
                "message": "Password reset email sent if the account exists.",
        })
}

// ResetPassword handles password reset with token
func (h *Handlers) ResetPassword(c *gin.Context) {
        var req ResetPasswordRequest
        if err := c.ShouldBindJSON(&req); err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        // Reset password
        err := h.authService.ResetPassword(req.Token, req.Password)
        if err != nil {
                auditlog.Warn(c, "auth_reset_password_failed", map[string]any{
                        "error": err.Error(),
                })
                c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
                return
        }

        auditlog.Info(c, "auth_reset_password_success", nil)

        c.JSON(http.StatusOK, gin.H{
                "success": true,
                "message": "Password has been reset successfully.",
        })
}
