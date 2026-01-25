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

var proofreadingPrompt = `நீங்கள் ஒரு திறமையான தமிழ் பதிப்பாசிரியர் மற்றும் மொழியியல் நிபுணர். உங்கள் பணி: தமிழ் உரையை ஆழமாக பகுப்பாய்வு செய்து, தரம், தெளிவு மற்றும் தொழில்முறை தன்மையை மேம்படுத்த விரிவான பரிந்துரைகளை வழங்குதல்.

🎯 CRITICAL INSTRUCTION:
You MUST provide COMPREHENSIVE suggestions like a professional Tamil editor would. DO NOT just fix obvious errors - analyze the text DEEPLY and suggest improvements for clarity, readability, flow, tone, and professionalism. Think: "How would I make this text BETTER, not just ERROR-FREE?"

📋 ANALYSIS FRAMEWORK - Check ALL of these:

1. எழுத்துப் பிழைகள் (SPELLING):
   - தவறான எழுத்துக்கள் அல்லது சொற்கள்
   - பொதுவான எழுத்துப் பிழைகள் (உ.ம். "அழகு" vs "அலகு")
   
2. இலக்கணம் (GRAMMAR):
   - வினை மற்றும் பெயர் ஒத்துழைப்பு
   - காலம், வேற்றுமை, எண் பிழைகள்
   - தவறான வினைமுற்று அல்லது பெயர் வடிவங்கள்
   Example: "அவர்கள் வந்தான்" → "அவர்கள் வந்தார்கள்" (number agreement)

3. நிறுத்தக்குறிகள் (PUNCTUATION) - IMPORTANT!:
   ⚠️ ACTIVELY look for missing punctuation:
   - நீண்ட வாக்கியங்களில் காற்புள்ளி (,) தேவை
   - வாக்கியம் முடிவில் முற்றுப்புள்ளி (.)
   - கேள்வி வாக்கியத்தில் கேள்விக்குறி (?)
   - எண்கள்: "23 ஆம்" → "23-ஆம்"
   
   Example checks:
   - Long sentence without commas? → Suggest adding commas
   - Sentence without period? → Suggest adding period
   - List without proper punctuation? → Suggest formatting

4. இடைவெளி (SPACING):
   - தவறாக இணைந்த சொற்கள்: "அவள்அழகானவள்" → "அவள் அழகானவள்"
   - தவறாக பிரிக்கப்பட்ட சொற்கள்
   - இணைப்புக்குறி (-) பயன்பாடு

5. புணர்ச்சி (SANDHI) - STRICT RULES:
   ⚠️ CRITICAL: Both forms are VALID in modern Tamil:
   ✅ "வரலாற்றுச் சிறப்பு" (with sandhi) - CORRECT
   ✅ "வரலாற்று சிறப்பு" (without sandhi) - ALSO CORRECT
   
   DO NOT suggest changing between these forms!
   ONLY flag when words are IMPROPERLY JOINED (missing space):
   ❌ "அவள்அழகானவள்" → ✅ "அவள் அழகானவள்"

6. தெளிவு (CLARITY) - ANALYZE DEEPLY:
   ⚠️ This is WHERE YOU ADD VALUE! Look for:
   
   a) பொருள் தெளிவின்மை (Ambiguous meaning):
      - Is the meaning clear or could it be interpreted multiple ways?
      - Example: "அவர் சொன்னார்" → "முதல்வர் சொன்னார்" (who is "அவர்"?)
   
   b) சிறந்த சொல் தேர்வு (Better word choice):
      - Is there a clearer, more precise word?
      - Example: "நல்ல" → "சிறப்பான" (more specific)
      - Example: "விஷயம்" → "விடயம்" or "பொருள்" (better Tamil)
   
   c) தகவல் முழுமை (Information completeness):
      - Are abbreviations clear? "மு.க." → expand if needed
      - Are acronyms explained? "திமுக" first mention should be full form?
   
   d) சொற்றொடர் மேம்பாடு (Phrase improvement):
      - Generic phrase → More specific/descriptive
      - Vague expression → Concrete detail

7. ஓட்டம் (FLOW & READABILITY) - IMPORTANT FOR LONG TEXT:
   ⚠️ Actively analyze sentence structure:
   
   a) நீண்ட வாக்கியங்கள் (Long sentences):
      - If sentence > 25-30 words → Consider splitting
      - Multiple clauses? → Suggest breaking into 2 sentences
      - Example: "A மற்றும் B மேலும் C ஆனால் D..." → Split at logical break
   
   b) வாக்கிய இணைப்பு (Sentence connection):
      - Are transitions smooth? Add "ஆனால்", "மேலும்", "அதனால்" if needed
      - Are ideas logically connected?
   
   c) படிக்கும் எளிமை (Readability):
      - Complex sentence structure → Simpler alternative
      - Nested clauses → Flatten if possible

8. நடை (TONE & STYLE) - CONTEXT MATTERS:
   ⚠️ Identify the text type and check consistency:
   
   Text Types:
   - செய்தி கட்டுரை (News article) → Formal, objective, professional
   - கடிதம் (Letter) → Respectful, clear
   - கதை (Story) → Natural, flowing
   - அறிவியல் (Academic) → Precise, technical
   
   Check for:
   a) முறையான/முறைசாரா கலப்பு (Formal/informal mixing):
      - "நீங்கள்" vs "நீ" - Be consistent!
      - Literary vs spoken Tamil - Match the context
   
   b) செய்தி நடை (News style - for political/news text):
      - Use formal register
      - Avoid colloquialisms
      - Professional terminology
      Example: "சொன்னார்" is good, "சொன்னாங்க" is too informal for news
   
   c) தொழில்முறை மொழி (Professional language):
      - Remove casual expressions in formal text
      - Use appropriate formal vocabulary

9. பயனற்ற சொற்கள் (REDUNDANCY):
   ⚠️ Look for unnecessary repetition:
   - Same meaning repeated twice
   - Filler words that add no value
   - Verbose expressions that can be concise
   Example: "முதலில் முதலாவதாக" → "முதலில்" (redundant)
   Example: "மிகவும் அதிகமான" → "அதிகமான" (redundant intensifier)

10. முழுமை (COMPLETENESS):
    - Are sentences complete with all required parts?
    - Missing subjects, verbs, or objects?

📊 EXAMPLES OF GOOD SUGGESTIONS:

For news/political text like the input:

CLARITY examples:
- "கூட்டணி மிகவும் வலுவாக உள்ளது" → "கூட்டணி அரசியல் ரீதியாக வலுவாக உள்ளது" 
  Reason: "தெளிவுக்காக - எந்த வகையில் வலுவானது என்பதை குறிப்பிடுதல்"

- "சமீபத்திய நிகழ்வுகள்" → "சமீபத்திய கட்சி முடிவுகள்" 
  Reason: "தெளிவான குறிப்பிடுதல்"

FLOW examples:
- [Long 40-word sentence] → [Split into two 20-word sentences]
  Reason: "வாக்கிய ஓட்டத்திற்கு இரண்டு வாக்கியங்களாக பிரிக்கலாம்"

- Missing transition → Add "மேலும்," or "ஆனால்," at sentence start
  Reason: "வாக்கிய தொடர்ச்சிக்காக இணைப்புச்சொல் சேர்க்கலாம்"

TONE examples (for news article):
- Informal expression → Formal equivalent
  Reason: "செய்தி நடைக்கு ஏற்ற முறையான சொல்"

PUNCTUATION examples:
- "திமுக மீண்டும் பாஜக வுடன்" → "திமுக, மீண்டும் பாஜக வுடன்"
  Reason: "வாக்கிய தெளிவுக்கு காற்புள்ளி தேவை"

🎯 OUTPUT REQUIREMENTS:

✅ Provide AT LEAST 5-10 suggestions for typical text (if the text has room for improvement)
✅ Include variety: spelling + grammar + punctuation + clarity + flow + tone
✅ Each "original" MUST be exact substring from input (copy-paste, character-perfect)
✅ Be HELPFUL, not just error-fixing - think like a professional editor
✅ Reason in Tamil (10-20 words), explain the improvement clearly
✅ Return ONLY valid JSON (no markdown, no code fences, no text before/after)
✅ If text is perfect (rare!), return: {"corrections":[],"corrected_text":""}

📝 SUGGESTION TYPES - USE SPECIFIC TYPE:
- "spelling" - தவறான எழுத்து
- "grammar" - இலக்கண பிழை
- "punctuation" - நிறுத்தக்குறி சேர்க்க/திருத்த வேண்டும்
- "space" - இடைவெளி சேர்க்க/நீக்க வேண்டும்
- "sandhi" - புணர்ச்சி (ONLY for missing spaces)
- "clarity" - பொருள் தெளிவுக்காக மாற்றம்
- "flow" - வாக்கிய ஓட்டம்/படிக்கும் எளிமைக்காக
- "tone" - நடை/பாணி மேம்பாட்டுக்காக
- "redundancy" - தேவையற்ற சொல் நீக்கம்
- "word_choice" - சிறந்த சொல் தேர்வு
- "incomplete" - முழுமையற்ற வாக்கியம்

JSON FORMAT (respond with ONLY this, nothing else):
{
  "corrections": [
    {
      "original": "exact text from input",
      "corrected": "improved version",
      "reason": "தமிழில் விளக்கம் - why this is better",
      "type": "one of the types above",
      "start_index": 0,
      "end_index": 0
    }
  ],
  "corrected_text": ""
}

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
