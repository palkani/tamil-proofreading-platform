package main

import (
	"log"
	"os"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/handlers"
	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto-migrate database models
	err = db.AutoMigrate(
		&models.User{},
		&models.Submission{},
		&models.Payment{},
		&models.Usage{},
		&models.RefreshToken{},
		&models.ContactMessage{},
	)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Initialize handlers
	h := handlers.New(db, cfg)

	// Setup router
	router := gin.Default()

	// Request tracing and security headers
	router.Use(middleware.RequestID())
	router.Use(middleware.SecurityHeaders())

	// CORS middleware
	router.Use(middleware.CORS(cfg.FrontendURL))

	// Rate limiting middleware
	router.Use(middleware.RateLimitMiddleware(100, 60*time.Second)) // 100 requests per minute
	router.Use(middleware.SecurityMonitoring(5, 5*time.Minute))

	// Input sanitization
	router.Use(middleware.SanitizeInput())
	router.Use(middleware.BodySizeLimit(10 * 1024 * 1024)) // 10 MB max payload

	// Public routes
	api := router.Group("/api/v1")
	{
		api.POST("/auth/register", h.Register)
		api.POST("/auth/login", h.Login)
		api.POST("/auth/logout", h.Logout)
		api.POST("/auth/refresh", h.RefreshAccessToken)
		api.POST("/auth/otp/send", h.SendOTP)
		api.POST("/auth/otp/verify", h.VerifyOTP)
		api.POST("/auth/social", h.SocialLogin)
	}

	// Protected routes
	protected := api.Group("")
	protected.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	{
		protected.GET("/auth/me", h.GetCurrentUser)
		protected.POST("/submit", h.SubmitText)
		protected.GET("/submissions", h.GetSubmissions)
		protected.GET("/submissions/:id", h.GetSubmission)
		protected.DELETE("/submissions/:id", h.ArchiveSubmission)
		protected.GET("/stream/submissions/:id", h.StreamSubmission)
		protected.GET("/archive", h.GetArchivedSubmissions)
		protected.POST("/contact", h.SubmitContactMessage)
		protected.POST("/payments/create", h.CreatePayment)
		protected.POST("/payments/verify", h.VerifyPayment)
		protected.GET("/payments", h.GetPayments)
		protected.GET("/dashboard/stats", h.GetDashboardStats)
		protected.GET("/usage", h.GetUsage)
	}

	// Admin routes
	admin := protected.Group("/admin")
	admin.Use(middleware.AdminMiddleware(db))
	{
		admin.GET("/users", h.AdminGetUsers)
		admin.PUT("/users/:id", h.AdminUpdateUser)
		admin.DELETE("/users/:id", h.AdminDeleteUser)
		admin.GET("/payments", h.AdminGetPayments)
		admin.GET("/analytics", h.AdminGetAnalytics)
		admin.GET("/model-logs", h.AdminGetModelLogs)
		admin.GET("/contact", h.AdminListContactMessages)
	}

	// Webhook routes (no auth required, verified by signature)
	api.POST("/webhooks/stripe", h.StripeWebhook)
	api.POST("/webhooks/razorpay", h.RazorpayWebhook)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
