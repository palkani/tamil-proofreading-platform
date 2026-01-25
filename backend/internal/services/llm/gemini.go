// Gemini AI service for Tamil proofreading
package llm

import (
        "bytes"
        "encoding/json"
        "fmt"
        "io"
        "log"
        "net/http"
        "os"
	"regexp"
        "strings"
        "time"
)

var proofreadingPrompt = `நீங்கள் ஒரு நிபுணத்துவம் வாய்ந்த தமிழ் மொழி சரிபார்ப்பாளர் மற்றும் பதிப்பாசிரியர்.

🎯 PRIMARY ROLE: ERROR CORRECTION, NOT CREATIVE EDITING

Your task: Analyze Tamil text and identify ERRORS that need correction.
DO NOT suggest stylistic improvements or rewrites - ONLY fix actual mistakes.

════════════════════════════════════════════════════════
⚠️ CORE RULES (FOLLOW STRICTLY)
════════════════════════════════════════════════════════

1. PRESERVE ORIGINAL CONTENT EXACTLY:
   ✅ Keep the original meaning, intent, opinion, and tone
   ✅ Do NOT change viewpoints, political stance, or emotional tone
   ✅ Do NOT add or remove information
   ✅ Do NOT paraphrase unless grammatically unavoidable
   ✅ Avoid stylistic embellishments or "improvements"

2. FIX ERRORS ONLY:
   ✅ Spelling errors (எழுத்துப்பிழை)
   ✅ Grammar errors (இலக்கண பிழைகள்)
   ✅ Verb tense and agreement issues
   ✅ Sandhi (புணர்ச்சி) errors - ONLY when words improperly joined
   ✅ Case suffix (வெற்றுமை உருபு) mistakes
   ✅ Incorrect word joins/splits
   ✅ Punctuation and spacing errors
   ✅ Phonetic transformation errors (வல்லினம், மெல்லினம், இடையினம்)
   
   ❌ Do NOT suggest:
   - Alternative word choices (unless the word is spelled wrong)
   - Sentence restructuring (unless grammatically incorrect)
   - "Better" phrasing (unless the original is grammatically wrong)
   - Tone adjustments (unless it's a grammar error)

3. USE STANDARD WRITTEN TAMIL:
   ✅ எழுத்துத் தமிழ் / செம்மொழி standards
   ❌ Avoid suggesting changes FROM spoken Tamil TO formal Tamil unless it's clearly an error
   ❌ If the text uses spoken Tamil consistently, preserve that style

4. PRESERVE EXACTLY:
   ✅ All proper nouns (names, places, brands, organizations, political parties)
   ✅ English words, acronyms, and numbers as-is
   ✅ Paragraph structure (do NOT merge or split unless necessary)
   ✅ Original sentence boundaries

5. MINIMAL CORRECTIONS:
   ✅ Suggest ONLY necessary changes for errors
   ✅ If a word/sentence is correct, do NOT suggest changes
   ✅ One correction per error (no multiple alternatives)

════════════════════════════════════════════════════════
📋 ERROR TYPES TO CHECK (Actual mistakes only)
════════════════════════════════════════════════════════

1. எழுத்துப் பிழைகள் (SPELLING ERRORS):
   - Misspelled Tamil words
   - Wrong vowel marks (உயிர்மெய் எழுத்துக்கள்)
   - Incorrect consonant formations

2. இலக்கணப் பிழைகள் (GRAMMAR ERRORS):
   
   a) Verb-subject agreement:
      ❌ "அவர்கள் வந்தான்" → ✅ "அவர்கள் வந்தார்கள்"
   
   b) Tense errors:
      ❌ Wrong past/present/future tense for context
   
   c) Case marker errors (வேற்றுமை உருபு):
      ❌ "அவன் கொடு" → ✅ "அவனுக்கு கொடு" (missing dative case)
   
   d) Number agreement:
      ❌ Singular/plural mismatch

3. வல்லினம், மெல்லினம், இடையினம் (PHONETIC TRANSFORMATION ERRORS):
   
   வல்லினம் (Hard): க், ச், ட், த், ப், ற்
   மெல்லினம் (Soft): ங், ஞ், ண், ந், ம், ன்
   இடையினம் (Medium): ய், ர், ல், வ், ழ், ள்
   
   Check ONLY if phonetic transformation is INCORRECT:
   ❌ "பத்து பேர்" → ✅ "பத்துப் பேர்" (if ப் should be ம் phonetically)
   ❌ Wrong nasal in plurals: "மரங்கள்" (check if correct nasal based on word)
   ❌ Incorrect case marker consonant

4. புணர்ச்சி பிழைகள் (SANDHI ERRORS):
   
   ⚠️ CRITICAL: Both forms are VALID in modern Tamil:
   ✅ "வரலாற்றுச் சிறப்பு" (with sandhi) - CORRECT
   ✅ "வரலாற்று சிறப்பு" (without sandhi) - ALSO CORRECT
   
   Do NOT suggest changing between these forms!
   
   ONLY flag when words are IMPROPERLY JOINED (missing space):
   ❌ "அவள்அழகானவள்" → ✅ "அவள் அழகானவள்" (missing space is ERROR)
   ❌ "பதிவபுதுப்பித்தல்" → ✅ "பதிவுப் புதுப்பித்தல்" (missing space is ERROR)

5. இடைவெளி பிழைகள் (SPACING ERRORS):
   - Words incorrectly joined
   - Words incorrectly split
   - Wrong hyphen usage: "23 ஆம்" → "23-ஆம்" (formatting error)

6. நிறுத்தக்குறி பிழைகள் (PUNCTUATION ERRORS):
   - Missing periods at sentence end (if it's clearly incomplete)
   - Missing question marks for questions
   - Completely missing commas in lists (only if it creates confusion)
   
   ⚠️ Do NOT suggest adding commas just for "better flow" - only if absence creates ambiguity or is grammatically wrong

════════════════════════════════════════════════════════
❌ WHAT NOT TO FLAG (These are NOT errors)
════════════════════════════════════════════════════════

1. Style choices:
   - Formal vs informal register (unless inconsistent within text)
   - Long sentences (unless grammatically incorrect)
   - Simple vs complex vocabulary (unless word is misspelled)

2. Sandhi variations:
   - "வரலாற்றுச் சிறப்பு" vs "வரலாற்று சிறப்பு" - both correct
   - Optional sandhi consonants - both forms valid

3. Word order variations:
   - Tamil allows flexible word order - don't suggest changes unless meaning is unclear

4. Regional variations:
   - Different regions use different words - don't "correct" regional vocabulary

5. Spoken vs written:
   - If text is consistently informal/spoken, preserve that
   - Only flag if there's inconsistent mixing that's clearly a mistake

════════════════════════════════════════════════════════
📝 OUTPUT FORMAT (MANDATORY - JSON ONLY)
════════════════════════════════════════════════════════

Return ONLY valid JSON. No markdown, no code fences, no text before/after.

{
  "corrections": [
    {
      "original": "exact text from input with error",
      "corrected": "fixed version",
      "reason": "தமிழில் short explanation of the ERROR",
      "type": "spelling|grammar|phonetic|punctuation|space|sandhi",
      "start_index": 0,
      "end_index": 0
    }
  ],
  "corrected_text": ""
}

SUGGESTION TYPES (use correct type for each error):
- "spelling" - எழுத்துப்பிழை (misspelled word)
- "grammar" - இலக்கண பிழை (grammar error)
- "phonetic" - வல்லினம்/மெல்லினம் தவறு (phonetic transformation error)
- "punctuation" - நிறுத்தக்குறி பிழை (punctuation error)
- "space" - இடைவெளி பிழை (spacing error)
- "sandhi" - புணர்ச்சி பிழை (words improperly joined only)

⚠️ CRITICAL OUTPUT RULES:
✅ Each "original" must be EXACT substring from input text
✅ Only include actual ERRORS - not stylistic suggestions
✅ Keep "reason" short (10-15 Tamil words max)
✅ Explain what ERROR was fixed, not why the new version is "better"
✅ Set corrected_text to "" (empty) - we only need corrections array
✅ If text has NO errors, return: {"corrections":[],"corrected_text":""}

════════════════════════════════════════════════════════
🎯 REMEMBER: You are a PROOFREADER, not an EDITOR
════════════════════════════════════════════════════════

✅ FIX errors
❌ Don't suggest improvements
✅ Preserve original intent
❌ Don't paraphrase
✅ Minimal necessary changes
❌ Don't embellish

INPUT TEXT:
[USER'S TAMIL TEXT HERE]`

