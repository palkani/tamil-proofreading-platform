# 🔬 ROOT CAUSE: Poor Suggestion Quality ("saptiya" → "ஸப்திய")

**Issue:** Typing "saptiya" returns only 1 invalid suggestion: "ஸப்திய"  
**Problem:** Words starting with "ஸ" (sa) are invalid in native Tamil

---

## 🎯 THE PROBLEM

### User Expectation
```
Input: "saptiya"
Expected: "சாப்பிட்டியா" (Did you eat?)
         "சாப்பிட்ட" (ate)
         "சப்தம்" (sound/noise)
```

### What User Got
```
Input: "saptiya"
Actual: "ஸப்திய" (INVALID - uses ஸ)
Count: Only 1 suggestion ❌
```

---

## 🔍 ROOT CAUSE ANALYSIS

### The Backend Fallback Chain

**File:** `backend/internal/handlers/transliteration_handlers.go` (Line 115-223)

```go
func (h *Handlers) TransliterateSuggest(c *gin.Context) {
    // ...
    
    // Step 1: Try Node suggest service (BEST quality)
    if h.cfg.SuggestServiceURL != "" {
        if out, ok := h.tryNodeSuggest(...); ok {
            return out  // ✅ High-quality corpus-based suggestions
        }
    }
    
    // Step 2: Try ProofTamilRunner (GOOD quality)
    if h.cfg.TransliteratorBaseURL != "" {
        if out, ok := h.tryRunnerSuggest(...); ok {
            return out  // ✅ Good phonetic suggestions
        }
    }
    
    // Step 3: Try IME service (OK quality)
    if h.imeSvc != nil && h.imeEnabled {
        cands, _ := h.imeSvc.Suggest(ctx, q, mode, limit)
        if len(cands) > 0 {
            return mapCandidatesToSuggestResponse(q, usageLabel, cands)  // ⚠️ Decent
        }
    }
    
    // Step 4: FALLBACK to simple rules (Line 180) ❌ POOR QUALITY!
    suggestions := translit.GetSuggestions(q)  // ← THIS IS THE PROBLEM!
    // Returns basic character-by-character transliteration
    // No corpus, no frequency data, no phonetic intelligence
    // Result: "ஸப்திய" (invalid Tamil word)
}
```

---

## 💥 WHY "ஸப்திய" IS WRONG

### The Letter "ஸ" (sa)

| Letter | Unicode | Name | Usage |
|--------|---------|------|-------|
| ஸ | U+0BB8 | SA | Sanskrit loanwords ONLY |

**Examples of Valid Usage:**
- ஸ்கூல் (school - English loanword)
- ஸ்டேஷன் (station - English loanword)  
- ஸம்ஸ்காரம் (samskaram - Sanskrit loanword)

**For Native Tamil Words:**
- Use "ச" (cha) for "sa" sound
- Use "சா" (chaa) for "saa" sound

### Correct Transliteration

```
"saptiya" should map to:
  ✅ சாப்பிட்டியா (chāppiṭṭiyā) - colloquial "did you eat?"
  ✅ சாப்பிட (chāppiṭa) - "to eat"
  ✅ சப்தம் (chapatam) - "sound/noise"

NOT:
  ❌ ஸப்திய (sapthiya) - Sanskrit-style, incorrect
```

---

## 🧠 WHY THE FALLBACK IS FAILING

### The `translit.GetSuggestions()` Function

This is a **simple rule-based** transliterator:

```go
// Somewhere in backend/internal/translit/
func GetSuggestions(englishText string) []Suggestion {
    // Basic character mapping:
    // s → ஸ  (WRONG for native Tamil!)
    // a → அ
    // p → ப்
    // t → த்
    // i → இ
    // y → ய்
    // a → அ
    
    // Result: ஸப்திய (invalid)
}
```

**Problems:**
1. ❌ No corpus lookup
2. ❌ No frequency data
3. ❌ No phonetic intelligence
4. ❌ Maps "s" → "ஸ" (Sanskrit) instead of "ச" (Tamil)
5. ❌ No word validation
6. ❌ Single suggestion (no alternatives)

---

## ✅ THE FIX STRATEGY

### Option 1: Fix the Fallback (Short-term)

**Improve `translit.GetSuggestions()` to:**
1. ✅ Map "s" → "ச" (not "ஸ") for native words
2. ✅ Map "sa" → "சா"
3. ✅ Generate multiple phonetic variants
4. ✅ Return 5-10 suggestions (not just 1)

### Option 2: Deploy Better Services (Long-term - RECOMMENDED)

**Enable the high-quality systems:**

1. **Node Suggest Service** (Best Quality)
   ```env
   SUGGEST_SERVICE_URL=http://your-node-service:3000
   ```
   - Corpus-based suggestions
   - Frequency-ranked
   - Context-aware
   - Multiple alternatives

2. **ProofTamilRunner** (Good Quality)
   ```env
   TRANSLITERATOR_BASE_URL=https://runner.prooftamil.com
   RUNNER_CLIENT_ID=prooftamil-backend
   RUNNER_API_KEY=your_api_key
   ```
   - Phonetic engine
   - Better character mappings
   - Multiple alternatives

