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
	// BackendURL is the public URL of this API (e.g. https://xxx.run.app). Used for Google OAuth redirect_uri. If empty, uses https://www.prooftamil.com.
	BackendURL                string
	GoogleOAuthRedirectDomain string
	JWTSecret                 string
	RefreshTokenSecret        string
	AccessTokenTTLMinutes     int
	RefreshTokenTTLDays       int
	RefreshCookieKey          []byte
	OpenAIAPIKey              string
	GoogleGenAIKey            string
	AnthropicAPIKey           string
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
	// Suggest lexicon load tuning (batch size, limit, per-batch timeout)
	SuggestLoadBatchSize      int
	SuggestLoadLimit          int
	SuggestBatchTimeoutSec    int
	LexiconFile          string // optional: path to pre-built lexicon JSON (baked in image for fast cold start)
	SuggestUseDB         bool   // use Postgres RPC + hot cache for suggest (when phonetic_variants exists)
	SeedCorpusOnStartup   bool
	SeedCorpusFile            string
	SeedCorpusMinCount int
	// Supabase Auth (Google sign-in via Supabase; existing users matched by email)
	SupabaseURL      string
	SupabaseJWTSecret string
	// RunMigrations: run AutoMigrate and custom migrations at startup. Default true. Set RUN_MIGRATIONS=false to skip (e.g. to reduce cold-start time after first deploy).
	RunMigrations bool
	// RunDBArchitectureMigrations: run ProofTamil DB architecture (phonetic_variants, RPCs, data) at startup. Default false. Run from local only via: go run ./cmd/migrate (never set in Cloud Run/workflow).
	RunDBArchitectureMigrations bool
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

	// IME / Transliterator: ProofTamilRunner logic is in-process (backend/prooftamil-runner code
	// is retired as a separate service). Use in-process suggest engine + translit only; no external runner API.
	transBase := strings.TrimSpace(getEnv("TRANSLITERATOR_BASE_URL", ""))
	aksharaURL := strings.TrimSpace(getEnv("AKSHARA_URL", ""))
	if aksharaURL == "" && transBase != "" {
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
		imeEnabled = strings.TrimSpace(aksharaURL) != ""
	}

	dbURL := getEnv("DATABASE_URL", "postgres://user:password@localhost:5432/tamil_proofreading?sslmode=disable")
	dbURL = ensureSupabaseSSL(dbURL)

	return &Config{
		DatabaseURL:               dbURL,
		Port:                      getEnv("PORT", "8080"),
		FrontendURL:               getEnv("FRONTEND_URL", "http://localhost:3000"),
		BackendURL:                strings.TrimRight(getEnv("BACKEND_URL", ""), "/"),
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
		SuggestMinLen:          getEnvAsInt("SUGGEST_MIN_LEN", 1), // 1 = letter-by-letter (t, th, thu...)
		SuggestTopK:            getEnvAsInt("SUGGEST_TOP_K", 5),
		SuggestCacheEntries:    getEnvAsInt("SUGGEST_CACHE_ENTRIES", 3000),  // LRU response cache for lower latency
		SuggestCacheTTLMS:      getEnvAsInt("SUGGEST_CACHE_TTL_MS", 300000), // 5 minutes TTL
		SuggestTrieTopK:        getEnvAsInt("SUGGEST_TRIE_TOP_K", 25),
		LexiconRefreshSec:      getEnvAsInt("LEXICON_REFRESH_SEC", 600),
		SuggestVowelCollapse:   strings.ToLower(getEnv("SUGGEST_VOWEL_COLLAPSE", "false")) == "true",
		RedisURL:               strings.TrimSpace(getEnv("REDIS_URL", "")),
		SuggestRedisTimeoutMS:  getEnvAsInt("SUGGEST_REDIS_TIMEOUT_MS", 25),
		SuggestLoadBatchSize:    getEnvAsInt("SUGGEST_LOAD_BATCH_SIZE", 10000),
		SuggestLoadLimit:       getEnvAsInt("SUGGEST_LOAD_LIMIT", 0), // 0 = no limit (load full tamil_words)
		SuggestBatchTimeoutSec:  getEnvAsInt("SUGGEST_BATCH_TIMEOUT_SEC", 120),
		LexiconFile:        strings.TrimSpace(getEnv("LEXICON_FILE", "")),
		SuggestUseDB:       strings.ToLower(getEnv("SUGGEST_USE_DB", "false")) == "true",
		SeedCorpusOnStartup: strings.ToLower(getEnv("SEED_CORPUS_ON_STARTUP", "false")) == "true",
		SeedCorpusFile:      strings.TrimSpace(getEnv("SEED_CORPUS_FILE", "/root/seed_corpus_minimal.sql")),
		SeedCorpusMinCount:  getEnvAsInt("SEED_CORPUS_MIN_COUNT", 1),
		SupabaseURL:         strings.TrimRight(getEnv("SUPABASE_URL", ""), "/"),
		SupabaseJWTSecret:      strings.TrimSpace(getEnv("SUPABASE_JWT_SECRET", "")),
		RunMigrations:              parseRunMigrations(getEnv("RUN_MIGRATIONS", "true")),
		RunDBArchitectureMigrations: parseRunMigrations(getEnv("RUN_DB_ARCHITECTURE_MIGRATIONS", "false")),
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

// parseRunMigrations: only "true", "1", "yes", "on" (case-insensitive) enable migrations; "false", "0", "no", "off" or anything else disables.
// Logs the raw value so Cloud Run env can be verified.
func parseRunMigrations(raw string) bool {
	v := strings.TrimSpace(strings.ToLower(raw))
	enabled := (v == "true" || v == "1" || v == "yes" || v == "on")
	log.Printf("[CONFIG] RUN_MIGRATIONS=%q -> RunMigrations=%v", raw, enabled)
	return enabled
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
