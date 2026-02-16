# Key Files Reference

Paths and roles of the main editor, transliteration, proofreading API, and dependencies.

---

## 1. Editor / Workspace component (rich text editor)

**File:** `express-frontend/public/js/workspace.js`

- **Role:** Main workspace controller: rich text area, IME/suggestions dropdown, paste handling, auto-analyze, suggestions panel (proofreading results).
- **Entry:** Loaded from the workspace page; `WorkspaceController` initializes the editor (contenteditable or TipTap), word count, save, and suggestion UI.
- **Notable:** `applyReplacement`, `cleanTamilSuggestions`, `getTokenAtCaret`, `fetchRunnerSuggestions`, `displaySuggestions`, `autoAnalyze`, `queuePasteAnalyze`.

**First ~150 lines (start of file):**

```javascript
// v20260131 - OPTIMIZED: Reduced debounce, added caching
const MIN_SUBMIT_WORDS = 20;

function applyReplacement(text, original, replacement, approxIndex = null) { ... }
function cleanTamilSuggestions(rawSuggestions, tokenLatin) { ... }
// WorkspaceController class: editor, suggestionCache, fetchRunnerSuggestions(), displaySuggestions(), autoAnalyze()
```

**Transliteration call (English → Tamil suggestions):**

```javascript
// Line ~814: workspace calls Express suggest API
const url = `/api/v1/suggest?q=${encodeURIComponent(query)}&limit=${limit}&...`;
const response = await fetch(url, { method: 'GET', ... });
// Response: { success: true, suggestions: [{ word, score }] }
```

---

## 2. Transliteration logic (English → Tamil)

**Frontend (suggestions UI):**  
`express-frontend/public/js/workspace.js`  
- Gets Latin token at caret (`getTokenAtCaret`), calls `/api/v1/suggest?q=...`, displays Tamil suggestions and replaces on select.

**Express API (proxy + fallback):**  
`express-frontend/routes/api.js`  
- `GET /api/v1/suggest` → proxies to `BACKEND_URL/transliterate/suggest?q=...`, normalizes to `{ success, suggestions: [{ word, score }] }`, uses `getBuiltinSuggestions(q)` when backend is empty.
- `GET /api/ime/suggest` → same for IME.
- `POST /api/transliterate` → proxies to `BACKEND_URL/transliterate` (full-word transliteration).

**Backend (suggestions + translit):**  
`backend/internal/handlers/transliteration_handlers.go`  
- `TransliterateSuggest` (GET `/transliterate/suggest?q=...`): uses suggest engine (trie) or fallback `translit.GetSuggestions(q)`; returns `{ success, suggestions: [{ word, score }] }`.
- `Transliterate`: POST body transliteration.

**Backend suggest handler (excerpt):**

```go
// TransliterateSuggest handles GET /transliterate/suggest?q=...
func (h *Handlers) TransliterateSuggest(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	// Step 0: Use in-process hybrid trie engine when it has suggestions.
	if engine := h.getSuggestEngine(); engine != nil {
		out, err := engine.Suggest(...)
		// return { success, suggestions: [{ word, score }] }
	}
	// Fallback: in-memory translit lexicon
	suggestions := translit.GetSuggestions(q)
	// ...
	c.JSON(http.StatusOK, SuggestAPIResponse{Success: true, Suggestions: items})
}
```

---

## 3. API routes (proofreading)

**File:** `express-frontend/routes/api.js`

**Proofreading / corrections (Gemini):**  
- **POST `/api/corrections`** (lines 282–386)  
  - Body: `{ text }`.  
  - Calls Gemini (chunked), returns `{ success, corrections: [{ blockId, originalText, correction, reason, type }] }`.  
  - Used by the workspace when you paste or run “check”; workspace calls this first, then falls back to `/api/submit` if needed.

**Submit (backend proxy):**  
- **POST `/api/submit`** (lines 1136–1186)  
  - Body: `{ text, html, save_draft }`.  
  - Proxies to `BACKEND_URL/submit` for async proofreading and draft save.

**Suggest (transliteration):**  
- **GET `/api/v1/suggest`** (line 1709) – used by workspace for Tamil suggestions.  
- **GET `/api/ime/suggest`** (line 1762) – IME path.