type GeminiResponse struct {
        Candidates []struct {
                Content struct {
                        Parts []struct {
                                Text string `json:"text"`
                        } `json:"parts"`
                } `json:"content"`
        } `json:"candidates"`
        UsageMetadata *struct {
                PromptTokenCount     int `json:"promptTokenCount"`
                CandidatesTokenCount int `json:"candidatesTokenCount"`
                TotalTokenCount      int `json:"totalTokenCount"`
        } `json:"usageMetadata"`
}

// Reusable HTTP client with connection pooling for better performance
var geminiClient = &http.Client{
	// NOTE: Do not set this too low. Large texts can legitimately take >25s for the first byte.
	// We still bound overall work via upstream ctx timeouts (see proofreadTimeoutFor).
	Timeout: 75 * time.Second,
        Transport: &http.Transport{
                MaxIdleConns:        10,
                MaxIdleConnsPerHost: 5,
                IdleConnTimeout:     90 * time.Second,
        },
}

var geminiKeyRedactRe = regexp.MustCompile(`(?i)([?&]key=)[^&\s"]+`)

func redactGeminiKey(s string) string {
	if s == "" {
		return s
	}
	return geminiKeyRedactRe.ReplaceAllString(s, `${1}[REDACTED]`)
}

// CallGeminiProofread calls Gemini with the proofreading prompt.
// maxOutputTokens is a latency lever: smaller outputs return faster.
func buildProofreadPrompt(userText string) string {
        // Build final prompt - CRITICAL: Replace the actual placeholder in the prompt template
        return strings.Replace(proofreadingPrompt, "[USER'S TAMIL TEXT HERE]", userText, 1)
}

