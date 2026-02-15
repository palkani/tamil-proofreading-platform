// migrate runs the ProofTamil DB architecture migration (schema, RPCs, data) against
// the database given by DATABASE_URL. Run from local only; do not run from Cloud Run or CI.
//
// Usage (from backend/ or repo root with .env containing DATABASE_URL):
//
//	go run ./cmd/migrate
//
// Or:
//
//	DATABASE_URL="postgres://..." go run ./cmd/migrate
package main

import (
	"log"
	"os"

	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/migrations"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime)
	log.Println("[migrate] ProofTamil DB architecture migration (local only)")

	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		log.Fatal("[migrate] DATABASE_URL is required. Set it in .env or the environment.")
	}

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  cfg.DatabaseURL,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("[migrate] Failed to connect to database: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("[migrate] Failed to get *sql.DB: %v", err)
	}
	defer sqlDB.Close()

	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("[migrate] Database ping failed: %v", err)
	}
	log.Println("[migrate] Connected to database")

	if err := migrations.MigrateDBArchitecture(db); err != nil {
		log.Fatalf("[migrate] Migration failed: %v", err)
	}

	log.Println("[migrate] Done. Exiting.")
	os.Exit(0)
}
