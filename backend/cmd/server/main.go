package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/handlers"
	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/migrations"
	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	log.Println("Starting Tamil Proofreading Platform Backend...")

	// Load configuration
	cfg := config.Load()

	// Set Gin mode based on environment
	if os.Getenv("GIN_MODE") == "" {
		if os.Getenv("ENVIRONMENT") == "production" {
			gin.SetMode(gin.ReleaseMode)
		} else {
			gin.SetMode(gin.DebugMode)
		}
	}

	// Initialize database with retry logic
	var db *gorm.DB
	var err error
	for i := 0; i < 5; i++ {
		db, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err == nil {
			break
		}
		log.Printf("Database connection attempt %d failed: %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("Failed to connect to database after retries:", err)
	}

	// Run migrations
	log.Println("Running database migrations...")
	if err := db.AutoMigrate(
		&models.User{},
		&models.TamilWord{},
		&models.Submission{},
		&models.Usage{},
		&models.Payment{},
		&models.RefreshToken{},
		&models.SuggestionLimit{},
		&models.SuggestionAcceptEvent{},
		&models.TamilBigram{},
		&models.TamilPhrase{},
	); err != nil {
		log.Printf("Warning: AutoMigrate failed: %v", err)
	}

	// Run custom migrations
	if err := migrations.MigrateBlogPosts(db); err != nil {
		log.Printf("Warning: Blog posts migration failed: %v", err)
	}
	if err := migrations.MigrateNewsletterSubscribers(db); err != nil {
		log.Printf("Warning: Newsletter migration failed: %v", err)
	}
	if err := migrations.MigrateAffiliates(db); err != nil {
		log.Printf("Warning: Affiliate migration failed: %v", err)
	}

	// Initialize handlers
	h := handlers.New(db, cfg)

	// Initialize Gin router
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.Logger())

	// CORS configuration
	corsConfig := cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID", "Cookie"},
		ExposeHeaders:    []string{"Content-Length", "Set-Cookie"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	r.Use(cors.New(corsConfig))

	// Security headers
	r.Use(middleware.SecurityHeaders())

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "tamil-proofreading-backend",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	// API v1 routes
	v1 := r.Group("/api/v1")
	{
		// Public endpoints
		v1.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		// Auth routes
		auth := v1.Group("/auth")
		{
			auth.POST("/register", h.Register)
			auth.POST("/login", h.Login)
			auth.POST("/logout", h.Logout)
			auth.POST("/refresh", h.RefreshAccessToken)
			auth.POST("/google/callback", h.GoogleCallback)
			auth.POST("/forgot-password", h.ForgotPassword)
			auth.POST("/reset-password", h.ResetPassword)
			auth.GET("/whoami", h.WhoAmI)
		}

		// Transliteration routes (public)
		v1.POST("/transliterate", h.Transliterate)
		v1.GET("/transliterate/suggest", h.TransliterateSuggest)

		// IME routes (public)
		v1.GET("/ime/suggest", h.IMESuggest)

		// Suggestion routes (in-process engine)
		v1.GET("/suggest", h.Suggest)

		// Tamil word routes (public read)
		v1.GET("/tamil-words/autocomplete", h.AutocompleteTamil)

		// Newsletter routes (public)
		newsletter := v1.Group("/newsletter")
		{
			newsletter.POST("/subscribe", h.SubscribeNewsletter)
			newsletter.GET("/confirm/:token", h.ConfirmSubscription)
			newsletter.GET("/unsubscribe", h.UnsubscribeNewsletter)
			newsletter.POST("/unsubscribe", h.UnsubscribeNewsletter)
			newsletter.GET("/count", h.GetSubscriberCount)
		}

		// Blog routes (public read)
		v1.GET("/blog/posts", h.BlogListPublished)
		v1.GET("/blog/posts/:slug", h.BlogGetPublishedBySlug)

		// Contact form (public)
		v1.POST("/contact", h.SubmitContactMessage)

		// Analytics routes (public for tracking)
		v1.POST("/events/activity", h.LogActivity)

		// Protected routes (require authentication)
		protected := v1.Group("")
		protected.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		{
			// User profile
			protected.GET("/me", h.GetCurrentUser)

			// Submissions
			protected.POST("/submit", h.SubmitText)
			protected.GET("/submissions", h.GetSubmissions)
			protected.GET("/submissions/:id", h.GetSubmission)
			protected.PUT("/submissions/:id/archive", h.ArchiveSubmission)
			protected.GET("/submissions/:id/stream", h.StreamSubmission)

			// Tamil word management
			protected.POST("/tamil-words", h.AddTamilWord)

			// Payment routes
			protected.POST("/payments/create", h.CreatePayment)
			protected.POST("/payments/verify", h.VerifyPayment)
			protected.GET("/payments", h.GetPayments)

			// Suggestion limits
			protected.GET("/suggestion-limits", h.CheckSuggestionLimit)

			// Blog routes (authenticated users can create/manage their posts)
			protected.POST("/blog/posts", h.BlogCreatePost)
			protected.PUT("/blog/posts/:id", h.BlogUpdatePost)
			protected.DELETE("/blog/posts/:id", h.BlogDeletePost)
			protected.GET("/blog/me/posts", h.BlogListMyPosts)

			// IME learning routes
			protected.POST("/transliterate/accept", h.TransliterateAccept)
		}

		// Admin routes
		admin := v1.Group("/admin")
		admin.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		admin.Use(middleware.AdminMiddleware(db))
		{
			admin.GET("/users", h.AdminGetUsers)
			admin.GET("/analytics", h.AdminGetAnalytics)
			admin.GET("/dashboard", h.GetDashboardStats)
			admin.GET("/subscribers", h.AdminListSubscribers)
			
			// Affiliate management (admin only)
			admin.POST("/affiliates", h.AdminCreateAffiliate)
			admin.GET("/affiliates", h.AdminListAffiliates)
			admin.PATCH("/affiliates/:id/status", h.AdminUpdateAffiliateStatus)
			admin.POST("/affiliates/:id/regenerate-code", h.AdminRegenerateAffiliateCode)
		}

		// Affiliate user routes (authenticated affiliates can view their own data)
		affiliateRoutes := v1.Group("/affiliate")
		affiliateRoutes.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		{
			affiliateRoutes.GET("/me", h.AffiliateGetMe)
			affiliateRoutes.GET("/stats", h.AffiliateGetStats)
			affiliateRoutes.GET("/earnings", h.AffiliateGetEarnings)
		}
	}

	// OCR proxy routes (if configured)
	r.POST("/api/v1/ocr/upload", h.OCRUpload)
	r.GET("/api/v1/ocr/download/:filename", h.OCRDownload)
	r.GET("/api/v1/ocr/health", h.OCRHealth)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
