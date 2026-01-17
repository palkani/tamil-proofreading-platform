package handlers

import (
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

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handlers struct {
	db             *gorm.DB
	cfg            *config.Config
	authService    *auth.AuthService
	emailService   *email.EmailService
	nlpService     *nlp.TamilNLPService
	llmService     *llm.LLMService
	paymentService *payment.PaymentService
	streamHub      *submissionStreamHub
	imeSvc         *ime.Service
	imeEnabled     bool
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

	imeSvc := ime.NewService(".", cfg.AksharaURL, cfg.IMEEnabled, cfg.IMECacheEnabled)

	h := &Handlers{
		db:             db,
		cfg:            cfg,
		authService:    authService,
		emailService:   emailService,
		nlpService:     nlpService,
		llmService:     llmService,
		paymentService: paymentService,
		streamHub:      newSubmissionStreamHub(),
		imeSvc:         imeSvc,
		imeEnabled:     cfg.IMEEnabled,
	}

	h.startArchiveCleanup()

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