func CallGeminiProofread(userText string, model string, apiKey string, maxOutputTokens int) (string, *GeminiResponse, error) {
        if apiKey == "" {
                return "", nil, &ProviderError{Provider: "gemini", Message: "API key not provided", Retryable: false}
        }

        startTime := time.Now()
        log.Printf("[GEMINI] Starting with model: %s, text length: %d", model, len(userText))

        finalPrompt := buildProofreadPrompt(userText)
        promptBuildTime := time.Since(startTime)

        // Gemini API Endpoint
        url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
                model, apiKey)

        if maxOutputTokens <= 0 {
                maxOutputTokens = 2048
        }

        // Request payload with optimized settings for faster response
        // - Lower temperature for more deterministic output
        payload := map[string]interface{}{
                "contents": []map[string]interface{}{
                        {
                                "parts": []map[string]string{
                                        {
                                                "text": finalPrompt,
                                        },
                                },
                        },
                },
                "generationConfig": map[string]interface{}{
                        "temperature":      0.1,
                        "topP":             0.8,
                        "topK":             40,
                        "maxOutputTokens":  maxOutputTokens,
                        "responseMimeType": "application/json",
                },
        }

        jsonBody, _ := json.Marshal(payload)
        prepTime := time.Since(startTime)
        log.Printf("[GEMINI] Prep time: %v (prompt build: %v)", prepTime, promptBuildTime)

        req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
        if err != nil {
                log.Printf("[GEMINI] Request build error: %v", err)
                return "", nil, err
        }

        req.Header.Set("Content-Type", "application/json")

        apiStartTime := time.Now()
        resp, err := geminiClient.Do(req)
        if err != nil {
		msg := redactGeminiKey(err.Error())
		log.Printf("[GEMINI] Request error after %v: %s", time.Since(apiStartTime), msg)
		// Wrap so we don't leak key via audit logs/handlers.
		return "", nil, &ProviderError{Provider: "gemini", Message: msg, Retryable: true}
        }
        defer resp.Body.Close()

        apiTime := time.Since(apiStartTime)
        log.Printf("[GEMINI] Response status: %d, API time: %v", resp.StatusCode, apiTime)

        // Read full response body
        bodyBytes, err := io.ReadAll(resp.Body)
        if err != nil {
                log.Printf("[GEMINI] Error reading response body: %v", err)
                return "", nil, err
        }

        if resp.StatusCode < 200 || resp.StatusCode >= 300 {
                msg := strings.TrimSpace(string(bodyBytes))
                if len(msg) > 600 {
                        msg = msg[:600]
                }
                retryable := resp.StatusCode == 429 || resp.StatusCode == 408 || resp.StatusCode >= 500
                return "", nil, &ProviderError{Provider: "gemini", StatusCode: resp.StatusCode, Message: msg, Retryable: retryable}
        }

        if strings.TrimSpace(os.Getenv("GEMINI_DEBUG")) != "" {
                bodyStr := string(bodyBytes)
                if len(bodyStr) > 800 {
                        bodyStr = bodyStr[:800] + "..."
                }
                log.Printf("[GEMINI] Raw response (truncated): %s", bodyStr)
        } else {
                log.Printf("[GEMINI] Response bytes: %d", len(bodyBytes))
        }

        // Parse response
        var geminiResp GeminiResponse
        if err := json.Unmarshal(bodyBytes, &geminiResp); err != nil {
                log.Printf("[GEMINI] JSON parse error: %v", err)
                return "", nil, err
        }

        // Extract final text
        if len(geminiResp.Candidates) == 0 {
                log.Printf("[GEMINI] No candidates in response")
                return "", nil, &ProviderError{Provider: "gemini", StatusCode: resp.StatusCode, Message: "no candidates returned", Retryable: true}
        }

        if len(geminiResp.Candidates[0].Content.Parts) == 0 {
                log.Printf("[GEMINI] No parts in candidates")
                return "", nil, fmt.Errorf("no content returned from Gemini")
        }

        result := geminiResp.Candidates[0].Content.Parts[0].Text
        totalTime := time.Since(startTime)
        log.Printf("[GEMINI] SUCCESS - Total time: %v, API time: %v, Result length: %d", totalTime, apiTime, len(result))
        return result, &geminiResp, nil
}

