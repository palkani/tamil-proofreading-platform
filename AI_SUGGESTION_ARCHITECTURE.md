# AI Suggestion Processing Architecture

## 🎯 Overview

This document explains how AI suggestions flow from Gemini API to the user interface, including all filtering, validation, and modification steps.

---

## 📊 Complete Flow Diagram

```
User Text
    ↓
┌─────────────────────────────────────────────┐
│ 1. GEMINI API CALL                          │
│    - Sends text to Gemini with prompt       │
│    - Receives JSON response                 │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 2. BACKEND FILTERING (Go)                   │
│    llm_service.go                           │
│    ├─ toSuggestionSlice()                   │
│    │  └─ Removes: original == corrected     │
│    └─ fillSuggestionIndices()               │
│       └─ Removes: normalized duplicates     │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 3. BACKEND INDEX FIXING (Go)                │
│    submission_handlers.go                   │
│    └─ Recalculates start/end indices        │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 4. FRONTEND API (Express/Next.js)           │
│    ├─ express-frontend/routes/api.js        │
│    │  └─ JSON repair for chunked responses  │
│    └─ frontend/app/api/gemini/analyze       │
│       └─ Fill missing type/severity/title   │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 5. FRONTEND FILTERING (JavaScript)          │
│    workspace.js / submit/page.tsx           │
│    ├─ Remove normalized duplicates          │
│    ├─ Deduplicate by ID                     │
│    └─ Filter by text matching               │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 6. UI DISPLAY                               │
│    - Show suggestions to user               │
│    - Apply/Ignore buttons                   │
└─────────────────────────────────────────────┘
```

---

## 🔍 Detailed Processing Steps

### 1. Gemini API Call

**Location:** `backend/internal/services/llm/gemini.go`

**What happens:**
- Text sent to Gemini with proofreading prompt
- Gemini returns JSON with corrections array
- Raw response logged (if `GEMINI_DEBUG` enabled)

**No modifications** - pure Gemini output

---

### 2. Backend Filtering (Go)

#### 2.1 `toSuggestionSlice()` - Lines 1005-1019

**File:** `backend/internal/services/llm/llm_service.go`

**Filtering:**
```go
if suggestion.Original != "" && 
   suggestion.Corrected != "" && 
   suggestion.Original != suggestion.Corrected {
    suggestions = append(suggestions, suggestion)
}
```

**Removes:**
- Suggestions where `original == corrected` (exact match)
- Empty original or corrected fields

