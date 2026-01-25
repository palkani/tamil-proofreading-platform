# IME Architecture Fix - Corpus-First Approach

## Problem Statement

### Current Issues:
1. **Layout Fixed** ✅ - AI Assistant now displays side-by-side with editor
2. **Transliteration Quality** ❌ - Still showing incorrect suggestions

### Example:
- Input: `saptiya`
- Current suggestion: `சப்திய` (incorrect)
- Expected: `சப்தியா` (or other contextually appropriate variants)

## Root Cause

### Current Architecture (Broken):
```
User types "saptiya"
    ↓
IME Service (service.go)
    ↓
Aksharamukha API ONLY
    ↓
Returns: சப்திய (incorrect!)
```

**Problem**: Aksharamukha is a generic transliteration engine that doesn't understand:
- Common Tamil words and their correct spellings
- Context and usage patterns
- Regional/spoken vs formal variations

### What User Asked For:
> "I dont this is the correct fix every time we can not add manually every time.  
> Can you do it in correct way . Lets do it a better architect?"

**Translation**: Don't add manual overrides (`common` map). Build a proper corpus-based system.

## Proper Solution: Corpus-First Architecture

### New Architecture (Correct):
```
User types "saptiya"
    ↓
IME Service
    ↓
1. Query Corpus Database (PostgreSQL)
   └─ Tables: corpus_words, corpus_phrases, ime_learning_selections
    ↓
   ├─ FOUND in corpus → Return correct Tamil word ✅
   │
   └─ NOT FOUND → Fallback to Aksharamukha API
       ↓
      Return transliterated word (may be incorrect)
```

### Benefits:
1. **Accuracy**: Corpus contains verified, common Tamil words
2. **Context-aware**: Can store different variants (spoken/formal/academic)
3. **Learning**: User selections improve suggestions over time
4. **Fast**: Database query faster than API call
5. **Scalable**: Add more words without code changes

## Implementation Plan

### Phase 1: Database Integration (CRITICAL)

#### 1.1. Add DB Connection to IME Service

**File**: `backend/internal/ime/service.go`

Current:
```go
type Service struct {
	client       *Client
	cache        *Cache
	freq         freqDict
	basePath     string
	enabled      bool
	cacheEnabled bool
}
```

New:
```go
type Service struct {
	client       *Client
	cache        *Cache
	freq         freqDict
	db           *sql.DB  // ← ADD THIS
	basePath     string
	enabled      bool
	cacheEnabled bool
}
```

#### 1.2. Create Corpus Query Function

**New file**: `backend/internal/ime/corpus.go`

```go
package ime

import (
	"context"
	"database/sql"
	"log"
)

// queryCorpus searches for transliteration in corpus_words table
func (s *Service) queryCorpus(ctx context.Context, latinInput, mode string, limit int) ([]Candidate, error) {
	if s.db == nil {
		return nil, nil // No DB = skip corpus
	}

	query := `
		SELECT tamil_word, frequency, mode
		FROM corpus_words
		WHERE LOWER(latin_equivalent) = LOWER($1)
		AND (mode = $2 OR mode = 'all')
		ORDER BY frequency DESC, tamil_word ASC
		LIMIT $3
	`

	rows, err := s.db.QueryContext(ctx, query, latinInput, mode, limit)
	if err != nil {
		log.Printf("[CORPUS] query error: %v", err)
		return nil, err
	}
	defer rows.Close()

	var cands []Candidate
	for rows.Next() {
		var word, wordMode string
		var freq int
		if err := rows.Scan(&word, &freq, &wordMode); err != nil {
			log.Printf("[CORPUS] scan error: %v", err)
			continue
		}

		// Higher frequency = higher score
		score := 5.0 + (float64(freq) / 1000.0) // Base 5.0, boost by frequency
		cands = append(cands, Candidate{
			Word:       word,
			Score:      score,
			Source:     "corpus",
			RankReason: "corpus_verified",
		})
	}

	return cands, nil
}
```

