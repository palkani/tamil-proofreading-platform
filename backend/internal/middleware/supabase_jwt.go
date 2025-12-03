package middleware

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/util/auditlog"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type JWKS struct {
	Keys []JWK `json:"keys"`
}

type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type SupabaseClaims struct {
	Sub               string `json:"sub"`
	Email             string `json:"email"`
	Role              string `json:"role"`
	Aud               string `json:"aud"`
	AppMetadata       map[string]interface{} `json:"app_metadata"`
	UserMetadata      map[string]interface{} `json:"user_metadata"`
	jwt.RegisteredClaims
}

var (
	jwksCache     *JWKS
	jwksCacheMu   sync.RWMutex
	jwksCacheTime time.Time
	jwksCacheTTL  = 1 * time.Hour
)

func getSupabaseJWKS() (*JWKS, error) {
	jwksCacheMu.RLock()
	if jwksCache != nil && time.Since(jwksCacheTime) < jwksCacheTTL {
		jwksCacheMu.RUnlock()
		return jwksCache, nil
	}
	jwksCacheMu.RUnlock()

	supabaseURL := os.Getenv("SUPABASE_URL")
	if supabaseURL == "" {
		supabaseURL = os.Getenv("VITE_SUPABASE_URL")
	}
	if supabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL not configured")
	}

	jwksURL := fmt.Sprintf("%s/auth/v1/jwks", strings.TrimSuffix(supabaseURL, "/"))
	
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(jwksURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("JWKS request failed with status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read JWKS response: %w", err)
	}

	var jwks JWKS
	if err := json.Unmarshal(body, &jwks); err != nil {
		return nil, fmt.Errorf("failed to parse JWKS: %w", err)
	}

	jwksCacheMu.Lock()
	jwksCache = &jwks
	jwksCacheTime = time.Now()
	jwksCacheMu.Unlock()

	return &jwks, nil
}

func jwkToRSAPublicKey(jwk JWK) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("failed to decode N: %w", err)
	}

	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("failed to decode E: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	
	var e int
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}

	return &rsa.PublicKey{
		N: n,
		E: e,
	}, nil
}

func findKeyByKid(jwks *JWKS, kid string) (*JWK, error) {
	for _, key := range jwks.Keys {
		if key.Kid == kid {
			return &key, nil
		}
	}
	return nil, fmt.Errorf("key with kid %s not found", kid)
}

func SupabaseAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""

		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				auditlog.Warn(c, "supabase_auth.invalid_header", map[string]any{"header": authHeader})
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
		}

		if tokenString == "" {
			auditlog.Warn(c, "supabase_auth.missing_token", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization token required"})
			c.Abort()
			return
		}

		token, err := jwt.ParseWithClaims(tokenString, &SupabaseClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}

			kid, ok := token.Header["kid"].(string)
			if !ok {
				return nil, fmt.Errorf("kid not found in token header")
			}

			jwks, err := getSupabaseJWKS()
			if err != nil {
				return nil, err
			}

			jwk, err := findKeyByKid(jwks, kid)
			if err != nil {
				return nil, err
			}

			return jwkToRSAPublicKey(*jwk)
		})

		if err != nil {
			auditlog.Warn(c, "supabase_auth.invalid_token", map[string]any{"error": err.Error()})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(*SupabaseClaims)
		if !ok || !token.Valid {
			auditlog.Warn(c, "supabase_auth.invalid_claims", nil)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		c.Set("supabase_user_id", claims.Sub)
		c.Set("user_email", claims.Email)
		c.Set("supabase_role", claims.Role)
		c.Set("app_metadata", claims.AppMetadata)
		c.Set("user_metadata", claims.UserMetadata)

		auditlog.Info(c, "supabase_auth.success", map[string]any{
			"user_id": claims.Sub,
			"email":   claims.Email,
		})

		c.Next()
	}
}

func OptionalSupabaseAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.Next()
			return
		}
		tokenString := parts[1]

		token, err := jwt.ParseWithClaims(tokenString, &SupabaseClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}

			kid, ok := token.Header["kid"].(string)
			if !ok {
				return nil, fmt.Errorf("kid not found in token header")
			}

			jwks, err := getSupabaseJWKS()
			if err != nil {
				return nil, err
			}

			jwk, err := findKeyByKid(jwks, kid)
			if err != nil {
				return nil, err
			}

			return jwkToRSAPublicKey(*jwk)
		})

		if err == nil && token.Valid {
			if claims, ok := token.Claims.(*SupabaseClaims); ok {
				c.Set("supabase_user_id", claims.Sub)
				c.Set("user_email", claims.Email)
				c.Set("supabase_role", claims.Role)
				c.Set("app_metadata", claims.AppMetadata)
				c.Set("user_metadata", claims.UserMetadata)
			}
		}

		c.Next()
	}
}

func GetSupabaseUserID(c *gin.Context) (string, bool) {
	userID, exists := c.Get("supabase_user_id")
	if !exists {
		return "", false
	}
	return userID.(string), true
}
