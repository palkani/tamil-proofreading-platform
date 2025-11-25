package handlers

import (
        "log"
        "time"

        "tamil-proofreading-platform/backend/internal/config"
        "tamil-proofreading-platform/backend/internal/models"
        "tamil-proofreading-platform/backend/internal/services/auth"
        "tamil-proofreading-platform/backend/internal/services/email"
        "tamil-proofreading-platform/backend/internal/services/llm"
        "tamil-proofreading-platform/backend/internal/services/nlp"
        "tamil-proofreading-platform/backend/internal/services/payment"

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
        llmService := llm.NewLLMService(cfg.OpenAIAPIKey, cfg.GoogleGenAIKey, nlpService)
        paymentService := payment.NewPaymentService(db, cfg)

        h := &Handlers{
                db:             db,
                cfg:            cfg,
                authService:    authService,
                emailService:   emailService,
                nlpService:     nlpService,
                llmService:     llmService,
                paymentService: paymentService,
                streamHub:      newSubmissionStreamHub(),
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

func (h *Handlers) cleanupArchivedSubmissions() error {
        cutoff := time.Now().Add(-45 * 24 * time.Hour)
        return h.db.Where("archived = ? AND archived_at < ?", true, cutoff).Delete(&models.Submission{}).Error
}
