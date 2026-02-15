package migrations

import (
	"database/sql"
	"embed"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	"gorm.io/gorm"
)

// SQL file names in order (schema, RPCs, data). Embedded so migrations run in Cloud Run without filesystem.
var dbArchitectureSQLFiles = []string{
	"01_db_architecture_schema.sql",
	"02_db_architecture_rpcs.sql",
	"03_db_architecture_data.sql",
}

//go:embed sql/*.sql
var dbArchitectureFS embed.FS

// MigrateDBArchitecture runs the DB architecture SQL scripts. If phonetic_variants does not exist,
// runs 01 (schema), 02 (RPCs), 03 (data). If the table already exists (e.g. after a partial run),
// runs only 03 (data) so population and materialized view refresh can complete. Idempotent and safe to re-run.
func MigrateDBArchitecture(db *gorm.DB) error {
	if db == nil || db.Dialector.Name() != "postgres" {
		return nil
	}
	var exists int
	err := db.Raw(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'phonetic_variants'`).Scan(&exists).Error
	if err != nil {
		return err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}

	filesToRun := dbArchitectureSQLFiles
	if exists == 1 {
		log.Println("[MIGRATIONS] phonetic_variants already exists; running data migration (03) only")
		filesToRun = []string{"03_db_architecture_data.sql"}
	}

	for _, name := range filesToRun {
		body, err := readMigrationSQL(name)
		if err != nil {
			log.Printf("[MIGRATIONS] DB architecture: skip %s: %v", name, err)
			continue
		}
		script := strings.TrimSpace(string(body))
		if script == "" {
			continue
		}
		if name == "03_db_architecture_data.sql" {
			err = runDataMigrationWithNoTimeout(sqlDB, script)
		} else {
			_, err = sqlDB.Exec(script)
		}
		if err != nil && !isAlreadyExistsOrBind(err) {
			log.Printf("[MIGRATIONS] DB architecture: %s failed: %v", name, err)
			return err
		}
		log.Printf("[MIGRATIONS] DB architecture: ran %s", name)
	}
	return nil
}

// runDataMigrationWithNoTimeout runs 03 in two phases so Supabase statement_timeout does not kill it.
// Phase 1: INSERTs + UPDATE in a transaction with SET LOCAL statement_timeout = '0'.
// Phase 2: REFRESH MATERIALIZED VIEW CONCURRENTLY + ANALYZE (cannot run in tx) with statement_timeout = '0' in same Exec.
func runDataMigrationWithNoTimeout(db *sql.DB, script string) error {
	const refreshMarker = "REFRESH MATERIALIZED VIEW CONCURRENTLY"
	idx := strings.Index(script, refreshMarker)
	if idx < 0 {
		// No REFRESH in script; run all in a transaction with no timeout
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		if _, err := tx.Exec("SET LOCAL statement_timeout = '0'"); err != nil {
			return err
		}
		part1 := stripStatementTimeoutLines(script)
		if _, err := tx.Exec(part1); err != nil {
			return err
		}
		return tx.Commit()
	}
	part1 := strings.TrimSpace(stripStatementTimeoutLines(script[:idx]))
	part2 := strings.TrimSpace(script[idx:])

	// Phase 1: INSERTs + UPDATE in transaction with no timeout
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec("SET LOCAL statement_timeout = '0'"); err != nil {
		return err
	}
	if _, err := tx.Exec(part1); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	// Phase 2: REFRESH + ANALYZE (must run outside tx); same connection gets no timeout via single Exec
	phase2 := "SET statement_timeout = '0';\n" + part2
	_, err = db.Exec(phase2)
	return err
}

func stripStatementTimeoutLines(s string) string {
	// Remove "SET statement_timeout = ..." and "RESET statement_timeout" so we control timeout from Go
	var out []string
	for _, line := range strings.Split(s, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "SET statement_timeout") || strings.HasPrefix(trimmed, "RESET statement_timeout") {
			continue
		}
		out = append(out, line)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// readMigrationSQL returns SQL for name: from embedded fs (sql/<name>) or from disk (migrations/sql/<name>).
func readMigrationSQL(name string) ([]byte, error) {
	embedPath := "sql/" + name
	if data, err := fs.ReadFile(dbArchitectureFS, embedPath); err == nil {
		return data, nil
	}
	sqlDir := findMigrationsSQLDir()
	if sqlDir == "" {
		return nil, os.ErrNotExist
	}
	return os.ReadFile(filepath.Join(sqlDir, name))
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
