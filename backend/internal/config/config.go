package config

import (
	"crypto/sha256"
	"encoding/base64"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL               string
	Port                      string
	FrontendURL               string
	GoogleOAuthRedirectDomain string
	JWTSecret                 string
	RefreshTokenSecret        string
	AccessTokenTTLMinutes     int
	RefreshTokenTTLDays       int
	RefreshCookieKey          []byte
	OpenAIAPIKey              string
	GoogleGenAIKey            string
	AnthropicAPIKey           string
	StripeSecretKey           string
	StripeWebhookSecret       string
	RazorpayKeyID             string
	RazorpayKeySecret         string
	GoogleClientID            string
	GoogleClientSecret        string
	FacebookClientID          string
	FacebookClientSecret      string
	TwilioAccountSID          string
	TwilioAuthToken           string
	TwilioPhoneNumber         string
	AksharaURL                string
	IMEEnabled                bool
	IMECacheEnabled           bool
	TransliteratorBaseURL     string
	SuggestServiceURL         string
	OCRServiceURL             string
	AdvancedSuggestURL        string // NEW: URL for advanced suggestion microservice
	UseAdvancedSuggest        bool   // NEW: Feature flag to enable advanced suggestions
	SuggestMinLen             int
	SuggestTopK               int
	SuggestCacheEntries       int
	SuggestCacheTTLMS         int
	SuggestTrieTopK           int
	LexiconRefreshSec         int
	SuggestVowelCollapse      bool
	RedisURL                  string
	SuggestRedisTimeoutMS     int
	SeedCorpusOnStartup       bool
	SeedCorpusFile            string
	SeedCorpusMinCount        int
	// Supabase Auth (Google sign-in via Supabase; existing users matched by email)
	SupabaseURL      string
	SupabaseJWTSecret string
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

	geminiKey := getEnvWithFallback("AI_INTEGRATIONS_GEMINI_API_KEY", "GOOGLE_GENAI_API_KEY", "")
	if geminiKey != "" {
		log.Printf("[CONFIG] Gemini API key found: %s***%s (length: %d)", geminiKey[:8], geminiKey[len(geminiKey)-4:], len(geminiKey))
	} else {
		log.Printf("[CONFIG] WARNING: Gemini API key is empty - AI proofreading will fail")
	}

	// Check OpenAI key for fallback
	openAIKey := getEnv("OPENAI_API_KEY", "")
	if openAIKey != "" {
		log.Printf("[CONFIG] OpenAI API key found: %s***%s (length: %d) - fallback enabled", openAIKey[:8], openAIKey[len(openAIKey)-4:], len(openAIKey))
	} else {
		log.Printf("[CONFIG] WARNING: OpenAI API key is empty - no fallback available for rate limits")
	}

	// IME / Transliterator configuration:
	// - Runner (ProofTamilRunner) exposes API under /api/v1
	// - If AKSHARA_URL isn't explicitly set, default to TRANSLITERATOR_BASE_URL + "/api/v1"
	// - If IME_ENABLED isn't explicitly set, enable automatically when runner URL is present
	transBase := getEnv("TRANSLITERATOR_BASE_URL", "https://prooftamil-runner-991187041222.asia-south1.run.app")
	aksharaURL := strings.TrimSpace(getEnv("AKSHARA_URL", ""))
	if aksharaURL == "" {
		aksharaURL = strings.TrimRight(transBase, "/")
		if !strings.HasSuffix(aksharaURL, "/api/v1") {
			aksharaURL = aksharaURL + "/api/v1"
		}
	}
	imeEnabledStr, imeEnabledSet := os.LookupEnv("IME_ENABLED")
	imeEnabled := false
	if imeEnabledSet {
		imeEnabled = strings.ToLower(strings.TrimSpace(imeEnabledStr)) == "true"
	} else {
		// Auto-enable when Akshara/runner URL is available
		imeEnabled = strings.TrimSpace(aksharaURL) != ""
	}

	dbURL := getEnv("DATABASE_URL", "postgres://user:password@localhost:5432/tamil_proofreading?sslmode=disable")
	dbURL = ensureSupabaseSSL(dbURL)

	return &Config{
		DatabaseURL:               dbURL,
		Port:                      getEnv("PORT", "8080"),
		FrontendURL:               getEnv("FRONTEND_URL", "http://localhost:3000"),
		GoogleOAuthRedirectDomain: getEnv("GOOGLE_OAUTH_REDIRECT_DOMAIN", "https://prooftamil.com"),
		JWTSecret:                 getEnv("JWT_SECRET", "change-this-secret-key-in-production"),
		RefreshTokenSecret:        getEnv("REFRESH_TOKEN_SECRET", ""),
		// Access tokens are short-lived (15m) to limit blast radius
		AccessTokenTTLMinutes:  getEnvAsInt("ACCESS_TOKEN_TTL_MINUTES", 15),
		RefreshTokenTTLDays:    getEnvAsInt("REFRESH_TOKEN_TTL_DAYS", 7),
		RefreshCookieKey:       refreshCookieKey,
		OpenAIAPIKey:           getEnv("OPENAI_API_KEY", ""),
		GoogleGenAIKey:         geminiKey,
		AnthropicAPIKey:        getEnv("ANTHROPIC_API_KEY", ""),
		StripeSecretKey:        getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret:    getEnv("STRIPE_WEBHOOK_SECRET", ""),
		RazorpayKeyID:          getEnv("RAZORPAY_KEY_ID", ""),
		RazorpayKeySecret:      getEnv("RAZORPAY_KEY_SECRET", ""),
		GoogleClientID:         getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:     getEnv("GOOGLE_CLIENT_SECRET", ""),
		FacebookClientID:       getEnv("FACEBOOK_CLIENT_ID", ""),
		FacebookClientSecret:   getEnv("FACEBOOK_CLIENT_SECRET", ""),
		TwilioAccountSID:       getEnv("TWILIO_ACCOUNT_SID", ""),
		TwilioAuthToken:        getEnv("TWILIO_AUTH_TOKEN", ""),
		TwilioPhoneNumber:      getEnv("TWILIO_PHONE_NUMBER", ""),
		AksharaURL:             aksharaURL,
		IMEEnabled:             imeEnabled,
		IMECacheEnabled:        strings.ToLower(getEnv("IME_CACHE_ENABLED", "true")) == "true",
		TransliteratorBaseURL:  transBase,
		SuggestServiceURL:      strings.TrimRight(getEnv("SUGGEST_SERVICE_URL", ""), "/"),
		OCRServiceURL:          strings.TrimRight(getEnv("OCR_SERVICE_URL", ""), "/"),
		AdvancedSuggestURL:     strings.TrimRight(getEnv("ADVANCED_SUGGEST_URL", ""), "/"),
		UseAdvancedSuggest:     strings.ToLower(getEnv("USE_ADVANCED_SUGGEST", "false")) == "true",
		SuggestMinLen:          getEnvAsInt("SUGGEST_MIN_LEN", 2),
		SuggestTopK:            getEnvAsInt("SUGGEST_TOP_K", 5),
		SuggestCacheEntries:    getEnvAsInt("SUGGEST_CACHE_ENTRIES", 2000),  // Increased for 1000+ concurrent users
		SuggestCacheTTLMS:      getEnvAsInt("SUGGEST_CACHE_TTL_MS", 300000), // 5 minutes TTL
		SuggestTrieTopK:        getEnvAsInt("SUGGEST_TRIE_TOP_K", 25),
		LexiconRefreshSec:      getEnvAsInt("LEXICON_REFRESH_SEC", 600),
		SuggestVowelCollapse:   strings.ToLower(getEnv("SUGGEST_VOWEL_COLLAPSE", "false")) == "true",
		RedisURL:               strings.TrimSpace(getEnv("REDIS_URL", "")),
		SuggestRedisTimeoutMS:  getEnvAsInt("SUGGEST_REDIS_TIMEOUT_MS", 25),
		SeedCorpusOnStartup:    strings.ToLower(getEnv("SEED_CORPUS_ON_STARTUP", "false")) == "true",
		SeedCorpusFile:         strings.TrimSpace(getEnv("SEED_CORPUS_FILE", "/root/seed_corpus_minimal.sql")),
		SeedCorpusMinCount:     getEnvAsInt("SEED_CORPUS_MIN_COUNT", 1),
		SupabaseURL:            strings.TrimRight(getEnv("SUPABASE_URL", ""), "/"),
		SupabaseJWTSecret:      strings.TrimSpace(getEnv("SUPABASE_JWT_SECRET", "")),
	}
}

// ensureSupabaseSSL forces sslmode=require for Supabase hosts so the DB connection succeeds.
func ensureSupabaseSSL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	host := u.Hostname()
	if host == "" || !strings.Contains(host, "supabase.co") {
		return raw
	}
	q := u.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "require")
	}
	if q.Get("connect_timeout") == "" {
		q.Set("connect_timeout", "10")
	}
	u.RawQuery = q.Encode()
	out := u.String()
	log.Printf("[CONFIG] Supabase DB detected; using sslmode=require, connect_timeout=10 for %s", host)
	return out
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
