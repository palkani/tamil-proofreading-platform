package handlers

import (
	"database/sql"
	"log"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/ime"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/auth"
	"tamil-proofreading-platform/backend/internal/services/email"
	"tamil-proofreading-platform/backend/internal/services/llm"
	"tamil-proofreading-platform/backend/internal/services/nlp"
	"tamil-proofreading-platform/backend/internal/services/payment"
	"tamil-proofreading-platform/backend/internal/suggest"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handlers struct {
	db                  *gorm.DB
	cfg                 *config.Config
	authService         *auth.AuthService
	emailService        *email.EmailService
	nlpService          *nlp.TamilNLPService
	llmService          *llm.LLMService
	paymentService      *payment.PaymentService
	streamHub           *submissionStreamHub
	imeSvc              *ime.Service
	imeEnabled          bool
	advancedClient      *ime.AdvancedClient // NEW: Advanced suggestion service
	useAdvancedSuggest  bool                // NEW: Feature flag for advanced service
	suggestEngine       *suggest.Engine
}

func New(db *gorm.DB, cfg *config.Config) *Handlers {
	accessTTL := time.Duration(cfg.AccessTokenTTLMinutes) * time.Minute
	if accessTTL <= 0 {
		accessTTL = time.Hour
	}
	if accessTTL > time.Hour {
		accessTTL = time.Hour
	}
	refreshTTL := time.Duration(cfg.RefreshTokenTTLDays) * 24 * time.Hour
	if refreshTTL <= 0 {
		refreshTTL = 7 * 24 * time.Hour
	}

	authService := auth.NewAuthService(db, cfg.JWTSecret, cfg.RefreshTokenSecret, accessTTL, refreshTTL)
	emailService := email.NewEmailService()
	nlpService := nlp.NewTamilNLPService()
	llmService := llm.NewLLMService(cfg.OpenAIAPIKey, cfg.GoogleGenAIKey, cfg.AnthropicAPIKey, nlpService)
	paymentService := payment.NewPaymentService(db, cfg)

	// Get *sql.DB from gorm for IME corpus queries
	var sqlDB *sql.DB
	if db != nil {
		var err error
		sqlDB, err = db.DB()
		if err != nil {
			log.Printf("[IME] Warning: Failed to get sql.DB from gorm: %v. IME will fallback to Aksharamukha only.", err)
			sqlDB = nil
		} else {
			log.Printf("[IME] Database connection available for corpus-first architecture ✓")
		}
	}

	// Create IME service with corpus database connection
	imeSvc := ime.NewServiceWithDB(".", cfg.AksharaURL, sqlDB, cfg.IMEEnabled, cfg.IMECacheEnabled)

	// Create advanced suggestion client if URL configured
	var advancedClient *ime.AdvancedClient
	useAdvancedSuggest := false
	if cfg.AdvancedSuggestURL != "" {
		advancedClient = ime.NewAdvancedClient(cfg.AdvancedSuggestURL)
		useAdvancedSuggest = cfg.UseAdvancedSuggest
		if useAdvancedSuggest {
			log.Printf("[IME] Advanced suggestion service enabled: %s ✓", cfg.AdvancedSuggestURL)
		} else {
			log.Printf("[IME] Advanced suggestion service available but disabled (set USE_ADVANCED_SUGGEST=true to enable)")
		}
	} else {
		log.Printf("[IME] Advanced suggestion service not configured (set ADVANCED_SUGGEST_URL to enable)")
	}

	h := &Handlers{
		db:                 db,
		cfg:                cfg,
		authService:        authService,
		emailService:       emailService,
		nlpService:         nlpService,
		llmService:         llmService,
		paymentService:     paymentService,
		streamHub:          newSubmissionStreamHub(),
		imeSvc:             imeSvc,
		imeEnabled:         cfg.IMEEnabled,
		advancedClient:     advancedClient,
		useAdvancedSuggest: useAdvancedSuggest,
	}

	// Initialize in-process suggestion engine (Hybrid Trie + ID tables)
	suggestEngine, err := suggest.NewEngine(db, suggest.EngineOptions{
		MinLen:         cfg.SuggestMinLen,
		LimitDefault:   cfg.SuggestTopK,
		MaxTopPerNode:  cfg.SuggestTrieTopK,
		CacheEntries:   cfg.SuggestCacheEntries,
		CacheTTL:       time.Duration(cfg.SuggestCacheTTLMS) * time.Millisecond,
		RefreshSec:     cfg.LexiconRefreshSec,
		VowelCollapse:  cfg.SuggestVowelCollapse,
		RedisURL:       cfg.RedisURL,
		RedisTimeoutMs: cfg.SuggestRedisTimeoutMS,
	})
	if err != nil {
		log.Printf("[SUGGEST] Failed to initialize suggest engine: %v", err)
	} else {
		h.suggestEngine = suggestEngine
		log.Printf("[SUGGEST] In-process suggest engine ready (min_len=%d, top_k=%d)", cfg.SuggestMinLen, cfg.SuggestTopK)
	}

	h.startArchiveCleanup()
	h.startIMEAggregateJob()

	return h
}

func (h *Handlers) startArchiveCleanup() {
	go func() {
		// Run immediately on startup
		if err := h.cleanupArchivedSubmissions(); err != nil {
			log.Printf("archive cleanup error: %v", err)
		}

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			if err := h.cleanupArchivedSubmissions(); err != nil {
				log.Printf("archive cleanup error: %v", err)
			}
		}
	}()
}

// WhoAmI is a diagnostic endpoint to inspect auth headers/cookies without requiring auth.
func (h *Handlers) WhoAmI(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	cookieToken, _ := c.Cookie("access_token")

	log.Printf("[WHOAMI] authorization=%s", authHeader)
	log.Printf("[WHOAMI] cookie_access_token=%t", cookieToken != "")

	c.JSON(200, gin.H{
		"ok":            true,
		"hasAuthHeader": authHeader != "",
		"authHeaderPrefix": func() string {
			if strings.HasPrefix(authHeader, "Bearer ") {
				return "Bearer"
			}
			if authHeader != "" {
				return "Other"
			}
			return ""
		}(),
		"hasCookie": cookieToken != "",
		"user": gin.H{
			"id":    c.GetString("user_id"),
			"email": c.GetString("user_email"),
			"name":  c.GetString("user_name"),
		},
	})
}

func (h *Handlers) cleanupArchivedSubmissions() error {
	cutoff := time.Now().Add(-45 * 24 * time.Hour)
	return h.db.Where("archived = ? AND archived_at < ?", true, cutoff).Delete(&models.Submission{}).Error
}
