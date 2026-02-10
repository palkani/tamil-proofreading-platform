package main

import (
	"log"
	"net/http"
	"os"
	"sync/atomic"
	"time"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/handlers"
	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/migrations"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/services/billing"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// initBillingHandlers initializes all billing-related services and handlers
func initBillingHandlers(db *gorm.DB, cfg *config.Config) *handlers.BillingHandlers {
	// Get billing configuration from environment
	stripeAPIKey := os.Getenv("STRIPE_SECRET_KEY")
	stripeWebhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	razorpayKeyID := os.Getenv("RAZORPAY_KEY_ID")
	razorpayKeySecret := os.Getenv("RAZORPAY_KEY_SECRET")
	razorpayWebhookSecret := os.Getenv("RAZORPAY_WEBHOOK_SECRET")
	quoteSecret := os.Getenv("BILLING_QUOTE_SECRET")
	
	successURL := os.Getenv("BILLING_SUCCESS_URL")
	if successURL == "" {
		successURL = "https://prooftamil.com/billing/success"
	}
	cancelURL := os.Getenv("BILLING_CANCEL_URL")
	if cancelURL == "" {
		cancelURL = "https://prooftamil.com/billing/cancel"
	}
	
	// Initialize services
	pricingService := billing.NewPricingService(db, quoteSecret)
	stripeAdapter := billing.NewStripeAdapter(db, stripeAPIKey, stripeWebhookSecret, successURL, cancelURL)
	razorpayAdapter := billing.NewRazorpayAdapter(db, razorpayKeyID, razorpayKeySecret, razorpayWebhookSecret)
	billingService := billing.NewBillingService(db, pricingService, stripeAdapter, razorpayAdapter)
	webhookService := billing.NewWebhookService(billingService, stripeAdapter, razorpayAdapter)
	
	log.Println("[BILLING] Services initialized")
	
	return handlers.NewBillingHandlers(billingService, webhookService, pricingService)
}

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

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Listen on 8080 immediately so Cloud Run startup TCP probe succeeds.
	// Until DB + migrations + handlers are ready, /health returns 503; suggest endpoints return 200 with empty suggestions.
	var readyHandler atomic.Value
	wrapper := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if v := readyHandler.Load(); v != nil {
			v.(http.Handler).ServeHTTP(w, req)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		path := req.URL.Path
		// Suggest endpoints: return 200 with empty suggestions during startup so clients don't see 503.
		if path == "/api/v1/suggest" || path == "/api/v1/transliterate/suggest" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"success":true,"suggestions":[],"source":"starting","q":"","query":""}`))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"starting"}`))
	})
	go func() {
		log.Printf("Listening on port %s (startup probe ready)", port)
		if err := http.ListenAndServe(":"+port, wrapper); err != nil {
			log.Fatal("HTTP server failed:", err)
		}
	}()

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
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		if pingErr := sqlDB.Ping(); pingErr != nil {
			log.Fatalf("Database ping failed (connection not usable): %v", pingErr)
		}
		log.Println("Database connected and ping OK (Supabase/Postgres)")
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
		&models.BlogPost{},
	); err != nil {
		log.Printf("Warning: AutoMigrate failed: %v", err)
	}

	// Run custom migrations (one-off / schema fixes only)
	if err := migrations.MigrateNewsletterSubscribers(db); err != nil {
		log.Printf("Warning: Newsletter migration failed: %v", err)
	}
	if err := migrations.MigrateAffiliates(db); err != nil {
		log.Printf("Warning: Affiliate migration failed: %v", err)
	}
	if err := migrations.MigrateBilling(db); err != nil {
		log.Printf("Warning: Billing migration failed: %v", err)
	}

	// Initialize handlers
	h := handlers.New(db, cfg)
	
	// Initialize billing services
	billingHandlers := initBillingHandlers(db, cfg)

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
			auth.POST("/supabase-token", h.SupabaseTokenExchange)
			auth.POST("/google/callback", h.GoogleCallback)
			auth.GET("/google/callback", h.GoogleCallback)
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
			protected.DELETE("/submissions/:id", h.DeleteSubmission)
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
			
			// Billing admin endpoints
			admin.GET("/feature-flags/premium_enabled", billingHandlers.AdminGetGlobalPremiumStatus)
			admin.PATCH("/feature-flags/premium_enabled", billingHandlers.AdminSetGlobalPremium)
			admin.PATCH("/users/:id/premium_override", billingHandlers.AdminSetUserPremiumOverride)
		}

		// Affiliate user routes (authenticated affiliates can view their own data)
		affiliateRoutes := v1.Group("/affiliate")
		affiliateRoutes.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		{
			affiliateRoutes.GET("/me", h.AffiliateGetMe)
			affiliateRoutes.GET("/stats", h.AffiliateGetStats)
			affiliateRoutes.GET("/earnings", h.AffiliateGetEarnings)
		}
		
		// Billing routes
		billingRoutes := v1.Group("/billing")
		{
			// Public billing endpoints
			billingRoutes.GET("/plans", billingHandlers.GetPlans)
			billingRoutes.GET("/pricing", billingHandlers.GetPricing)
			
			// Authenticated billing endpoints
			billingRoutes.POST("/checkout-session", middleware.AuthMiddleware(cfg.JWTSecret), billingHandlers.CreateCheckoutSession)
			billingRoutes.GET("/me", middleware.AuthMiddleware(cfg.JWTSecret), billingHandlers.GetBillingStatus)
			billingRoutes.POST("/cancel", middleware.AuthMiddleware(cfg.JWTSecret), billingHandlers.CancelSubscription)
			billingRoutes.POST("/verify-razorpay", middleware.AuthMiddleware(cfg.JWTSecret), billingHandlers.VerifyRazorpayPayment)
		}
		
		// Webhook routes (no auth - signature verified in handler)
		webhooks := v1.Group("/webhooks")
		{
			webhooks.POST("/stripe", billingHandlers.StripeWebhook)
			webhooks.POST("/razorpay", billingHandlers.RazorpayWebhook)
		}
	}

	// OCR proxy routes (if configured)
	r.POST("/api/v1/ocr/upload", h.OCRUpload)
	r.GET("/api/v1/ocr/download/:filename", h.OCRDownload)
	r.GET("/api/v1/ocr/health", h.OCRHealth)

	// Switch traffic to full app (Cloud Run startup probe already passed)
	readyHandler.Store(r)
	log.Println("Backend ready; full router active")

	select {} // block forever
}
