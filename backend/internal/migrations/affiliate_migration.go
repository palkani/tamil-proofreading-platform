package migrations

import (
	"log"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

// MigrateAffiliates creates/updates all affiliate-related tables
func MigrateAffiliates(db *gorm.DB) error {
	log.Println("[MIGRATIONS] Running affiliate tables migration...")

	// Add referral fields to users table (if not exists)
	if !db.Migrator().HasColumn(&models.User{}, "referred_by_user_id") {
		if err := db.Migrator().AddColumn(&models.User{}, "referred_by_user_id"); err != nil {
			log.Printf("[MIGRATIONS] Warning: Failed to add referred_by_user_id column: %v", err)
		} else {
			log.Println("[MIGRATIONS] Added referred_by_user_id column to users table")
		}
	}

	if !db.Migrator().HasColumn(&models.User{}, "affiliate_code_used") {
		if err := db.Migrator().AddColumn(&models.User{}, "affiliate_code_used"); err != nil {
			log.Printf("[MIGRATIONS] Warning: Failed to add affiliate_code_used column: %v", err)
		} else {
			log.Println("[MIGRATIONS] Added affiliate_code_used column to users table")
		}
	}

	// Create affiliates table
	if err := db.AutoMigrate(&models.Affiliate{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate Affiliate table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] Affiliate table migrated successfully")

	// Create referrals table
	if err := db.AutoMigrate(&models.Referral{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate Referral table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] Referral table migrated successfully")

	// Create affiliate_earnings table
	if err := db.AutoMigrate(&models.AffiliateEarning{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate AffiliateEarning table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] AffiliateEarning table migrated successfully")

	// Create affiliate_audit_logs table
	if err := db.AutoMigrate(&models.AffiliateAuditLog{}); err != nil {
		log.Printf("[MIGRATIONS] Warning: Failed to migrate AffiliateAuditLog table: %v", err)
		return err
	}
	log.Println("[MIGRATIONS] AffiliateAuditLog table migrated successfully")

	// Create indexes for better query performance
	createAffiliateIndexes(db)

	log.Println("[MIGRATIONS] Affiliate tables migration completed successfully")
	return nil
}

func createAffiliateIndexes(db *gorm.DB) {
	// Index on affiliate code (case-insensitive lookup)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_affiliates_code_upper ON affiliates (UPPER(affiliate_code))`)
	
	// Index on affiliate status for filtering
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates (status)`)
	
	// Index on referral dates for commission period checks
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_referrals_commission_end ON referrals (commission_end_date)`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_referrals_discount_end ON referrals (discount_end_date)`)
	
	// Index on earning month for monthly reports
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_earnings_month ON affiliate_earnings (earning_month)`)
	
	// Index on user referral tracking
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by_user_id) WHERE referred_by_user_id IS NOT NULL`)
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_users_affiliate_code ON users (affiliate_code_used) WHERE affiliate_code_used IS NOT NULL`)
	
	log.Println("[MIGRATIONS] Affiliate indexes created")
}
