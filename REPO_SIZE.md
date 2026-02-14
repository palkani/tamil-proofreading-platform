# Why the repo is large (and how to shrink it)

## What’s taking space

### 1. **On your machine (working tree ≈ 1.3 GB)**

| Directory / file        | Size   | In Git? |
|-------------------------|--------|---------|
| `frontend/node_modules` | ~531 MB | No (ignored) |
| `express-frontend/node_modules` | ~218 MB | No (ignored) |
| `frontend/` (rest)      | ~82 MB  | Yes |
| `backend/`              | ~167 MB | Partly (binaries + code) |
| `services/`             | ~128 MB | Partly (.venv was committed) |
| `data/`                 | ~86 MB  | Yes (large JSON/TSV) |

So a lot of the “GB” you see locally is **node_modules** (ignored). The rest is big **tracked** files and history.

### 2. **In Git history (what makes clone/fetch heavy)**

These **tracked** files are what actually bloat the repo (clone size, GitHub size, fetch/pull):

| File/path | Approx. size | Note |
|-----------|--------------|------|
| `data/lexicon.json` | **85.7 MB** | Full lexicon (intentionally committable per docs) |
| `backend/main` | 20.3 MB | Go binary (should not be in Git) |
| `backend/load-tamil-words-dir` | 13.6 MB | Go binary |
| `backend/extract-tamil-from-wikipedia` | 13.6 MB | Go binary |
| `backend/cmd/extract-tamil-from-wikipedia/extract-tamil` | 13.6 MB | Go binary |
| `backend/cmd/import-tamil-words/import-tamil-words` | 13.7 MB | Go binary |
| `services/ProofTamilRunner/.venv/` (site-packages, .pyc) | ~7+ MB | Python venv (should not be in Git) |
| `express-frontend/eng.traineddata` | 5 MB | Tesseract data |
| `express-frontend/tam.traineddata` | 3.2 MB | Tesseract data |

So the repo is “in GB” because:

- **Locally:** Total folder size is >1 GB (mostly `node_modules` + big data + binaries).
- **On GitHub / clone:** The **pack** is ~60 MB, but it contains the above blobs. Clone size and “repo size” feel large because of `data/lexicon.json`, backend binaries, `.venv`, and traineddata.

---

## How to shrink it

### Step 1: Stop tracking things that shouldn’t be in Git

Add to **`.gitignore`** (if not already):

```gitignore
# Python venv (already often ignored via vendor/)
.venv/
venv/
**/.venv/

# Tesseract traineddata (large; can be downloaded at build time)
*.traineddata

# Go binaries (backend already has backend/server, backend/main)
backend/main
backend/load-tamil-words-dir
backend/extract-tamil-from-wikipedia
backend/cmd/extract-tamil-from-wikipedia/extract-tamil
backend/cmd/import-tamil-words/import-tamil-words
```

Then remove them from the index (keeps files on disk, stops tracking):

```bash
git rm --cached data/lexicon.json          # only if you decide not to keep it in repo
git rm --cached backend/main
git rm --cached backend/load-tamil-words-dir
git rm --cached backend/extract-tamil-from-wikipedia
git rm --cached backend/cmd/extract-tamil-from-wikipedia/extract-tamil
git rm --cached backend/cmd/import-tamil-words/import-tamil-words
git rm --cached express-frontend/eng.traineddata
git rm --cached express-frontend/tam.traineddata
git rm -r --cached services/ProofTamilRunner/.venv
```

Commit. **From this point on** the repo won’t grow with these files, but **old history will still contain them**, so clone size won’t drop much yet.

### Step 2: (Optional) Remove big files from history

To actually **reduce repo size on GitHub** (and clone size), you have to rewrite history so those blobs are gone:

- **BFG Repo-Cleaner:**  
  `bfg --delete-files lexicon.json` (and/or other file names)  
  then `git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
- **git filter-repo** (recommended over filter-branch):  
  Use it to strip the large files from all commits.

After a force-push, everyone should re-clone; old clones will still have the old history.

### Step 3: Keep `data/lexicon.json` out of repo (optional)

If you don’t need the 86 MB lexicon in Git:

- Add `data/lexicon.json` to `.gitignore`.
- `git rm --cached data/lexicon.json` and commit.
- Document in README or BUILD_LEXICON how to generate or download it (e.g. build script, CI, or external URL).

That single file is the biggest contributor to repo size.

---

## Summary

- **“Repo size in GB”** = big **tracked** files (lexicon, Go binaries, .venv, traineddata) plus, on your machine, **node_modules** (ignored but large).
- **Quick win:** Update `.gitignore` and `git rm --cached` the large files above so new commits don’t add them; repo growth stops.
- **Real shrink:** Use BFG or git filter-repo to remove those files from **all history**, then force-push and re-clone.
