package migrations

import (
	"log"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

// MigrateBilling creates/updates all billing-related tables
func MigrateBilling(db *gorm.DB) error {
	log.Println("[MIGRATIONS] Running billing tables migration...")

	// Add new billing columns to users table
	if err := migrateUserBillingColumns(db); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to add user billing columns: %v", err)
	}

	// Create plans table
	if err := db.AutoMigrate(&models.Plan{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate Plan table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] Plan table migrated successfully")

	// Create fx_rates table
	if err := db.AutoMigrate(&models.FXRate{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate FXRate table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] FXRate table migrated successfully")

	// Create subscriptions table
	if err := db.AutoMigrate(&models.Subscription{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate Subscription table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] Subscription table migrated successfully")

	// Create invoices table
	if err := db.AutoMigrate(&models.Invoice{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate Invoice table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] Invoice table migrated successfully")

	// Create payment_events table
	if err := db.AutoMigrate(&models.PaymentEvent{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate PaymentEvent table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] PaymentEvent table migrated successfully")

	// Create feature_flags table
	if err := db.AutoMigrate(&models.FeatureFlag{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate FeatureFlag table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] FeatureFlag table migrated successfully")

	// Create billing_audit_logs table
	if err := db.AutoMigrate(&models.BillingAuditLog{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate BillingAuditLog table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] BillingAuditLog table migrated successfully")

	// Create indexes
	createBillingIndexes(db)

	// Seed default data
	seedBillingData(db)

	log.Println("[MIGRATIONS] Billing tables migration completed successfully")
	return nil
}

func migrateUserBillingColumns(db *gorm.DB) error {
	// Add billing columns if they don't exist
	columns := []struct {
		column string
		model  string
	}{
		{"country_code", "country_code"},
		{"billing_country_locked", "billing_country_locked"},
		{"stripe_customer_id", "stripe_customer_id"},
		{"razorpay_customer_id", "razorpay_customer_id"},
		{"premium_override", "premium_override"},
		{"premium_override_reason", "premium_override_reason"},
		{"premium_override_by_admin", "premium_override_by_admin"},
		{"premium_override_at", "premium_override_at"},
		{"token_version", "token_version"},
	}

	for _, col := range columns {
		if !db.Migrator().HasColumn(&models.User{}, col.column) {
			if err := db.Migrator().AddColumn(&models.User{}, col.model); err != nil {
				log.Printf("[MIGRATIONS] Warning: Failed to add %s column: %v", col.column, err)
			} else {
				log.Printf("[MIGRATIONS] Added %s column to users table", col.column)
			}
		}
	}

	return nil
}

func createBillingIndexes(db *gorm.DB) {
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions (user_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub ON subscriptions (provider_subscription_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices (provider, provider_invoice_id)`,
		`CREATE INDEX IF NOT EXISTS idx_payment_events_provider_event ON payment_events (provider_event_id)`,
		`CREATE INDEX IF NOT EXISTS idx_billing_audit_actor ON billing_audit_logs (actor_user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_billing_audit_target ON billing_audit_logs (target_user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_users_razorpay_customer ON users (razorpay_customer_id) WHERE razorpay_customer_id IS NOT NULL`,
	}

	for _, idx := range indexes {
		if err := db.Exec(idx).Error; err != nil {
			log.Printf("[MIGRATIONS] Warning: Failed to create index: %v", err)
		}
	}

	log.Println("[MIGRATIONS] Billing indexes created")
}

func seedBillingData(db *gorm.DB) {
	// Seed default plan if not exists
	var count int64
	db.Model(&models.Plan{}).Where("code = ?", "PRO_MONTHLY").Count(&count)
	if count == 0 {
		plan := &models.Plan{
			Code:            "PRO_MONTHLY",
			Name:            "ProofTamil Pro (Monthly)",
			Description:     "Unlimited proofreading with AI-powered suggestions",
			BaseCurrency:    "USD",
			BasePriceUSD:    1200, // $12.00
			IndiaMultiplier: 0.75, // 25% discount for India
			BillingInterval: "month",
			Active:          true,
			TrialDays:       7,
			Features:        `["unlimited_proofreading", "ai_suggestions", "export_pdf", "priority_support"]`,
		}
		if err := db.Create(plan).Error; err != nil {
			log.Printf("[MIGRATIONS] Warning: Failed to seed PRO_MONTHLY plan: %v", err)
		} else {
			log.Println("[MIGRATIONS] Seeded PRO_MONTHLY plan")
		}
	}

	// Seed yearly plan
	db.Model(&models.Plan{}).Where("code = ?", "PRO_YEARLY").Count(&count)
	if count == 0 {
		plan := &models.Plan{
			Code:            "PRO_YEARLY",
			Name:            "ProofTamil Pro (Yearly)",
			Description:     "Unlimited proofreading with AI-powered suggestions - save 20%",
			BaseCurrency:    "USD",
			BasePriceUSD:    11520, // $115.20 (12 * 12 * 0.8)
			IndiaMultiplier: 0.75,
			BillingInterval: "year",
			Active:          true,
			TrialDays:       7,
			Features:        `["unlimited_proofreading", "ai_suggestions", "export_pdf", "priority_support", "early_access"]`,
		}
		if err := db.Create(plan).Error; err != nil {
			log.Printf("[MIGRATIONS] Warning: Failed to seed PRO_YEARLY plan: %v", err)
		} else {
			log.Println("[MIGRATIONS] Seeded PRO_YEARLY plan")
		}
	}

	// Seed default feature flag
	db.Model(&models.FeatureFlag{}).Where("key = ?", "premium_enabled").Count(&count)
	if count == 0 {
		flag := &models.FeatureFlag{
			Key:            "premium_enabled",
			Enabled:        true,
			Description:    "Global toggle for premium features",
			UpdatedByAdmin: 1, // System
			Reason:         "Initial setup",
		}
		if err := db.Create(flag).Error; err != nil {
			log.Printf("[MIGRATIONS] Warning: Failed to seed premium_enabled flag: %v", err)
		} else {
			log.Println("[MIGRATIONS] Seeded premium_enabled feature flag")
		}
	}

	// Seed a default FX rate for INR (this should be updated by a cron job)
	today := time.Now().Truncate(24 * time.Hour)
	db.Model(&models.FXRate{}).Where("base_currency = ? AND quote_currency = ? AND as_of_date = ?",
		"USD", "INR", today).Count(&count)
	if count == 0 {
		fxRate := &models.FXRate{
			BaseCurrency:  "USD",
			QuoteCurrency: "INR",
			Rate:          83.50, // Example rate - should be updated regularly
			AsOfDate:      today,
			Source:        "seed",
		}
		if err := db.Create(fxRate).Error; err != nil {
			log.Printf("[MIGRATIONS] Warning: Failed to seed FX rate: %v", err)
		} else {
			log.Println("[MIGRATIONS] Seeded USD/INR FX rate")
		}
	}
}
