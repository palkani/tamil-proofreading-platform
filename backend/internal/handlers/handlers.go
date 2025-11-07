package handlers

import (
	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/services/auth"
	"tamil-proofreading-platform/backend/internal/services/llm"
	"tamil-proofreading-platform/backend/internal/services/nlp"
	"tamil-proofreading-platform/backend/internal/services/payment"

	"gorm.io/gorm"
)

type Handlers struct {
	db            *gorm.DB
	cfg           *config.Config
	authService   *auth.AuthService
	nlpService    *nlp.TamilNLPService
	llmService    *llm.LLMService
	paymentService *payment.PaymentService
}

func New(db *gorm.DB, cfg *config.Config) *Handlers {
	authService := auth.NewAuthService(db, cfg.JWTSecret)
	nlpService := nlp.NewTamilNLPService()
	llmService := llm.NewLLMService(cfg.OpenAIAPIKey, nlpService)
	paymentService := payment.NewPaymentService(db, cfg)

	return &Handlers{
		db:             db,
		cfg:            cfg,
		authService:    authService,
		nlpService:     nlpService,
		llmService:     llmService,
		paymentService: paymentService,
	}
}