#### 1.3. Update Suggest() to Use Corpus First

**File**: `backend/internal/ime/service.go`

Current Suggest() flow (line 73):
```go
func (s *Service) Suggest(ctx context.Context, q, mode string, limit int) (cands []Candidate, meta map[string]interface{}) {
	// ... validation ...
	
	// Cache check
	if s.cacheEnabled && s.cache != nil {
		if cached, ok := s.cache.Get(s.key(mode, q, limit)); ok {
			return cached, meta
		}
	}

	// Call Aksharamukha ONLY
	rawWords, rawErr := s.client.Transliterate(ctx, q, mode, limit)
	phonetic := normalizePhonetic(q)
	var phonWords []string
	// ...
}
```

New Suggest() flow:
```go
func (s *Service) Suggest(ctx context.Context, q, mode string, limit int) (cands []Candidate, meta map[string]interface{}) {
	// ... validation ...
	
	// Cache check
	if s.cacheEnabled && s.cache != nil {
		if cached, ok := s.cache.Get(s.key(mode, q, limit)); ok {
			meta["cache"] = "hit"
			meta["latency_ms"] = time.Since(start).Milliseconds()
			return cached, meta
		}
	}

	// ✅ NEW: Try corpus FIRST
	corpusCands, corpusErr := s.queryCorpus(ctx, q, mode, limit)
	if corpusErr == nil && len(corpusCands) > 0 {
		meta["engine"] = "corpus"
		meta["latency_ms"] = time.Since(start).Milliseconds()
		log.Printf("[IME] Corpus hit: q=%q count=%d", q, len(corpusCands))
		
		// Cache and return
		if s.cacheEnabled && s.cache != nil {
			s.cache.Set(s.key(mode, q, limit), corpusCands)
		}
		return corpusCands, meta
	}

	// Corpus miss - fallback to Aksharamukha
	log.Printf("[IME] Corpus miss: q=%q, falling back to Aksharamukha", q)
	rawWords, rawErr := s.client.Transliterate(ctx, q, mode, limit)
	phonetic := normalizePhonetic(q)
	// ... rest of Aksharamukha logic ...
	
	meta["engine"] = "aksharamukha_fallback"
	// ...
}
```

### Phase 2: Corpus Database Schema

**Tables already exist** (from summary):
- `corpus_words` - Latin → Tamil mappings with frequency
- `corpus_phrases` - Multi-word phrases
- `ime_learning_selections` - User selection history for learning

**Schema** (should be in migrations):
```sql
CREATE TABLE IF NOT EXISTS corpus_words (
    id SERIAL PRIMARY KEY,
    latin_equivalent TEXT NOT NULL,
    tamil_word TEXT NOT NULL,
    frequency INT DEFAULT 0,
    mode TEXT DEFAULT 'spoken', -- spoken/formal/academic/all
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_corpus_words_latin ON corpus_words(LOWER(latin_equivalent));
CREATE INDEX idx_corpus_words_mode ON corpus_words(mode);
CREATE INDEX idx_corpus_words_freq ON corpus_words(frequency DESC);

-- Examples:
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('soru', 'சோறு', 1000, 'spoken'),
    ('saptiya', 'சப்தியா', 500, 'all'),
    ('vanakkam', 'வணக்கம்', 5000, 'all'),
    ('eppadi', 'எப்படி', 3000, 'spoken'),
    ('yaarum', 'யாரும்', 2000, 'spoken');
```

### Phase 3: Learning System (Future)

Track user selections to improve suggestions:

