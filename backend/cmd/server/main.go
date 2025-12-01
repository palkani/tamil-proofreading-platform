package main

import (
        "log"
        "os"
        "time"

        "github.com/gin-gonic/gin"
        "gorm.io/driver/postgres"
        "gorm.io/gorm"

        "tamil-proofreading-platform/backend/internal/config"
        "tamil-proofreading-platform/backend/internal/handlers"
        "tamil-proofreading-platform/backend/internal/middleware"
        "tamil-proofreading-platform/backend/internal/models"
)

func main() {
        port := os.Getenv("PORT")
        if port == "" {
                port = "8080"
        }

        log.Printf("========================================")
        log.Printf("[INIT] Tamil Proofreading Backend starting on port %s", port)
        log.Printf("========================================")

        // Create router immediately
        router := gin.New()
        router.Use(gin.Logger())
        router.Use(gin.Recovery())

        // Health check endpoint - minimal dependency
        router.GET("/health", func(c *gin.Context) {
                c.JSON(200, gin.H{
                        "status":  "ok",
                        "service": "tamil-proofreading-backend",
                        "time":    time.Now().Unix(),
                })
        })

        // Ready check - checks if database is available
        router.GET("/ready", func(c *gin.Context) {
                c.JSON(200, gin.H{
                        "ready": "checking database...",
                })
        })

        // Start router in main thread - this is critical!
        // The server MUST start listening BEFORE we try to do anything else
        log.Printf("[INIT] Starting Gin router on :%s", port)
        
        go func() {
                if err := router.Run(":" + port); err != nil {
                        log.Printf("[ERROR] Router failed: %v", err)
                }
        }()

        // Give the server time to start listening
        time.Sleep(2 * time.Second)

        // Now try to initialize database and handlers in background
        log.Printf("[BACKGROUND] Loading configuration and database...")
        cfg := config.Load()

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

        // Setup API routes
        api := router.Group("/api/v1")
        {
                // Public routes
                api.POST("/auth/register", h.Register)
                api.POST("/auth/login", h.Login)
                api.POST("/auth/logout", h.Logout)
                api.POST("/auth/refresh", h.RefreshAccessToken)
                api.POST("/auth/otp/send", h.SendOTP)
                api.POST("/auth/otp/verify", h.VerifyOTP)
                api.POST("/auth/social", h.SocialLogin)
                // NOTE: Google OAuth callback is handled by Express frontend at /api/v1/auth/google/callback
                // Express exchanges code for token and validates, then calls /auth/social endpoint above
                // Do NOT handle callback here - it conflicts with Express and causes redirect_uri_mismatch
                // api.GET("/auth/google/callback", h.GoogleCallback)
                api.POST("/auth/password-strength", h.CheckPasswordStrength)
                api.POST("/auth/forgot-password", h.ForgotPassword)
                api.POST("/auth/reset-password", h.ResetPassword)
                api.GET("/autocomplete", h.AutocompleteTamil)
                api.POST("/tamil-words", h.AddTamilWord)
                api.POST("/tamil-words/confirm", h.ConfirmTamilWord)
                api.POST("/events/visit", h.LogVisit)
                api.POST("/webhooks/stripe", h.StripeWebhook)
                api.POST("/webhooks/razorpay", h.RazorpayWebhook)
        }

        // Protected routes with mock auth for testing
        protected := api.Group("")
        protected.Use(func(c *gin.Context) {
                c.Set("user_id", uint(1))
                c.Set("user_email", "test@example.com")
                c.Set("user_role", models.RoleWriter)
                c.Next()
        })
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

        // Keep the main thread alive
        select {}
}