**Excerpt – POST /api/corrections:**

```javascript
// Grammar/Corrections API - exact format: { success, corrections: [{ blockId, originalText, correction, reason, type }] }
router.post('/corrections', async (req, res) => {
  const { text } = req.body;
  const chunks = splitIntoSentences(text);
  const chunkPromises = chunks.map(async (chunk) => {
    const response = await axiosWithPool.post(
      `${baseUrl}/models/gemini-2.5-flash:generateContent`,
      { systemInstruction: {...}, contents: [...], generationConfig: { responseMimeType: 'application/json', responseSchema: {...} } },
      { headers: { 'x-goog-api-key': apiKey }, timeout: 10000 }
    );
    // parse JSON array of { id, type, title, description, original, suggestion }
    return Array.isArray(arr) ? arr : [];
  });
  const allSuggestions = (await Promise.all(chunkPromises)).flat();
  const corrections = filtered.map((s) => ({
    blockId: '0',
    originalText: (s.original || '').trim(),
    correction: (s.suggestion || s.corrected || '').trim(),
    reason: (s.description || s.title || '').trim() || '...',
    type: (s.type && ['spelling', 'grammar', 'punctuation'].includes(s.type)) ? s.type : 'spelling'
  }));
  return res.json({ success: true, corrections });
});
```

**Excerpt – POST /api/submit:**

```javascript
router.post('/submit', async (req, res) => {
  const url = `${BACKEND_URL}/submit`;
  const response = await axiosWithPool.post(url, {
    text: req.body?.text || '',
    html: req.body?.html || '',
    model: req.body?.model || 'gemini-flash',
    save_draft: req.body?.save_draft
  }, { headers: { Authorization, Cookie }, validateStatus: () => true });
  // Returns 200/202 + submission or corrections from backend
});
```

---

## 4. package.json (dependencies)

**File:** `express-frontend/package.json`

```json
{
  "name": "tamil-proofreading-express",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "dev": "concurrently \"npm run watch:css\" \"nodemon server.js\"",
    "start": "node server.js",
    "watch:css": "./node_modules/.bin/tailwindcss -i ./public/css/input.css -o ./public/css/output.css --watch",
    "build:css": "./node_modules/.bin/tailwindcss -i ./public/css/input.css -o ./public/css/output.css --minify"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "compression": "^1.7.4",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "docx": "^8.2.2",
    "dotenv": "^16.6.1",
    "ejs": "^3.1.9",
    "express": "^4.18.2",
    "form-data": "^4.0.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^2.0.0",
    "pdf-parse": "^1.1.1",
    "tesseract.js": "^5.0.4"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.16",
    "concurrently": "^8.2.2",
    "nodemon": "^3.0.2",
    "postcss": "^8.4.32",
    "puppeteer": "^24.34.0",
    "sharp": "^0.34.5",
    "tailwindcss": "^3.4.0"
  }
}
```

---

## Quick path summary

| What | Path |
|------|------|
| Editor / Workspace | `express-frontend/public/js/workspace.js` |
| Transliteration (frontend) | `express-frontend/public/js/workspace.js` (token + `/api/v1/suggest`) |
| Transliteration (API proxy) | `express-frontend/routes/api.js` (`/v1/suggest`, `/ime/suggest`, `/transliterate`) |
| Transliteration (backend) | `backend/internal/handlers/transliteration_handlers.go` |
| Proofreading API | `express-frontend/routes/api.js` (`POST /corrections`, `POST /submit`) |
| Dependencies | `express-frontend/package.json` |

---

## Link audit (page routes and API paths)

**Page routes (Express):** `/`, `/home`, `/how-to-use`, `/tools/*`, `/blog`, `/drafts`, `/workspace`, `/login`, `/register`, `/contact`, `/privacy`, `/terms`, `/account`, `/analytics`, `/admin/affiliates`, `/archive`.

**Auth:** Form/JS use `/auth/login`, `/auth/register` (Express `routes/auth.js` forwards to backend).

**API (relative URLs):** `/api/v1/suggest`, `/api/v1/submissions` (GET/DELETE), `/api/v1/submissions/:id/stream` (home-editor stream), `/api/v1/admin/analytics-dashboard`. Use relative paths so production works regardless of host.