```go
// After user selects a suggestion
func (s *Service) RecordSelection(ctx context.Context, latinInput, tamilSelected, mode string) error {
    query := `
        INSERT INTO ime_learning_selections (latin_input, tamil_selected, mode, selected_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (latin_input, tamil_selected, mode) DO UPDATE
        SET selection_count = ime_learning_selections.selection_count + 1,
            last_selected_at = NOW()
    `
    _, err := s.db.ExecContext(ctx, query, latinInput, tamilSelected, mode)
    return err
}
```

Then periodically update `corpus_words.frequency` based on selection counts.

## Deployment Steps

### 1. Update IME Service Constructor

**File**: `backend/cmd/server/main.go` (or wherever IME service is initialized)

Current:
```go
imeService := ime.NewService(basePath, aksharaURL, enabled, cacheEnabled)
```

New:
```go
imeService := ime.NewServiceWithDB(basePath, aksharaURL, db, enabled, cacheEnabled)
```

### 2. Add DB Parameter to NewService

**File**: `backend/internal/ime/service.go`

```go
func NewServiceWithDB(basePath, aksharaURL string, db *sql.DB, enabled bool, cacheEnabled bool) *Service {
	var cache *Cache
	if cacheEnabled {
		cache = NewCache(10 * time.Minute)
	}
	return &Service{
		client:       NewClient(aksharaURL),
		cache:        cache,
		freq:         loadFreqDict(basePath),
		db:           db,  // ← NEW
		basePath:     basePath,
		enabled:      enabled,
		cacheEnabled: cacheEnabled,
	}
}

// Keep old NewService for backward compatibility
func NewService(basePath, aksharaURL string, enabled bool, cacheEnabled bool) *Service {
	return NewServiceWithDB(basePath, aksharaURL, nil, enabled, cacheEnabled)
}
```

### 3. Seed Corpus Database

Use existing seed scripts from summary:
- `seed_corpus_cloudshell.sh`
- `configure_prooftamil_corpus.sh`
- `backend/seed_corpus_direct.sql`

Or add to GitHub Actions workflow:
```yaml
- name: Seed Corpus Database
  run: |
    gcloud sql connect $DB_INSTANCE --user=postgres < backend/seed_corpus_direct.sql
```

## Testing

### Before (Current):
```bash
curl "http://localhost:8080/api/v1/ime/suggest?q=saptiya&mode=spoken&limit=5"
```
Response:
```json
{
  "suggestions": [
    {"word": "சப்திய", "score": 1.0, "source": "aksharamukha"}
  ],
  "meta": {"engine": "aksharamukha"}
}
```

### After (With Corpus):
```bash
curl "http://localhost:8080/api/v1/ime/suggest?q=saptiya&mode=spoken&limit=5"
```
Response:
```json
{
  "suggestions": [
    {"word": "சப்தியா", "score": 5.5, "source": "corpus", "rank_reason": "corpus_verified"}
  ],
  "meta": {"engine": "corpus", "latency_ms": 12}
}
```

### After (Corpus Miss):
```bash
curl "http://localhost:8080/api/v1/ime/suggest?q=xyzabc&mode=spoken&limit=5"
```
Response:
```json
{
  "suggestions": [
    {"word": "க்ஸய்ஜாப்க்", "score": 1.0, "source": "aksharamukha"}
  ],
  "meta": {"engine": "aksharamukha_fallback"}
}
```

## Summary

### What This Fixes:
✅ **Architectural**: Proper corpus-first design, not manual overrides  
✅ **Scalable**: Add words via SQL, not code changes  
✅ **Fast**: Database query < 10ms, Aksharamukha API ~100-500ms  
✅ **Accurate**: Corpus has verified Tamil words  
✅ **Future-proof**: Learning system can improve over time

### What User Sees:
- ✅ Layout fixed (AI Assistant side-by-side)
- ✅ Better transliteration quality (corpus-based)
- ✅ Faster suggestions (database caching)
- ✅ No more manual word-by-word fixes

### Next Steps:
1. Implement corpus query function (`corpus.go`)
2. Update `Suggest()` to use corpus first
3. Add DB connection to IME service initialization
4. Seed corpus database with common words
5. Deploy and test

---

**Priority**: HIGH  
**Impact**: Fixes user's main concern about suggestion quality  
**Effort**: Medium (2-3 hours implementation + testing)
