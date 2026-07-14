package main

import (
	"log"
	"net/http"
	"os"
	"strings"
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

// seedBillingDataIfNeeded seeds plans and FX rates when RUN_MIGRATIONS=false.
// It is idempotent — it only inserts rows that don't yet exist.
func seedBillingDataIfNeeded(db *gorm.DB) {
	// Seed PRO_MONTHLY plan
	var count int64
	db.Model(&models.Plan{}).Where("code = ?", "PRO_MONTHLY").Count(&count)
	if count == 0 {
		plan := models.Plan{
			Code:            "PRO_MONTHLY",
			Name:            "ProofTamil Pro (Monthly)",
			Description:     "Unlimited proofreading with AI-powered suggestions",
			BaseCurrency:    "USD",
			BasePriceUSD:    1200,
			IndiaMultiplier: 0.75,
			BillingInterval: "month",
			Active:          true,
			TrialDays:       0,
			Features:        `["unlimited_proofreading","ai_suggestions","export_pdf","priority_support"]`,
		}
		if err := db.Create(&plan).Error; err != nil {
			log.Printf("[SEED] Warning: Failed to seed PRO_MONTHLY: %v", err)
		} else {
			log.Println("[SEED] Seeded PRO_MONTHLY plan")
		}
	}

	// Seed PRO_YEARLY plan
	db.Model(&models.Plan{}).Where("code = ?", "PRO_YEARLY").Count(&count)
	if count == 0 {
		plan := models.Plan{
			Code:            "PRO_YEARLY",
			Name:            "ProofTamil Pro (Yearly)",
			Description:     "Unlimited proofreading — save 20%",
			BaseCurrency:    "USD",
			BasePriceUSD:    11520,
			IndiaMultiplier: 0.75,
			BillingInterval: "year",
			Active:          true,
			TrialDays:       0,
			Features:        `["unlimited_proofreading","ai_suggestions","export_pdf","priority_support","early_access"]`,
		}
		if err := db.Create(&plan).Error; err != nil {
			log.Printf("[SEED] Warning: Failed to seed PRO_YEARLY: %v", err)
		} else {
			log.Println("[SEED] Seeded PRO_YEARLY plan")
		}
	}

	// Ensure trial_days=0 for any existing plans
	db.Model(&models.Plan{}).Where("code IN ?", []string{"PRO_MONTHLY", "PRO_YEARLY"}).Update("trial_days", 0)

	// Seed premium_enabled feature flag
	db.Model(&models.FeatureFlag{}).Where("key = ?", "premium_enabled").Count(&count)
	if count == 0 {
		flag := models.FeatureFlag{
			Key:            "premium_enabled",
			Enabled:        true,
			Description:    "Global toggle for premium features",
			UpdatedByAdmin: 1,
			Reason:         "Initial setup",
		}
		if err := db.Create(&flag).Error; err != nil {
			log.Printf("[SEED] Warning: Failed to seed premium_enabled flag: %v", err)
		} else {
			log.Println("[SEED] Seeded premium_enabled feature flag")
		}
	}

	// Seed today's USD/INR FX rate if missing
	today := time.Now().Truncate(24 * time.Hour)
	db.Model(&models.FXRate{}).Where("base_currency = ? AND quote_currency = ? AND as_of_date = ?", "USD", "INR", today).Count(&count)
	if count == 0 {
		fxRate := models.FXRate{
			BaseCurrency:  "USD",
			QuoteCurrency: "INR",
			Rate:          84.0,
			AsOfDate:      today,
			Source:        "seed",
		}
		if err := db.Create(&fxRate).Error; err != nil {
			log.Printf("[SEED] Warning: Failed to seed USD/INR FX rate: %v", err)
		} else {
			log.Println("[SEED] Seeded USD/INR FX rate (84.0)")
		}
	}
}

// initBillingHandlers initializes all billing-related services and handlers.
// Also returns the DodoAdapter so callers (main.go) can hand it to the
// shared Handlers struct — the admin backfill endpoint needs Dodo REST
// access and there's no other clean seam to inject it through.
func initBillingHandlers(db *gorm.DB, cfg *config.Config) (*handlers.BillingHandlers, *billing.DodoAdapter) {
	quoteSecret := os.Getenv("BILLING_QUOTE_SECRET")

	// DodoPayments credentials
	dodoAPIKey := os.Getenv("DODO_PAYMENTS_API_KEY")
	dodoWebhookSecret := os.Getenv("DODO_PAYMENTS_WEBHOOK_SECRET")
	dodoEnvironment := os.Getenv("DODO_ENVIRONMENT") // "production" or "test"
	dodoProductIndia := os.Getenv("DODO_PRODUCT_ID_INDIA")
	dodoProductGlobal := os.Getenv("DODO_PRODUCT_ID_GLOBAL")

	successURL := os.Getenv("BILLING_SUCCESS_URL")
	if successURL == "" {
		successURL = "https://prooftamil.com/billing/success"
	}
	cancelURL := os.Getenv("BILLING_CANCEL_URL")
	if cancelURL == "" {
		cancelURL = "https://prooftamil.com/billing/cancel"
	}

	pricingService := billing.NewPricingService(db, quoteSecret)
	dodoAdapter := billing.NewDodoAdapter(dodoAPIKey, dodoWebhookSecret, dodoEnvironment,
		dodoProductIndia, dodoProductGlobal, successURL, cancelURL)

	billingService := billing.NewBillingService(db, pricingService, dodoAdapter)
	webhookService := billing.NewWebhookService(billingService, dodoAdapter)

	if dodoAdapter.IsConfigured() {
		log.Println("[BILLING] DodoPayments: active")
	} else {
		log.Println("[BILLING] DodoPayments: not configured — set DODO_PAYMENTS_API_KEY to enable payments")
	}
	log.Println("[BILLING] Services initialized")

	return handlers.NewBillingHandlers(billingService, webhookService, pricingService), dodoAdapter
}

func main() {
	log.Println("Starting Tamil Proofreading Platform Backend...")

	// Load configuration
	cfg := config.Load()

	if cfg.SupabaseURL != "" && cfg.SupabaseJWTSecret == "" {
		log.Printf("[CONFIG] SUPABASE_URL is set but SUPABASE_JWT_SECRET is empty — Google sign-in will work if your project uses JWT Signing Keys (RS256/ES256). If you still see 'Invalid or expired Supabase token', set SUPABASE_JWT_SECRET (Project Settings → API → JWT Secret) for legacy HS256 tokens.")
	}
	if cfg.SupabaseURL == "" {
		log.Printf("[CONFIG] SUPABASE_URL is not set — Google sign-in via Supabase will fail with 'supabase url not set; cannot fetch JWKS'. Set SUPABASE_URL in your deployment (e.g. Cloud Run) to your Supabase project URL: https://YOUR_PROJECT_REF.supabase.co")
	}

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
		// Suggest endpoints: return 200 with empty suggestions during startup (exact format: success + suggestions only).
		if path == "/api/v1/suggest" || path == "/api/v1/transliterate/suggest" || path == "/api/v1/ime/suggest" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"success":true,"suggestions":[]}`))
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

	// Initialize database with retry logic.
	// PreferSimpleProtocol: true avoids prepared-statement errors with Supabase pooler (stmtcache_* does not exist, bind message format).
	var db *gorm.DB
	var err error
	for i := 0; i < 5; i++ {
		db, err = gorm.Open(postgres.New(postgres.Config{
			DSN:                   cfg.DatabaseURL,
			PreferSimpleProtocol:  true,
		}), &gorm.Config{
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
		// Limit pool size so we don't exceed Supabase Session mode (pooler port 5432) max clients.
		// Use Transaction mode (port 6543) in DATABASE_URL if you need more concurrency.
		const maxOpen = 10
		const maxIdle = 5
		sqlDB.SetMaxOpenConns(maxOpen)
		sqlDB.SetMaxIdleConns(maxIdle)
		// Recycle connections before pooler/server closes them (avoids "unexpected EOF" on long loads).
		sqlDB.SetConnMaxLifetime(5 * time.Minute)
		sqlDB.SetConnMaxIdleTime(1 * time.Minute)
		log.Printf("Database pool: max_open=%d max_idle=%d conn_max_lifetime=5m conn_max_idle=1m (Supabase-friendly)", maxOpen, maxIdle)
		log.Println("Database connected and ping OK (Supabase/Postgres)")
	}

	// Run migrations by default (RUN_MIGRATIONS=true). Set RUN_MIGRATIONS=false to skip and reduce cold-start time.
	if cfg.RunMigrations {
		log.Println("Running database migrations...")
		if err := db.AutoMigrate(
			&models.User{},
			&models.DraftGroup{},
			&models.AIContentDraft{},
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
			&models.PasswordResetToken{},
		); err != nil {
			if !strings.Contains(err.Error(), "already exists") && !strings.Contains(err.Error(), "42710") {
				log.Printf("Warning: AutoMigrate failed: %v", err)
			}
		}
		var newsletterErr, affiliateErr, billingErr, aiReqErr error
		doneCh := make(chan struct{}, 4)
		go func() { newsletterErr = migrations.MigrateNewsletterSubscribers(db); doneCh <- struct{}{} }()
		go func() { affiliateErr = migrations.MigrateAffiliates(db); doneCh <- struct{}{} }()
		go func() { billingErr = migrations.MigrateBilling(db); doneCh <- struct{}{} }()
		go func() { aiReqErr = migrations.MigrateAIRequests(db); doneCh <- struct{}{} }()
		for i := 0; i < 4; i++ {
			<-doneCh
		}
		if newsletterErr != nil {
			log.Printf("Warning: Newsletter migration failed: %v", newsletterErr)
		}
		if affiliateErr != nil {
			log.Printf("Warning: Affiliate migration failed: %v", affiliateErr)
		}
		if aiReqErr != nil {
			log.Printf("Warning: AI requests migration failed: %v", aiReqErr)
		}
		if billingErr != nil {
			log.Printf("Warning: Billing migration failed: %v", billingErr)
		}
		if cfg.RunDBArchitectureMigrations {
			if dbArchErr := migrations.MigrateDBArchitecture(db); dbArchErr != nil {
				log.Printf("Warning: DB architecture migration failed: %v", dbArchErr)
			}
		}
		// DB architecture (phonetic_variants, RPCs, data) is not run here when RunDBArchitectureMigrations=false. Run from local: go run ./cmd/migrate
	} else {
		log.Println("Skipping migrations (RUN_MIGRATIONS=false)")
	}

	// Unconditionally ensure the hot-path columns exist. This closes
	// the gap that RUN_MIGRATIONS=false leaves open — a new field
	// lands on a Go model, the corresponding ALTER never runs in
	// production, every insert fails with SQLSTATE 42703 until
	// someone manually clicks Setup tables. EnsureCoreSchema uses
	// only ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS,
	// so it's safe on every startup regardless of the flag above.
	migrations.EnsureCoreSchema(db)

	// Initialize handlers (do not block on index migration — run it after server is ready)
	h := handlers.New(db, cfg)
	
	// Initialize billing services
	billingHandlers, dodoAdapter := initBillingHandlers(db, cfg)
	// Hand the Dodo REST client to the shared handlers so admin backfill
	// endpoints can query Dodo directly (see AdminBackfillCustomerID).
	h.SetDodoAdapter(dodoAdapter)

	// Start renewal reminder service (sends 7-day pre-renewal emails daily).
	renewalSvc := billing.NewRenewalService(db)
	go renewalSvc.RunDailyLoop()

	// Billing reconciliation cron — diffs users vs subscriptions hourly and
	// emails contact@prooftamil.com on any drift. Gated by an env var so it
	// only runs on one region (leader), preventing duplicate alerts when we
	// deploy the same image to asia + us. Set RECONCILIATION_ENABLED=true
	// on exactly one region.
	if strings.EqualFold(strings.TrimSpace(os.Getenv("RECONCILIATION_ENABLED")), "true") {
		reconcileSvc := billing.NewReconciliationService(db)
		go reconcileSvc.RunHourlyLoop()
		log.Println("[BILLING] Reconciliation service: enabled (hourly)")
	} else {
		log.Println("[BILLING] Reconciliation service: disabled (set RECONCILIATION_ENABLED=true on exactly one region)")
	}

	// Abandoned-checkout follow-up cron. Same gating pattern as
	// reconciliation — must run on exactly one region to avoid sending
	// duplicate reminder emails. Reuses RECONCILIATION_ENABLED so
	// operators only manage one env var; both jobs share the "leader"
	// designation semantically.
	if strings.EqualFold(strings.TrimSpace(os.Getenv("RECONCILIATION_ENABLED")), "true") {
		followUpSvc := billing.NewCheckoutFollowUpService(db)
		go followUpSvc.RunHourlyLoop()
		log.Println("[BILLING] Checkout follow-up service: enabled (hourly)")
	} else {
		log.Println("[BILLING] Checkout follow-up service: disabled (gated by RECONCILIATION_ENABLED)")
	}

	// Ensure billing seed data exists even when RUN_MIGRATIONS=false.
	// seedBillingDataIfNeeded is idempotent: it only inserts missing rows.
	go seedBillingDataIfNeeded(db)

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
			auth.GET("/google", h.GoogleAuthStart)       // Start OAuth (redirect to Google; use BACKEND_URL so callback matches)
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

		// Submit: optional auth so home page AI Assistant works without login (save_draft=false).
		// Do NOT use AuthMiddleware here: expired/invalid token must be treated as anonymous, not 401.
		// When save_draft=true the handler requires user and returns 401 if not authenticated.
		v1.POST("/submit", middleware.OptionalAuthMiddleware(cfg.JWTSecret), h.SubmitText)

		// Public IP-country detection — read-only, no side effects.
		// Used by the pricing page to render local currency before login.
		v1.GET("/geo/country", h.DetectCountry)

		// Protected routes (require authentication)
		protected := v1.Group("")
		protected.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		{
			// User profile
			protected.GET("/me", h.GetCurrentUser)
			protected.POST("/auth/change-password", h.ChangePassword)
			protected.POST("/user/country", h.UpdateUserCountry)

			// Submissions (draft list, get/update/delete) - submit is above with optional auth
			protected.GET("/submissions", h.GetSubmissions)
			protected.GET("/submissions/archived", h.GetArchivedSubmissions)
			protected.GET("/submissions/:id", h.GetSubmission)
			protected.PATCH("/submissions/:id", h.UpdateSubmission)
			protected.POST("/submissions/:id/duplicate", h.DuplicateSubmission)
			protected.PUT("/submissions/:id/archive", h.ArchiveSubmission)
			protected.PUT("/submissions/:id/unarchive", h.UnarchiveSubmission)
			protected.DELETE("/submissions/:id", h.DeleteSubmission)
			protected.GET("/submissions/:id/stream", h.StreamSubmission)

			// Draft groups (organize drafts by named groups)
			protected.GET("/draft-groups", h.GetDraftGroups)
			protected.POST("/draft-groups", h.CreateDraftGroup)
			protected.PATCH("/draft-groups/:id", h.UpdateDraftGroup)
			protected.DELETE("/draft-groups/:id", h.DeleteDraftGroup)

			// AI Content Writer drafts (separate from proofreading submissions)
			protected.POST("/ai-content-drafts", h.CreateAIContentDraft)
			protected.GET("/ai-content-drafts", h.GetAIContentDrafts)
			protected.GET("/ai-content-drafts/:id", h.GetAIContentDraft)
			protected.PATCH("/ai-content-drafts/:id", h.UpdateAIContentDraft)
			protected.DELETE("/ai-content-drafts/:id", h.DeleteAIContentDraft)

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

		// Admin routes — 60 requests/minute per admin user. Enough headroom
		// for interactive UI browsing (list refreshes, autocomplete) but
		// stops any single admin session from being a runaway load source
		// (e.g. a stuck spinner hammering the endpoint).
		admin := v1.Group("/admin")
		admin.Use(middleware.AuthMiddleware(cfg.JWTSecret))
		admin.Use(middleware.RateLimitMiddleware(60, time.Minute))
		admin.Use(middleware.AdminMiddleware(db))
		{
			admin.GET("/users", h.AdminGetUsers)
			admin.GET("/users/:id", h.AdminGetUserDetail)
			admin.POST("/users/:id/email", h.AdminSendUserEmail)
			admin.POST("/users/:id/impersonate", h.AdminStartImpersonation)
			admin.POST("/impersonation/end", h.AdminEndImpersonation)
			admin.POST("/subscriptions/backfill-customer-id", h.AdminBackfillCustomerID)
			// Ops utilities — trigger crons on demand and ensure DB schema.
			admin.GET("/ops/health", h.AdminOpsHealth)
			admin.POST("/ops/ensure-billing-tables", h.AdminEnsureBillingTables)
			admin.POST("/ops/run-checkout-followup", h.AdminRunCheckoutFollowup)
			admin.POST("/ops/run-reconciliation", h.AdminRunReconciliation)
			admin.GET("/overview", h.AdminGetOverview)
			admin.GET("/ai-requests/summary", h.AdminGetAIRequestsSummary)
			admin.GET("/ai-requests/users", h.AdminListAIRequestUsers)
			admin.GET("/ai-requests/user/:id", h.AdminGetAIRequestUser)
			admin.GET("/issues", h.AdminGetIssues)
			admin.GET("/activity", h.AdminGetActivity)
			admin.POST("/broadcasts/dry-run", h.AdminBroadcastDryRun)
			admin.POST("/broadcasts", h.AdminBroadcastSend)
			admin.GET("/broadcasts", h.AdminBroadcastList)
			admin.GET("/broadcasts/:id", h.AdminBroadcastGet)
			admin.GET("/analytics", h.AdminGetAnalytics)
			admin.GET("/analytics-dashboard", h.GetAnalyticsDashboard)
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
			billingRoutes.GET("/checkout-status", h.GetCheckoutStatus)
			
			// Authenticated billing endpoints
			billingRoutes.POST("/checkout-session", middleware.AuthMiddleware(cfg.JWTSecret), billingHandlers.CreateCheckoutSession)
			billingRoutes.GET("/me", middleware.AuthMiddleware(cfg.JWTSecret), billingHandlers.GetBillingStatus)
			billingRoutes.GET("/usage/today", middleware.AuthMiddleware(cfg.JWTSecret), h.GetUsageToday)
			billingRoutes.POST("/cancel", middleware.AuthMiddleware(cfg.JWTSecret), billingHandlers.CancelSubscription)

			// DodoPayments webhook — matches the URL configured in the Dodo dashboard:
			// https://prooftamil.com/api/v1/billing/webhook
			billingRoutes.POST("/webhook", billingHandlers.DodoWebhook)
		}

		// Abandoned-checkout drip email endpoints. Public (unauth) —
		// identity comes from the signed token in the URL. Both live
		// off /api/v1/ but are also exposed at the root so email links
		// can be shortened later without a breaking migration.
		dunning := handlers.NewDunningHandler(db, billingHandlers.BillingService())
		v1.GET("/checkout/resume", dunning.ResumeCheckout)
		v1.GET("/email/unsubscribe", dunning.Unsubscribe)
	}

	// Same dunning endpoints exposed at the root so drip-email CTA
	// URLs can be short and stable (api.prooftamil.com/checkout/resume
	// rather than /api/v1/checkout/resume). Duplicating the mount is
	// cheaper than a redirect and keeps CTAs one hop away from Dodo.
	{
		dunning := handlers.NewDunningHandler(db, billingHandlers.BillingService())
		r.GET("/checkout/resume", dunning.ResumeCheckout)
		r.GET("/email/unsubscribe", dunning.Unsubscribe)
	}

	// OCR proxy routes (if configured)
	r.POST("/api/v1/ocr/upload", h.OCRUpload)
	r.GET("/api/v1/ocr/download/:filename", h.OCRDownload)
	r.GET("/api/v1/ocr/health", h.OCRHealth)

	// AI Content Writer quota endpoints. Weekly rolling window; 2/week
	// for Free, effectively unlimited for Pro. Both require auth —
	// anonymous callers get 401 from AuthMiddleware, which Express
	// translates into the signup wall on the /tools/ai-content-writer
	// page.
	r.GET("/api/v1/ai-content-writer/quota", middleware.AuthMiddleware(cfg.JWTSecret), h.GetAIContentWriterQuota)
	r.POST("/api/v1/ai-content-writer/consume", middleware.AuthMiddleware(cfg.JWTSecret), h.ConsumeAIContentWriterQuota)

	readyHandler.Store(r)
	log.Printf("[STARTUP] Backend ready; full router active")

	// Run Tamil words index migration in background only when migrations are enabled (skips quickly if indexes exist).
	if cfg.RunMigrations {
		go func() {
			if idxErr := migrations.MigrateTamilWordsIndex(db); idxErr != nil {
				log.Printf("Warning: Tamil words index migration: %v", idxErr)
			}
		}()
	}

	select {} // block forever
}