**Rationale:** Gemini prompt explicitly says "Do NOT include entries where original == corrected" (rule #7)

**Example filtered:**
- `{"original": "அம்மா", "corrected": "அம்மா"}` ❌ (no-op)

---

#### 2.2 `fillSuggestionIndices()` - Lines 252-290

**File:** `backend/internal/services/llm/llm_service.go`

**Filtering:**
```go
if normalizeComparable(orig) == normalizeComparable(corr) {
    continue
}
```

**Normalization function:**
```go
func normalizeComparable(s string) string {
    t := strings.TrimSpace(s)
    t = strings.Trim(t, `"'`)
    t = strings.Join(strings.Fields(t), " ")
    t = strings.ReplaceAll(t, "\u200b", "")  // zero-width space
    t = strings.ReplaceAll(t, "\u200c", "")  // zero-width non-joiner
    t = strings.ReplaceAll(t, "\u200d", "")  // zero-width joiner
    t = strings.ReplaceAll(t, "\ufeff", "")  // BOM
    return t
}
```

**Removes:**
- Suggestions that differ only by quotes, whitespace, or zero-width chars

**Examples filtered:**
- `{"original": "  அம்மா  ", "corrected": "அம்மா"}` ❌ (whitespace only)
- `{"original": "\"வரவு\"", "corrected": "வரவு"}` ❌ (quotes only)
- `{"original": "test\u200bword", "corrected": "testword"}` ❌ (zero-width char)

**Examples NOT filtered:**
- `{"original": "வரலாற்று", "corrected": "வரலாற்றுச்"}` ✅ (real difference)

---

### 3. Backend Index Fixing

**Location:** `backend/internal/handlers/submission_handlers.go`, Lines 295-314

**What happens:**
- Recalculates `start_index` and `end_index` if they're invalid
- Uses `findFirstUnusedOccurrence()` to avoid overlaps
- Finds exact substring matches in original text

**No filtering** - only fixes indices for suggestions that already passed filtering

---

### 4. Frontend API Layer

#### 4.1 Express API - JSON Repair

**File:** `express-frontend/routes/api.js`, Lines 156-189

**What happens:**
- For chunked text processing, repairs truncated JSON
- Finds last complete suggestion object in partial responses
- Adjusts position offsets for chunk boundaries

**No filtering** - only repairs malformed JSON

---

#### 4.2 Next.js API - Default Values

**File:** `frontend/app/api/gemini/analyze/route.ts`, Lines 123-132

**What happens:**
```typescript
type: suggestion.type || 'style',
severity: suggestion.severity || 'suggestion',
title: suggestion.title || 'Improvement suggestion',
confidence: typeof suggestion.confidence === 'number' ? suggestion.confidence : 0.7
```

**Adds defaults** for missing fields

**No filtering** - all suggestions pass through

---

### 5. Frontend Filtering (JavaScript)

#### 5.1 Normalized Duplicate Removal

**File:** `express-frontend/public/js/workspace.js`, Lines 3473-3497

**Normalization:**
```javascript
const normalizeComparable = (s) => {
  return String(s || '')
    .normalize('NFC')  // Unicode normalization
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // zero-width chars
    .replace(/\s+/g, ' ')  // normalize whitespace
    .trim()
    .replace(/^[\"'""''...]+/, '')  // strip leading quotes
    .replace(/[\"'""''...]+$/, ''); // strip trailing quotes
};
```

**Filtering:**
```javascript
const hasValidSuggestion = oNorm && cNorm && oNorm !== cNorm;
```

**Removes:**
- Same as backend, but with Unicode NFC normalization
- Additional quote stripping (smart quotes, Tamil quotes, etc.)

**Logged:** `[AI Debug] Filtered out duplicate/no-op suggestion:`

---

#### 5.2 ID Deduplication

**File:** `express-frontend/public/js/workspace.js`, Lines 3610-3621

**What happens:**
- Creates stable IDs based on `${original}-${corrected}-${type}`
- Removes suggestions with duplicate IDs
- Prevents same suggestion showing multiple times

---

#### 5.3 Text Matching Filter

**File:** `frontend/app/submit/page.tsx`, Lines 255-256

**What happens:**
```typescript
function suggestionMatchesText(suggestion, currentText) {
  return currentText.includes(suggestion.original);
}
```

**Removes:**
- Suggestions whose `original` text no longer exists in current document
- Happens when user edits text after getting suggestions

**Rationale:** Stale suggestions for deleted text shouldn't show

---

## ⚖️ Philosophy: Trust Gemini vs Override

### Current Approach: Minimal Filtering ✅

**What we filter:**
1. ✅ Exact duplicates (`original == corrected`)
2. ✅ Whitespace-only differences
3. ✅ Quote-only differences
4. ✅ Zero-width character differences
5. ✅ Stale suggestions (text was edited)

**What we DON'T filter:**
- ❌ Gemini's grammar decisions (e.g., sandhi choices)
- ❌ Gemini's style suggestions
- ❌ Gemini's correction text

### User Feedback Integration

**Issue reported:** "வரலாற்று அங்கீகாரம்" → "வரலாற்றுச் அங்கீகாரம்"

**Response:** 
- ✅ **Fixed in prompt**, not in post-processing
- ✅ Updated Gemini instructions: "Both forms are valid, don't suggest stylistic changes"
- ✅ Trust Gemini's output based on improved prompt

**Philosophy:**
> Fix the AI's understanding (prompt), not the AI's output (filtering)

---

## 🚫 What We Explicitly DON'T Do

### ❌ No Grammar Rule Overrides

We do NOT have code like:
```javascript
// ❌ BAD - Don't do this
if (suggestion.type === 'sandhi' && !shouldHaveSandhi(original)) {
  return; // filter out
}
```

**Why:** Gemini is the Tamil expert, not our code

---

### ❌ No Hardcoded Corrections

We do NOT have code like:
```javascript
// ❌ BAD - Don't do this
if (original === 'வரலாற்று அங்கீகாரம்') {
  suggestion.corrected = 'வரலாற்றுச் அங்கீகாரம்';
}
```

**Why:** Not scalable, undermines AI

---

### ❌ No Confidence Thresholding (Yet)

We do NOT filter by confidence score:
```javascript
// Not currently used
if (suggestion.confidence < 0.8) {
  return; // filter out low confidence
}
```

**Why:** Gemini's prompt says "return as many high-confidence corrections as you can"

**Future consideration:** Could add user preference for confidence threshold

---

## 📈 Metrics & Logging

### Backend Logs

```
[GEMINI] Starting with model: gemini-2.5-flash, text length: 245
[GEMINI] Response status: 200, API time: 1.2s
[GEMINI] SUCCESS - Total time: 1.3s, Result length: 567
```

### Frontend Logs

```
[AI Debug] Filtered out duplicate/no-op suggestion: { original, corrected, ... }
[AI Debug] Mapping suggestion: { original, corrected, reason, type }
```

### Monitoring Suggestions

```sql
-- Check filtered suggestions in logs
grep "Filtered out duplicate" /var/log/frontend.log | wc -l

-- Check Gemini responses in backend
grep "[GEMINI] SUCCESS" /var/log/backend.log | tail -20
```

---

## 🔧 Configuration

### Environment Variables

**Backend:**
- `GEMINI_DEBUG=1` - Enable full response logging
- `GEMINI_API_KEY` - API key for Gemini

**Frontend:**
- `NEXT_PUBLIC_GEMINI_API_KEY` - API key for client-side calls

---

## 🎯 Best Practices

### ✅ DO

1. **Trust Gemini's output** - Fix prompts, not post-processing
2. **Filter only technical duplicates** - Same text after normalization
3. **Log all filtering** - For debugging and monitoring
4. **Validate indices** - Fix broken start/end positions
5. **Handle edge cases** - Empty fields, malformed JSON

### ❌ DON'T

1. **Override grammar rules** - Gemini is the expert
2. **Add hardcoded corrections** - Not scalable
3. **Filter by content** - Only filter by technical criteria
4. **Modify correction text** - Show what Gemini said
5. **Hide valid suggestions** - User should see AI's reasoning

---

## 🐛 Debugging Suggestions

### Suggestion Not Showing?

**Check:**
1. Backend logs: Was it in Gemini's response?
   ```bash
   grep "SUCCESS" backend.log | grep "Result length"
   ```

2. Backend filtering: Did it pass `toSuggestionSlice`?
   ```go
   // Log before filtering
   log.Printf("Before filter: %d suggestions", len(allSuggestions))
   ```

3. Frontend filtering: Check browser console
   ```javascript
   [AI Debug] Filtered out duplicate/no-op suggestion
   ```

4. Text matching: Is original text still in document?

---

### Wrong Suggestion Showing?

**Check:**
1. Gemini prompt: Is it clear about what NOT to suggest?
   ```go
   // Update proofreadingPrompt in gemini.go
   ```

2. Gemini response: What did AI actually return?
   ```bash
   GEMINI_DEBUG=1 # Enable full response logging
   ```

3. User feedback: Collect examples for prompt improvement

---

## 📚 Related Files

### Backend
- `backend/internal/services/llm/gemini.go` - Prompt & API call
- `backend/internal/services/llm/llm_service.go` - Filtering logic
- `backend/internal/handlers/submission_handlers.go` - Index fixing

### Frontend
- `express-frontend/routes/api.js` - Express API
- `express-frontend/public/js/workspace.js` - Client filtering
- `frontend/app/api/gemini/analyze/route.ts` - Next.js API
- `frontend/app/submit/page.tsx` - UI display

---

## 🎉 Summary

**Architecture Philosophy:**
```
Gemini Prompt (✅ Fix here)
    ↓
Gemini Response (Trust)
    ↓
Technical Filtering Only (whitespace, duplicates, stale)
    ↓
User sees AI's reasoning
```

**Key Principle:**
> Improve the AI's instructions (prompt), not its output (post-processing)

This ensures the AI learns from feedback and becomes smarter over time! 🚀
