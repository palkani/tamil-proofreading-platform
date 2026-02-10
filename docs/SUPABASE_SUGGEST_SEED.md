# Why auto-suggestions don’t show (and how to fix it)

The suggest API returns **200 OK** with an **empty** `suggestions` array when the **word list is empty**. The backend loads suggestions from the **`tamil_words`** table. If that table has no rows (or the loader fails), you get no suggestions.

## Fix: seed `tamil_words` in Supabase

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Run the seed script. Use one of:
   - **Option A (recommended):** Copy-paste the contents of **`backend/seed_corpus_supabase.sql`** into the SQL Editor and run it.
   - **Option B:** From your machine (with `psql` and `DATABASE_URL` set to your Supabase Postgres URI):
     ```bash
     psql "$DATABASE_URL" -f backend/seed_corpus_supabase.sql
     ```
3. After the script runs, the suggest engine will pick up the new words:
   - If the backend reloads the lexicon on an interval (e.g. every 10 minutes), wait for the next reload, or
   - Restart the backend (e.g. redeploy on Cloud Run) so the engine loads the seeded data on startup.

## Verify

- Call the suggest API, e.g.  
  `GET /api/v1/suggest?q=ta&limit=5`  
  and check that the response has `suggestions` with items and `meta.lexicon_count > 0`.
- In Supabase SQL Editor:  
  `SELECT COUNT(*) FROM tamil_words;`  
  should return a number greater than 0.

## Optional: more words

- Use **`backend/seed_corpus_minimal.sql`** via `psql` (it uses `\echo`; Supabase SQL Editor doesn’t support that, so use **`seed_corpus_supabase.sql`** in the dashboard).
- Or run the Go seeder:  
  `cd backend && go run ./cmd/seed`  
  (after setting `DATABASE_URL` to your Supabase Postgres URL).
