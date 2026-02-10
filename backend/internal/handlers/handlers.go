package handlers

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/ime"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/auth"
	"tamil-proofreading-platform/backend/internal/services/email"
	"tamil-proofreading-platform/backend/internal/services/llm"
	"tamil-proofreading-platform/backend/internal/services/nlp"
	"tamil-proofreading-platform/backend/internal/services/payment"
	tamil_word_cache "tamil-proofreading-platform/backend/internal/services/tamil_word_cache"
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
	suggestEngine       *suggest.Engine
	suggestEngineMu     sync.RWMutex
	tamilWordCache      *tamil_word_cache.CacheService // NEW: Tamil word cache service
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

	// Create IME service with corpus database connection (advanced suggest service retired for cost consolidation)
	imeSvc := ime.NewServiceWithDB(".", cfg.AksharaURL, sqlDB, cfg.IMEEnabled, cfg.IMECacheEnabled)

	h := &Handlers{
		db:            db,
		cfg:           cfg,
		authService:   authService,
		emailService:  emailService,
		nlpService:    nlpService,
		llmService:    llmService,
		paymentService: paymentService,
		streamHub:     newSubmissionStreamHub(),
		imeSvc:        imeSvc,
		imeEnabled:    cfg.IMEEnabled,
	}

	// Suggest engine is created immediately with empty lexicon, then loaded in background.
	// API never returns source "disabled"; returns lexicon_count 0 until load completes.
	eng := suggest.NewEngineWithEmptyData(db, suggest.EngineOptions{
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
	h.suggestEngineMu.Lock()
	h.suggestEngine = eng
	h.suggestEngineMu.Unlock()
	log.Printf("[SUGGEST] In-process suggest engine registered (lexicon loads in background, min_len=%d, top_k=%d)", cfg.SuggestMinLen, cfg.SuggestTopK)

	// Initialize Tamil word cache service
	tamilWordCache := tamil_word_cache.NewCacheService(db, cfg.RedisURL)
	h.tamilWordCache = tamilWordCache

	const cacheLoadTimeout = 15 * time.Minute
	if cfg.PreloadTamilCacheAtStartup {
		// Load cache at startup (block until done). Like JVM preload: first requests get warm cache; startup takes longer.
		log.Printf("[TamilWordCache] Preloading at startup (PRELOAD_TAMIL_CACHE_AT_STARTUP=true)...")
		ctx, cancel := context.WithTimeout(context.Background(), cacheLoadTimeout)
		err := tamilWordCache.InitializeCache(ctx)
		cancel()
		if err != nil {
			log.Printf("[TamilWordCache] Preload failed: %v (app will serve; cache may load later)", err)
		} else {
			log.Printf("[TamilWordCache] Preload complete ✓")
		}
	} else {
		// Preload in background (non-blocking). 15 min timeout for large corpus (227k+ rows) over pooler.
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), cacheLoadTimeout)
			defer cancel()
			if err := tamilWordCache.InitializeCache(ctx); err != nil {
				log.Printf("[TamilWordCache] Failed to initialize cache: %v", err)
			}
		}()
	}

	h.startArchiveCleanup()
	h.startIMEAggregateJob()

	return h
}

// suggestEngine returns the in-process suggest engine, or nil if not yet loaded.
func (h *Handlers) getSuggestEngine() *suggest.Engine {
	h.suggestEngineMu.RLock()
	defer h.suggestEngineMu.RUnlock()
	return h.suggestEngine
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
