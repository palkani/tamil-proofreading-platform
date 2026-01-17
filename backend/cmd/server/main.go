package main

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/handlers"
	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/translit"
)

// resolveLexiconPath tries env override first, then common relative locations.
func resolveLexiconPath() string {
	if p := os.Getenv("LEXICON_PATH"); p != "" {
		return p
	}

	candidates := []string{}

	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, "data", "tamil_lexicon.json"))
	}
	if execPath, err := os.Executable(); err == nil {
		execDir := filepath.Dir(execPath)
		candidates = append(candidates, filepath.Join(execDir, "data", "tamil_lexicon.json"))
	}
	// Fallback to project-relative path
	candidates = append(candidates, "data/tamil_lexicon.json")

	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return candidates[len(candidates)-1]
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("========================================")
	log.Printf("[INIT] Tamil Proofreading Backend starting on port %s", port)
	log.Printf("========================================")

	// Load configuration early to wire middleware (CORS, JWT, rate limits)
	cfg := config.Load()

	// Load in-memory Tamil lexicon for transliteration
	lexiconPath := resolveLexiconPath()
	if err := translit.LoadLexicon(lexiconPath); err != nil {
		log.Printf("[ERROR] Failed to load Tamil lexicon from %s: %v", lexiconPath, err)
		log.Printf("[INFO] Transliteration will not work without lexicon. Set LEXICON_PATH if stored elsewhere.")
	} else {
		log.Printf("[SUCCESS] Tamil lexicon loaded from %s", lexiconPath)
	}

	// Create router with security middleware first
	router := gin.New()
	router.Use(
		gin.Logger(),
		gin.Recovery(),
		middleware.RequestID(),
		middleware.SecurityHeaders(),
		middleware.BodySizeLimit(2*1024*1024), // 2MB body cap to reduce abuse
		middleware.SanitizeInput(),
		middleware.CORS(cfg.FrontendURL),
	)

	// Health/ready endpoints stay public and lightweight
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "tamil-proofreading-backend",
			"time":    time.Now().Unix(),
		})
	})
	router.GET("/ready", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"ready": "checking database...",
		})
	})

	var db *gorm.DB
	var err error

	db, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Printf("[ERROR] Database connection failed: %v", err)
		log.Printf("[INFO] Server running but database operations will fail")
	} else {
		log.Printf("[SUCCESS] Connected to database")

		// Only run migrations if SKIP_MIGRATIONS is not set to "true"
		// In production, set SKIP_MIGRATIONS=true to avoid running migrations on every deploy
		skipMigrations := os.Getenv("SKIP_MIGRATIONS")
		if skipMigrations == "true" {
			log.Printf("[INFO] Skipping database migrations (SKIP_MIGRATIONS=true)")
		} else {
			log.Printf("[INFO] Running database migrations...")
			err = db.AutoMigrate(
				&models.User{},
				&models.Submission{},
				&models.BlogPost{},
				&models.Payment{},
				&models.Usage{},
				&models.RefreshToken{},
				&models.ContactMessage{},
				&models.TamilWord{},
				&models.VisitEvent{},
				&models.ActivityEvent{},
				&models.DailyVisitStats{},
				&models.DailyActivityStats{},
				&models.EmailVerification{},
				&models.PasswordResetToken{},
			)
			if err != nil {
				log.Printf("[ERROR] Database migration failed: %v", err)
			} else {
				log.Printf("[SUCCESS] Database migrations completed")
			}
		}
	}

	// Initialize handlers
	h := handlers.New(db, cfg)

	// Frontend workspace served from Cloud Run to keep auth cookies on same host
	router.GET("/workspace", h.WorkspacePage)

	// Setup API routes
	api := router.Group("/api/v1")
	{
		api.GET("/whoami", h.WhoAmI) // diagnostic
		api.GET("/ime/suggest", h.IMESuggest)
		// Public routes (rate-limited per IP)
		api.Use(middleware.RateLimitMiddleware(90, time.Minute))
		api.POST("/auth/register", h.Register)
		api.POST("/auth/login", h.Login)
		api.POST("/auth/logout", h.Logout)
		api.POST("/auth/refresh", h.RefreshAccessToken)
		api.POST("/auth/otp/send", h.SendOTP)
		api.POST("/auth/otp/verify", h.VerifyOTP)
		api.GET("/auth/google", h.GoogleAuthStart)
		api.POST("/auth/social", h.SocialLogin)
		api.GET("/auth/google/callback", h.GoogleCallback)
		api.POST("/auth/password-strength", h.CheckPasswordStrength)
		api.POST("/auth/forgot-password", h.ForgotPassword)
		api.POST("/auth/reset-password", h.ResetPassword)
		api.GET("/autocomplete", h.AutocompleteTamil)
		api.POST("/transliterate", h.Transliterate)
		api.POST("/tamil-words", h.AddTamilWord)
		api.POST("/tamil-words/confirm", h.ConfirmTamilWord)
		api.GET("/transliterate/suggest", h.TransliterateSuggest)
		api.POST("/validate", h.ValidateText)
		api.POST("/webhooks/stripe", h.StripeWebhook)
		api.POST("/webhooks/razorpay", h.RazorpayWebhook)
		// IMPORTANT: Submit supports anonymous inline proofreading when save_draft=false.
		// Auth is enforced inside the handler only for draft-saving mode.
		api.POST("/submit", middleware.OptionalAuthMiddleware(cfg.JWTSecret), h.SubmitText)

		// Public blog routes
		api.GET("/blog/posts", h.BlogListPublished)
		api.GET("/blog/posts/:slug", h.BlogGetPublishedBySlug)
	}

	// Protected routes enforce JWT validation before any DB access
	protected := api.Group("")
	protected.Use(
		middleware.AuthMiddleware(cfg.JWTSecret),
		middleware.RateLimitMiddleware(300, time.Minute),
	)
	{
		protected.GET("/auth/me", h.GetCurrentUser)
		protected.GET("/submissions", h.GetSubmissions)
		protected.GET("/submissions/:id", h.GetSubmission)
		protected.DELETE("/submissions/:id", h.ArchiveSubmission)
		protected.GET("/stream/submissions/:id", h.StreamSubmission)
		protected.GET("/archive", h.GetArchivedSubmissions)
		// Blog (protected)
		protected.POST("/blog/posts", h.BlogCreatePost)
		protected.PUT("/blog/posts/:id", h.BlogUpdatePost)
		protected.GET("/blog/me/posts", h.BlogListMyPosts)
		protected.POST("/contact", h.SubmitContactMessage)
		protected.POST("/payments/create", h.CreatePayment)
		protected.POST("/payments/verify", h.VerifyPayment)
		protected.GET("/payments", h.GetPayments)
		protected.GET("/dashboard/stats", h.GetDashboardStats)
		protected.GET("/usage", h.GetUsage)
		protected.POST("/events/activity", h.LogActivity)
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
		admin.GET("/analytics-dashboard", h.GetAnalyticsDashboard)
	}

	log.Printf("[SUCCESS] All routes registered")
	log.Printf("[INFO] Server is ready. Press Ctrl+C to exit")

	if err := router.Run(":" + port); err != nil {
		log.Printf("[ERROR] Router failed: %v", err)
	}
}