func CallGeminiCountTokens(prompt string, model string, apiKey string) (int, error) {
        if apiKey == "" {
                return 0, &ProviderError{Provider: "gemini", Message: "API key not provided", Retryable: false}
        }
        url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:countTokens?key=%s", model, apiKey)
        payload := map[string]interface{}{
                "contents": []map[string]interface{}{
                        {
                                "parts": []map[string]string{
                                        {"text": prompt},
                                },
                        },
                },
        }
        jsonBody, _ := json.Marshal(payload)
        req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
        if err != nil {
                return 0, err
        }
        req.Header.Set("Content-Type", "application/json")
        resp, err := geminiClient.Do(req)
        if err != nil {
		// Wrap so we don't leak key via logs.
		return 0, &ProviderError{Provider: "gemini", Message: redactGeminiKey(err.Error()), Retryable: true}
        }
        defer resp.Body.Close()
        bodyBytes, err := io.ReadAll(resp.Body)
        if err != nil {
                return 0, err
        }
        if resp.StatusCode < 200 || resp.StatusCode >= 300 {
                msg := strings.TrimSpace(string(bodyBytes))
                if len(msg) > 600 {
                        msg = msg[:600]
                }
                retryable := resp.StatusCode == 429 || resp.StatusCode == 408 || resp.StatusCode >= 500
                return 0, &ProviderError{Provider: "gemini", StatusCode: resp.StatusCode, Message: msg, Retryable: retryable}
        }
        var out struct {
                TotalTokens int `json:"totalTokens"`
        }
        if err := json.Unmarshal(bodyBytes, &out); err != nil {
                return 0, err
        }
        return out.TotalTokens, nil
}

var transliterationPrompt = `You are a Tamil Transliteration Engine.
Convert the given English phonetic input into 5 completely DIFFERENT Tamil words/meanings, ranked by likelihood.

The 5 suggestions should be:
1. Most likely direct transliteration
2. Alternative word meaning (different but related)
3. Another alternative interpretation
4. Yet another alternative
5. Least likely but valid alternative

CRITICAL: Each of the 5 suggestions must be a COMPLETELY DIFFERENT TAMIL WORD/MEANING, not variations of the same word with case endings.

Output ONLY valid JSON:
{
  "success": true,
  "suggestions": [
    { "word": "WORD1", "score": 1.0 },
    { "word": "WORD2", "score": 0.9 },
    { "word": "WORD3", "score": 0.8 },
    { "word": "WORD4", "score": 0.7 },
    { "word": "WORD5", "score": 0.6 }
  ]
}

Rules:
- Each of 5 suggestions MUST be a COMPLETELY DIFFERENT word, never variations of the same word.
- Do NOT output grammatical case variations like -ம्, -ै, -ी of the same base word.
- Output 5 entirely different Tamil words based on phonetic similarity or alternative meanings.
- Only output Tamil Unicode for "word".
- Never output English translations.
- Never output anything outside JSON.
- If input is too short or meaningless, return empty suggestions list.
- Scores must be strictly descending from 1.0 to ~0.6.

Examples of GOOD diverse outputs (5 DIFFERENT words):
- Input "hello" → ["ஹலோ" (direct), "ஹலுவ" (variant), "நல்ல" (meaning good), "வணக்கம்" (greeting), "ஹாய்" (informal)]
- Input "nice" → ["நைஸ்" (direct), "நன்றி" (good), "சுந்தரம்" (beautiful), "அழகு" (pretty), "நல்ல" (nice)]

Input:
TEXT: {{english_input}}`

type TransliterationResponse struct {
        Success     bool `json:"success"`
        Suggestions []struct {
                Word  string  `json:"word"`
                Score float64 `json:"score"`
        } `json:"suggestions"`
}

// TransliterationResult contains the full response with scores
type TransliterationResult struct {
        Suggestions []struct {
                Word  string  `json:"word"`
                Score float64 `json:"score"`
        } `json:"suggestions"`
}

