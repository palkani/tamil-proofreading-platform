# Build Lexicon Locally and Deploy from File

The suggest engine loads words from a baked **lexicon file** (`data/lexicon.json`). You can either let CI build it from the DB at deploy time, or **build it locally** (with your full table) and **commit it** so deploy uses that file.

## Use a committed lexicon (recommended for full table)

1. **Build the lexicon locally** (full export from your DB):

   ```bash
   cd backend
   export DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
   go run ./cmd/build_lexicon -output ../data/lexicon.json -limit=0 -batch=10000
   ```

   You should see something like: `Wrote ../data/lexicon.json: 495599 rows, ...`

2. **Commit the file**:

   ```bash
   cd ..
   git add data/lexicon.json
   git commit -m "Add full lexicon (data/lexicon.json) for suggest"
   git push
   ```

3. **Deploy** – On the next deploy, the workflow will **skip** building the lexicon in CI and use your committed `data/lexicon.json`. The Docker image will bake that file; the backend loads it from `/root/data/lexicon.json` at startup.

## If you don’t commit a lexicon

- If `data/lexicon.json` is missing or empty in the repo, CI will try to build it from `DATABASE_URL` (GitHub secret). If that’s unset, the image gets an empty `[]` and the backend falls back to loading from the DB at startup (slower).
- So for a full table without depending on CI/DB, build locally and commit `data/lexicon.json` as above.

## File size

- ~80k rows ≈ 11 MB; ~500k rows ≈ 70 MB. Git handles it; if the repo gets large you can use Git LFS for `data/lexicon.json` later.
