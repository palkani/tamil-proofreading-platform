package handlers

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"sync"
	"time"

	"tamil-proofreading-platform/backend/internal/cache"
	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/ime"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/repository"
	"tamil-proofreading-platform/backend/internal/services/auth"
	"tamil-proofreading-platform/backend/internal/services/email"
	"tamil-proofreading-platform/backend/internal/services/llm"
	"tamil-proofreading-platform/backend/internal/services/nlp"
	"tamil-proofreading-platform/backend/internal/services/payment"
	"tamil-proofreading-platform/backend/internal/suggest"
	"tamil-proofreading-platform/backend/internal/translit"

	"github.com/MicahParks/keyfunc/v2"
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
	suggestEngine   *suggest.Engine
	suggestEngineMu sync.RWMutex
	// DB path for suggest (Postgres RPC + hot cache when SUGGEST_USE_DB=true)
	suggestRepo *repository.SuggestRepo
	hotCache    *cache.HotCache
	// supabaseJWKS is lazily initialized for RS256/ES256 token verification (Supabase JWT Signing Keys)
	supabaseJWKS   *keyfunc.JWKS
	supabaseJWKSMu sync.Mutex
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
	// Redis disabled for suggest: use in-memory LocalSelectionStore only (avoids ~5s DialTimeout when Redis unreachable).
	eng := suggest.NewEngineWithEmptyData(db, suggest.EngineOptions{
		MinLen:           cfg.SuggestMinLen,
		LimitDefault:     cfg.SuggestTopK,
		MaxTopPerNode:    cfg.SuggestTrieTopK,
		CacheEntries:     cfg.SuggestCacheEntries,
		CacheTTL:         time.Duration(cfg.SuggestCacheTTLMS) * time.Millisecond,
		RefreshSec:       cfg.LexiconRefreshSec,
		VowelCollapse:    cfg.SuggestVowelCollapse,
		RedisURL:         "", // not used; suggest uses in-memory personalization only
		RedisTimeoutMs:   cfg.SuggestRedisTimeoutMS,
		LoadBatchSize:    cfg.SuggestLoadBatchSize,
		LoadLimit:        cfg.SuggestLoadLimit,
		BatchTimeoutSec:  cfg.SuggestBatchTimeoutSec,
		LexiconFile:      cfg.LexiconFile,
	})
	h.suggestEngineMu.Lock()
	h.suggestEngine = eng
	h.suggestEngineMu.Unlock()
	log.Printf("[SUGGEST] In-process suggest engine registered (lexicon loads in background, min_len=%d, top_k=%d)", cfg.SuggestMinLen, cfg.SuggestTopK)

	// Load translit fallback lexicon from same file so /transliterate/suggest returns suggestions when trie is empty or still loading
	if path := cfg.LexiconFile; path != "" {
		go func() {
			if err := translit.LoadLexiconFromSuggestFile(path); err != nil {
				log.Printf("[TRANSLIT] LoadLexiconFromSuggestFile %q failed: %v", path, err)
			} else {
				log.Printf("[TRANSLIT] Fallback lexicon loaded from %q", path)
			}
		}()
	}

	// DB path for suggest: Postgres RPC + hot cache (when SUGGEST_USE_DB=true and phonetic_variants exists)
	if cfg.SuggestUseDB && sqlDB != nil {
		h.suggestRepo = repository.NewSuggestRepo(sqlDB)
		hc, err := cache.NewHotCache(sqlDB)
		if err != nil {
			log.Printf("[SUGGEST] HotCache init failed: %v (DB suggest will use RPC only)", err)
		} else {
			h.hotCache = hc
			log.Printf("[SUGGEST] DB path enabled: SuggestRepo + HotCache")
		}
	}

	h.startArchiveCleanup()
	h.startIMEAggregateJob()

	return h
}

// getSuggestEngine returns the in-process suggest engine, or nil if not yet loaded.
func (h *Handlers) getSuggestEngine() *suggest.Engine {
	h.suggestEngineMu.RLock()
	defer h.suggestEngineMu.RUnlock()
	return h.suggestEngine
}

// WaitSuggestReady blocks until the suggest engine's first lexicon load completes or ctx is done.
// Call before marking the server ready so the first suggest request is fast (no 5s DB fallback).
func (h *Handlers) WaitSuggestReady(ctx context.Context) {
	eng := h.getSuggestEngine()
	if eng == nil {
		return
	}
	select {
	case <-ctx.Done():
		log.Printf("[SUGGEST] Wait for lexicon load timed out; backend ready with empty suggest until load completes")
	case <-eng.Ready():
		log.Printf("[SUGGEST] Lexicon load complete; first suggest request will be fast")
	}
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
