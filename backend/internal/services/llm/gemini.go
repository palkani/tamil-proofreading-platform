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

var proofreadingPrompt = `You are an expert Tamil Proofreading Assistant with deep knowledge of Tamil grammar, style, and writing conventions.

Task: Analyze the Tamil text and provide comprehensive suggestions to improve quality, clarity, and professionalism.

WHAT TO CHECK (in order of priority):

1. SPELLING & GRAMMAR (உச்சரிப்பு & இலக்கணம்):
   - Misspelled Tamil words
   - Grammatical errors (subject-verb agreement, case markers, tense)
   - Incorrect verb forms or noun declensions

2. PUNCTUATION & FORMATTING (நிறுத்தக்குறிகள்):
   - Missing or incorrect punctuation (comma, period, question mark)
   - Date/ordinal formatting: "23 ஆம்/வது" → "23-ஆம்/வது"
   - Quotation marks and parentheses usage

3. WORD SPACING & COMPOUND WORDS (இடைவெளி):
   - Words incorrectly joined: "அவள்அழகானவள்" → "அவள் அழகானவள்"
   - Words incorrectly split: "தமிழ் நாடு" might be "தமிழ்நாடு" depending on context

4. SANDHI / EUPHONIC CONJUNCTION (புணர்ச்சி):
   ⚠️ IMPORTANT SANDHI RULES:
   a) BOTH forms acceptable (DO NOT flag as error):
      ✅ "வரலாற்றுச் சிறப்பு" (with sandhi)
      ✅ "வரலாற்று சிறப்பு" (without sandhi)
      Modern Tamil accepts both - these are stylistic choices, not errors
   
   b) ONLY flag when words improperly joined (missing space):
      ❌ "பதிவபுதுப்பித்தல்" → ✅ "பதிவுப் புதுப்பித்தல்"
      ❌ "அவள்அழகானவள்" → ✅ "அவள் அழகானவள்"
   
   c) Adjective-noun sandhi is OPTIONAL (don't force it):
      ✅ "வரலாற்றுச் சிறப்புமிக்க" (with ச்)
      ✅ "வரலாற்று சிறப்புமிக்க" (without ச்)
      Both are correct - DO NOT suggest changes between these forms!

5. CLARITY & FLOW (தெளிவு & ஓட்டம்):
   - Ambiguous phrasing that could be clearer
   - Overly long sentences that should be split
   - Redundant words or phrases
   - Better word choices for readability
   - Sentence structure improvements for better flow

6. TONE & STYLE (நடை):
   - Inconsistent register (mixing formal/informal)
   - Inappropriate tone for the context (news vs casual vs academic)
   - More natural or idiomatic expressions
   - Professional vs conversational adjustments

7. COMPLETENESS (முழுமை):
   - Incomplete sentences or thoughts
   - Missing words that make meaning unclear

SUGGESTION TYPES (use appropriate type):
- "spelling" - தவறான எழுத்துப்பிழை
- "grammar" - இலக்கண பிழை
- "punctuation" - நிறுத்தக்குறி பிழை
- "space" - இடைவெளி பிழை
- "sandhi" - புணர்ச்சி பிழை (ONLY for missing spaces!)
- "clarity" - தெளிவுக்காக மேம்பாடு
- "flow" - ஓட்டத்திற்கு மேம்பாடு
- "tone" - நடைக்கு மேம்பாடு
- "redundancy" - தேவையற்ற சொற்கள்
- "incomplete" - முழுமையற்றது

OUTPUT REQUIREMENTS:
✅ Return ONLY valid JSON (NO markdown fences, NO code blocks, NO explanations)
✅ Provide ALL useful suggestions (spelling + grammar + clarity + flow + tone)
✅ Each "original" must be exact substring from input text (copy-paste exactly)
✅ Keep "reason" concise (max 15 Tamil words), explain WHY it should change
✅ If input has NO issues, return: {"corrections":[],"corrected_text":""}
✅ Set corrected_text to "" (empty string) - we only need the corrections array
✅ Include start_index and end_index for each correction (if you can determine them)
✅ DO NOT include corrections where original == corrected
✅ Preserve English words and technical terms unless clearly misspelled

JSON FORMAT:
{
  "corrections": [
    {
      "original": "original text from input",
      "corrected": "improved version",
      "reason": "தமிழில் சுருக்கமான விளக்கம்",
      "type": "spelling|grammar|punctuation|space|sandhi|clarity|flow|tone|redundancy|incomplete",
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