3. **IME Service** (OK Quality)
   ```env
   IME_ENABLED=true
   IME_SERVICE_URL=http://ime-service:8080
   ```
   - Aksharamukha-backed
   - Decent quality
   - Multiple suggestions

---

## 🚀 IMMEDIATE ACTION REQUIRED

### Check Environment Variables

**In your Cloud Run backend, verify:**

```bash
# Are these set?
SUGGEST_SERVICE_URL=?
TRANSLITERATOR_BASE_URL=?
IME_ENABLED=?
```

If they're **NOT set** or **empty**, the backend falls back to the poor-quality `translit.GetSuggestions()`!

### Quick Fix (5 minutes)

**Set environment variables in Cloud Run:**

```bash
# Option A: Use Node suggest service (if you deployed it)
SUGGEST_SERVICE_URL=http://suggest-service:3000

# Option B: Use ProofTamilRunner (if available)
TRANSLITERATOR_BASE_URL=https://runner.prooftamil.com/api/v1
RUNNER_CLIENT_ID=prooftamil-backend
RUNNER_API_KEY=your_actual_key

# Option C: Enable IME service
IME_ENABLED=true
IME_SERVICE_URL=http://ime-service:8080
```

---

## 🧪 TESTING

### Before Fix (Current State)
```
Input: saptiya
Result: ஸப்திய (invalid)
Count: 1 suggestion ❌
```

### After Fix (Expected)
```
Input: saptiya
Results:
  1. சாப்பிட்டியா (did you eat?)
  2. சாப்பிட (to eat)
  3. சப்தம் (sound)
  4. சாப்பாடு (food)
  5. சப்தமாக (loudly)
Count: 5-10 suggestions ✅
Quality: Native Tamil words ✅
```

---

## 📊 BACKEND SYSTEM COMPARISON

| System | Quality | Speed | Deployment |
|--------|---------|-------|------------|
| `translit.GetSuggestions()` | ❌ Poor | ✅ Fast | ✅ Built-in |
| IME Service | ⚠️ OK | ⚠️ Medium | ⚠️ Requires service |
| ProofTamilRunner | ✅ Good | ⚠️ Medium | ✅ Already deployed? |
| Node Suggest Service | ✅✅ Best | ⚠️ Slow | ❌ Needs deployment |

---

## 💡 WHY THIS IS A BACKEND ISSUE

### Not a Frontend Bug

The frontend is working correctly:
- ✅ Calls `/api/transliterate/suggest`
- ✅ Displays whatever backend returns
- ✅ Shows dropdown with suggestions
- ✅ Allows selection

### Backend Returns Poor Data

The backend:
- ❌ Falls back to simple rules
- ❌ Returns "ஸப்திய" (invalid)
- ❌ Returns only 1 suggestion
- ❌ No corpus/frequency data

---

## 🎯 ACTION PLAN

### Step 1: Check Current Config (1 minute)

```bash
# SSH to Cloud Run or check environment variables
echo $SUGGEST_SERVICE_URL
echo $TRANSLITERATOR_BASE_URL
echo $IME_ENABLED
```

### Step 2: Enable Better Service (5 minutes)

**If ProofTamilRunner is available:**
```bash
gcloud run services update tamil-proofreading-backend \
  --set-env-vars="TRANSLITERATOR_BASE_URL=https://runner.prooftamil.com/api/v1,RUNNER_CLIENT_ID=prooftamil-backend,RUNNER_API_KEY=your_key"
```

**Or enable IME service:**
```bash
gcloud run services update tamil-proofreading-backend \
  --set-env-vars="IME_ENABLED=true,IME_SERVICE_URL=http://ime-service:8080"
```

### Step 3: Test (1 minute)

```bash
# Should now return 5-10 high-quality suggestions
curl "https://your-backend/api/transliterate/suggest?q=saptiya&limit=10"
```

### Step 4: Verify in UI (1 minute)

Type "saptiya" → should see multiple valid Tamil suggestions ✅

---

## 🔍 DIAGNOSTIC COMMAND

**Check which system is being used:**

```bash
# Check backend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=tamil-proofreading-backend" --limit 50 --format json | jq -r '.[].textPayload' | grep -i suggest
```

**Look for:**
- `[SUGGEST] len=7 count=1` → Using fallback (bad) ❌
- `ime.runner_suggest_status` → Using ProofTamilRunner ✅
- `ime.node_suggest_error` → Using Node service ✅

---

## 🎉 SUMMARY

**Problem:** "saptiya" → "ஸப்திய" (invalid, only 1 suggestion)

**Root Cause:** Backend falling back to simple rule-based `translit.GetSuggestions()`

**Solution:** Enable one of the better services:
1. ProofTamilRunner (recommended - probably already deployed)
2. Node Suggest Service (best quality - needs deployment)
3. IME Service (decent - needs deployment)

**Quick Fix:** Set environment variables in Cloud Run to enable better service

**Expected Result:** "saptiya" → 5-10 valid Tamil suggestions starting with "ச" ✅

---

**Next Step: Check which services are already deployed and enable them!** 🚀
