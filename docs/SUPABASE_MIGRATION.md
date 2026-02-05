# Supabase Migration (Database Connection Only)

This document describes how to point the Go backend (and optionally the Node suggest-service, if still in use) at Supabase Postgres instead of Google Cloud SQL. **Supabase Auth is a separate, later phase**—this migration is connection and data only.

## Steps

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In **Project Settings → Database**, copy the **Connection string** (URI format). Use the "Session mode" or "Transaction" pooler if you prefer; for the Go backend, the direct connection string is typically used.

Example format:

```
postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Or direct:

```
postgresql://postgres:[PASSWORD]@db.[ref].supabase.co:5432/postgres
```

### 2. Export data from Google Cloud SQL (if migrating existing data)

```bash
pg_dump -h YOUR_CLOUD_SQL_IP -U postgres -d tamil_db -F c -f dump.backup
```

### 3. Import into Supabase (optional)

Using Supabase SQL Editor or `psql`:

```bash
# If using .backup format, use pg_restore
pg_restore -h db.YOUR_PROJECT.supabase.co -U postgres -d postgres dump.backup

# Or run SQL dumps if you exported as SQL
psql "postgresql://postgres:[PASSWORD]@db.[ref].supabase.co:5432/postgres" -f dump.sql
```

### 4. Update backend environment

Set `DATABASE_URL` to the Supabase connection string. No code changes are required; the backend already uses `DATABASE_URL` in [backend/internal/config/config.go](backend/internal/config/config.go).

**Example (env file or deployment):**

```bash
# Old (Google Cloud SQL)
# DATABASE_URL=postgresql://user:pass@CLOUD_SQL_IP:5432/tamil_db

# New (Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

If using Supabase connection pooler (port 6543):

```bash
DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

### 5. Run migrations

Start the Go backend with the new `DATABASE_URL`. GORM AutoMigrate and custom migrations in [backend/cmd/server/main.go](backend/cmd/server/main.go) will run on startup. If you imported an existing schema, ensure it matches the expected tables (users, submissions, etc.). If starting fresh, migrations will create the schema.

### 6. (Optional) Suggest-service

If the Node suggest-service is still deployed and uses the same database, set its `DATABASE_URL` to the same Supabase connection string so it reads from the same data.

### 7. Supabase Auth (later phase)

To use Supabase Auth instead of custom JWT:

- Backend would need to validate Supabase-issued JWTs and map to internal user ID (e.g. in [backend/internal/services/auth](backend/internal/services/auth) and [backend/internal/handlers/auth_handlers.go](backend/internal/handlers/auth_handlers.go)).
- Frontend would use Supabase client for sign-in/sign-up and send the Supabase token to the Go API.

This is not required for the connection-only migration above.

## Indexes (optional)

After import or migration, you can add indexes for common queries:

```sql
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_user_id_date ON usage(user_id, date);
```

## Rollback

To roll back, point `DATABASE_URL` back to the original Google Cloud SQL (or previous) connection string and restart the backend.
