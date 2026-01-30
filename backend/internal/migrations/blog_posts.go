package migrations

import (
	"log"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

// MigrateBlogPosts creates the blog_posts table if it doesn't exist.
func MigrateBlogPosts(db *gorm.DB) error {
	if db == nil {
		return nil
	}

	log.Println("[MIGRATIONS] Running BlogPost migration...")

	// Create the table if it doesn't exist
	if err := db.AutoMigrate(&models.BlogPost{}); err != nil {
		log.Printf("[MIGRATIONS] BlogPost AutoMigrate failed: %v", err)
		return err
	}

	log.Println("[MIGRATIONS] BlogPost table created/updated successfully")

	// After table exists, widen text columns if needed
	if err := EnsureBlogPostTextColumns(db); err != nil {
		// Log but don't fail - table exists, just column widening failed
		log.Printf("[MIGRATIONS] BlogPost column widening failed (non-fatal): %v", err)
	}

	return nil
}

// EnsureBlogPostTextColumns widens blog post large-text columns for DBs where
// older schemas may have created them as VARCHAR/limited sizes.
//
// NOTE: GORM AutoMigrate often will not widen/alter existing column types, so we
// do this explicitly to prevent "partial content saved" issues.
func EnsureBlogPostTextColumns(db *gorm.DB) error {
	if db == nil {
		return nil
	}

	// Default gorm table name for BlogPost is "blog_posts".
	// If your naming strategy differs, update these statements accordingly.
	table := "blog_posts"

	dialect := db.Dialector.Name()
	switch dialect {
	case "postgres":
		stmts := []string{
			`ALTER TABLE ` + table + ` ALTER COLUMN content_html TYPE TEXT`,
			`ALTER TABLE ` + table + ` ALTER COLUMN content_text TYPE TEXT`,
			`ALTER TABLE ` + table + ` ALTER COLUMN excerpt TYPE TEXT`,
			`ALTER TABLE ` + table + ` ALTER COLUMN meta_description TYPE TEXT`,
			`ALTER TABLE ` + table + ` ALTER COLUMN keywords TYPE TEXT`,
		}
		for _, s := range stmts {
			if err := db.Exec(s).Error; err != nil {
				// Some managed DBs may block ALTER at runtime; surface but keep app alive.
				log.Printf("[MIGRATIONS] BlogPost column widen failed (postgres): %v (sql=%s)", err, s)
				return err
			}
		}
		return nil

	case "mysql":
		// LONGTEXT gives plenty of headroom for HTML + full content.
		stmts := []string{
			`ALTER TABLE ` + table + ` MODIFY COLUMN content_html LONGTEXT`,
			`ALTER TABLE ` + table + ` MODIFY COLUMN content_text LONGTEXT NOT NULL`,
			`ALTER TABLE ` + table + ` MODIFY COLUMN excerpt LONGTEXT`,
			`ALTER TABLE ` + table + ` MODIFY COLUMN meta_description LONGTEXT`,
			`ALTER TABLE ` + table + ` MODIFY COLUMN keywords LONGTEXT`,
		}
		for _, s := range stmts {
			if err := db.Exec(s).Error; err != nil {
				log.Printf("[MIGRATIONS] BlogPost column widen failed (mysql): %v (sql=%s)", err, s)
				return err
			}
		}
		return nil

	default:
		// sqlite + others: generally store strings as TEXT already; skip.
		return nil
	}
}


