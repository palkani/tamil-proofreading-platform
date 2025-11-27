package config

import (
        "crypto/sha256"
        "encoding/base64"
        "os"
        "strconv"

        "github.com/joho/godotenv"
)

type Config struct {
        DatabaseURL           string
        Port                  string
        FrontendURL           string
        JWTSecret             string
        RefreshTokenSecret    string
        AccessTokenTTLMinutes int
        RefreshTokenTTLDays   int
        RefreshCookieKey      []byte
        OpenAIAPIKey          string
        GoogleGenAIKey        string
        StripeSecretKey       string
        StripeWebhookSecret   string
        RazorpayKeyID         string
        RazorpayKeySecret     string
        GoogleClientID        string
        GoogleClientSecret    string
        FacebookClientID      string
        FacebookClientSecret  string
        TwilioAccountSID      string
        TwilioAuthToken       string
        TwilioPhoneNumber     string
}

func Load() *Config {
        // Load .env file if it exists (ignore error if it doesn't)
        _ = godotenv.Load()

        refreshCookieKey := deriveKey(getEnv("REFRESH_COOKIE_ENCRYPTION_KEY", ""))
        if len(refreshCookieKey) == 0 {
                base := getEnv("REFRESH_TOKEN_SECRET", "")
                if base == "" {
                        base = getEnv("JWT_SECRET", "change-this-secret-key-in-production")
                }
                refreshCookieKey = deriveKey(base)
        }

        return &Config{
                DatabaseURL:           getEnv("DATABASE_URL", "postgres://user:password@localhost:5432/tamil_proofreading?sslmode=disable"),
                Port:                  getEnv("PORT", "8080"),
                FrontendURL:           getEnv("FRONTEND_URL", "http://localhost:3000"),
                JWTSecret:             getEnv("JWT_SECRET", "change-this-secret-key-in-production"),
                RefreshTokenSecret:    getEnv("REFRESH_TOKEN_SECRET", ""),
                AccessTokenTTLMinutes: getEnvAsInt("ACCESS_TOKEN_TTL_MINUTES", 60),
                RefreshTokenTTLDays:   getEnvAsInt("REFRESH_TOKEN_TTL_DAYS", 7),
                RefreshCookieKey:      refreshCookieKey,
                OpenAIAPIKey:          getEnv("OPENAI_API_KEY", ""),
                GoogleGenAIKey:        getEnvWithFallback("AI_INTEGRATIONS_GEMINI_API_KEY", "GOOGLE_GENAI_API_KEY", ""),
                StripeSecretKey:       getEnv("STRIPE_SECRET_KEY", ""),
                StripeWebhookSecret:   getEnv("STRIPE_WEBHOOK_SECRET", ""),
                RazorpayKeyID:         getEnv("RAZORPAY_KEY_ID", ""),
                RazorpayKeySecret:     getEnv("RAZORPAY_KEY_SECRET", ""),
                GoogleClientID:        getEnv("GOOGLE_CLIENT_ID", ""),
                GoogleClientSecret:    getEnv("GOOGLE_CLIENT_SECRET", ""),
                FacebookClientID:      getEnv("FACEBOOK_CLIENT_ID", ""),
                FacebookClientSecret:  getEnv("FACEBOOK_CLIENT_SECRET", ""),
                TwilioAccountSID:      getEnv("TWILIO_ACCOUNT_SID", ""),
                TwilioAuthToken:       getEnv("TWILIO_AUTH_TOKEN", ""),
                TwilioPhoneNumber:     getEnv("TWILIO_PHONE_NUMBER", ""),
        }
}

func getEnv(key, defaultValue string) string {
        if value := os.Getenv(key); value != "" {
                return value
        }
        return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
        if value := os.Getenv(key); value != "" {
                if parsed, err := strconv.Atoi(value); err == nil {
                        return parsed
                }
        }
        return defaultValue
}

func getEnvWithFallback(primaryKey, fallbackKey, defaultValue string) string {
        if value := os.Getenv(primaryKey); value != "" {
                return value
        }
        if value := os.Getenv(fallbackKey); value != "" {
                return value
        }
        return defaultValue
}

func deriveKey(source string) []byte {
        if source == "" {
                return nil
        }

        if decoded, err := base64.StdEncoding.DecodeString(source); err == nil {
                if len(decoded) >= 16 {
                        if len(decoded) >= 32 {
                                return append([]byte(nil), decoded[:32]...)
                        }
                        padded := make([]byte, 32)
                        copy(padded, decoded)
                        return padded
                }
        }

        sum := sha256.Sum256([]byte(source))
        return sum[:]
}
