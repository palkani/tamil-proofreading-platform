package migrations

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"gorm.io/gorm"
)

// SQL file names in order (schema, RPCs, data). Paths tried relative to cwd and to backend root.
var dbArchitectureSQLFiles = []string{
	"01_db_architecture_schema.sql",
	"02_db_architecture_rpcs.sql",
	"03_db_architecture_data.sql",
}

// MigrateDBArchitecture runs the DB architecture SQL scripts (schema, RPCs, data) if the
// phonetic_variants table does not exist yet. SQL files are read from migrations/sql/ relative
// to current working directory or to backend directory. If files are not found, migration is skipped
// (run them manually in Supabase SQL Editor). Idempotent and safe to re-run when RUN_MIGRATIONS=true.
func MigrateDBArchitecture(db *gorm.DB) error {
	if db == nil || db.Dialector.Name() != "postgres" {
		return nil
	}
	var exists int
	err := db.Raw(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'phonetic_variants'`).Scan(&exists).Error
	if err != nil {
		return err
	}
	if exists == 1 {
		log.Println("[MIGRATIONS] phonetic_variants already exists; skipping DB architecture SQL")
		return nil
	}

	sqlDir := findMigrationsSQLDir()
	if sqlDir == "" {
		log.Println("[MIGRATIONS] DB architecture: migrations/sql/ not found (run 01/02/03_db_architecture_*.sql manually in Supabase)")
		return nil
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}

	for _, name := range dbArchitectureSQLFiles {
		path := filepath.Join(sqlDir, name)
		body, err := os.ReadFile(path)
		if err != nil {
			log.Printf("[MIGRATIONS] DB architecture: skip %s: %v", name, err)
			continue
		}
		script := strings.TrimSpace(string(body))
		if script == "" {
			continue
		}
		_, err = sqlDB.Exec(script)
		if err != nil && !isAlreadyExistsOrBind(err) {
			log.Printf("[MIGRATIONS] DB architecture: %s failed: %v", name, err)
			return err
		}
		log.Printf("[MIGRATIONS] DB architecture: ran %s", name)
	}
	return nil
}

func findMigrationsSQLDir() string {
	cwd, _ := os.Getwd()
	candidates := []string{
		filepath.Join(cwd, "migrations", "sql"),
		filepath.Join(cwd, "..", "migrations", "sql"),
		filepath.Join(cwd, "..", "..", "migrations", "sql"),
	}
	for _, d := range candidates {
		if fi, err := os.Stat(d); err == nil && fi.IsDir() {
			return d
		}
	}
	return ""
}