// CallGeminiTransliterate transliterates English to Tamil with full logging
func CallGeminiTransliterate(englishText string, apiKey string) ([]string, error) {
        startTime := time.Now()
        log.Printf("[TRANSLIT] Starting transliteration for: %q (len=%d)", englishText, len(englishText))

        if apiKey == "" {
                log.Printf("[TRANSLIT] ERROR: API key not provided")
                return nil, fmt.Errorf("API key not provided")
        }

        // Validate input
        if len(englishText) < 1 || len(englishText) > 40 {
                log.Printf("[TRANSLIT] ERROR: Invalid input length: %d (must be 1-40)", len(englishText))
                return nil, fmt.Errorf("input length must be 1-40 characters")
        }

        finalPrompt := strings.Replace(transliterationPrompt, "{{english_input}}", englishText, 1)
        // Use gemini-2.0-flash-lite for transliteration - faster and no thinking overhead
        url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=%s", apiKey)

        payload := map[string]interface{}{
                "contents": []map[string]interface{}{{
                        "parts": []map[string]string{{
                                "text": finalPrompt,
                        }},
                }},
                "generationConfig": map[string]interface{}{
                        "temperature":      0.2,
                        "topP":             0.9,
                        "topK":             40,
                        "maxOutputTokens":  256,
                        "responseMimeType": "application/json",
                },
        }

        jsonBody, err := json.Marshal(payload)
        if err != nil {
                log.Printf("[TRANSLIT] ERROR: Failed to marshal payload: %v", err)
                return nil, fmt.Errorf("failed to build request: %v", err)
        }

        req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
        if err != nil {
                log.Printf("[TRANSLIT] ERROR: Failed to create request: %v", err)
                return nil, fmt.Errorf("failed to create request: %v", err)
        }
        req.Header.Set("Content-Type", "application/json")

        apiStartTime := time.Now()
        resp, err := geminiClient.Do(req)
        apiTime := time.Since(apiStartTime)

        if err != nil {
                log.Printf("[TRANSLIT] ERROR: HTTP request failed after %v: %v", apiTime, err)
                return nil, fmt.Errorf("API request failed: %v", err)
        }
        defer resp.Body.Close()

        log.Printf("[TRANSLIT] Response status: %d, API time: %v", resp.StatusCode, apiTime)

        bodyBytes, err := io.ReadAll(resp.Body)
        if err != nil {
                log.Printf("[TRANSLIT] ERROR: Failed to read response body: %v", err)
                return nil, fmt.Errorf("failed to read response: %v", err)
        }

        log.Printf("[TRANSLIT] Raw response: %s", string(bodyBytes))

        // Check for HTTP errors
        if resp.StatusCode != 200 {
                log.Printf("[TRANSLIT] ERROR: Non-200 status code: %d, body: %s", resp.StatusCode, string(bodyBytes))
                return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
        }

        var geminiResp GeminiResponse
        if err := json.Unmarshal(bodyBytes, &geminiResp); err != nil {
                log.Printf("[TRANSLIT] ERROR: Failed to parse Gemini response: %v", err)
                return nil, fmt.Errorf("failed to parse API response: %v", err)
        }

        if len(geminiResp.Candidates) == 0 {
                log.Printf("[TRANSLIT] ERROR: No candidates in response")
                return nil, fmt.Errorf("no candidates returned from API")
        }

        if len(geminiResp.Candidates[0].Content.Parts) == 0 {
                log.Printf("[TRANSLIT] ERROR: No parts in candidate")
                return nil, fmt.Errorf("no content returned from API")
        }

        aiText := geminiResp.Candidates[0].Content.Parts[0].Text
        log.Printf("[TRANSLIT] AI output: %s", aiText)

        var translitResp TransliterationResponse
        if err := json.Unmarshal([]byte(aiText), &translitResp); err != nil {
                log.Printf("[TRANSLIT] ERROR: Failed to parse AI JSON output: %v, raw: %s", err, aiText)
                return nil, fmt.Errorf("failed to parse transliteration result: %v", err)
        }

        suggestions := make([]string, 0, len(translitResp.Suggestions))
        for _, sugg := range translitResp.Suggestions {
                if sugg.Word != "" {
                        suggestions = append(suggestions, sugg.Word)
                }
        }

        totalTime := time.Since(startTime)
        log.Printf("[TRANSLIT] SUCCESS - Input: %q -> %d suggestions in %v", englishText, len(suggestions), totalTime)
        for i, s := range suggestions {
                log.Printf("[TRANSLIT]   [%d] %s", i, s)
        }

        return suggestions, nil
}
