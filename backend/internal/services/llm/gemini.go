// Gemini AI service for Tamil proofreading
package llm

import (
        "bytes"
        "encoding/json"
        "fmt"
        "io"
        "log"
        "net/http"
        "strings"
        "time"
)

var proofreadingPrompt = `You are a Tamil Proofreading Assistant. Identify and correct ALL Tamil language errors.

Find these error types:
1. SPELLING: Wrong/missing/extra letters (நல்வாழ்த்துக → நல்வாழ்த்துக்கள்)
2. GRAMMAR: Wrong tense, conjugation, case suffix (நான் போனான் → நான் போனேன்)
3. PUNCTUATION: Missing/wrong punctuation (வந்தேன் → வந்தேன்।)
4. INCOMPLETE WORDS: Cut off words (வணக் → வணக்கம்)
5. SPACE ERRORS: Missing/extra spaces (நண்பர்கள்எல்லாம் → நண்பர்கள் எல்லாம்)
6. SANDHI: Wrong word joining (அவன் உடன் → அவனுடன்)

RULES (STRICT):
- Return ONLY valid JSON. No markdown, no code fences.
- Return corrected_text and corrections array
- Each correction: {original, corrected, reason (Tamil), type}
- If original = corrected → DO NOT include it
- Only include actual errors, NO alternatives for correct words
- Preserve meaning exactly
- Keep English words unchanged unless misspelled
- If entirely correct: corrections = []

JSON FORMAT:
{
  "corrected_text": "corrected Tamil text",
  "corrections": [
    {original: "wrong", corrected: "fixed", reason: "தமிழ் விளக்கம்", type: "spelling|grammar|punctuation|incomplete|space|sandhi"}
  ]
}

TEXT TO PROOFREAD:
[USER'S TAMIL TEXT HERE]
`

type GeminiResponse struct {
        Candidates []struct {
                Content struct {
                        Parts []struct {
                                Text string `json:"text"`
                        } `json:"parts"`
                } `json:"content"`
        } `json:"candidates"`
}

// Reusable HTTP client with connection pooling for better performance
var geminiClient = &http.Client{
        Timeout: 25 * time.Second,
        Transport: &http.Transport{
                MaxIdleConns:        10,
                MaxIdleConnsPerHost: 5,
                IdleConnTimeout:     90 * time.Second,
        },
}

// CallGeminiProofread calls Gemini 2.5 Flash with the proofreading prompt
func CallGeminiProofread(userText string, model string, apiKey string) (string, error) {
        if apiKey == "" {
                return "", fmt.Errorf("API key not provided")
        }

        startTime := time.Now()
        log.Printf("[GEMINI] Starting with model: %s, text length: %d", model, len(userText))

        // Build final prompt - CRITICAL: Replace the actual placeholder in the prompt template
        finalPrompt := strings.Replace(proofreadingPrompt, "[USER'S TAMIL TEXT HERE]", userText, 1)
        promptBuildTime := time.Since(startTime)

        // Gemini API Endpoint
        url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
                model, apiKey)

        // Request payload with optimized settings for faster response
        // - maxOutputTokens increased to 4096 (from 2048) to handle long responses
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
                        "maxOutputTokens":  4096,
                        "responseMimeType": "application/json",
                },
        }

        jsonBody, _ := json.Marshal(payload)
        prepTime := time.Since(startTime)
        log.Printf("[GEMINI] Prep time: %v (prompt build: %v)", prepTime, promptBuildTime)

        req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
        if err != nil {
                log.Printf("[GEMINI] Request build error: %v", err)
                return "", err
        }

        req.Header.Set("Content-Type", "application/json")

        apiStartTime := time.Now()
        resp, err := geminiClient.Do(req)
        if err != nil {
                log.Printf("[GEMINI] Request error after %v: %v", time.Since(apiStartTime), err)
                return "", err
        }
        defer resp.Body.Close()

        apiTime := time.Since(apiStartTime)
        log.Printf("[GEMINI] Response status: %d, API time: %v", resp.StatusCode, apiTime)

        // Read full response body
        bodyBytes, err := io.ReadAll(resp.Body)
        if err != nil {
                log.Printf("[GEMINI] Error reading response body: %v", err)
                return "", err
        }

        bodyStr := string(bodyBytes)
        log.Printf("[GEMINI] Raw response: %s", bodyStr)

        // Parse response
        var geminiResp GeminiResponse
        if err := json.Unmarshal(bodyBytes, &geminiResp); err != nil {
                log.Printf("[GEMINI] JSON parse error: %v", err)
                return "", err
        }

        // Extract final text
        if len(geminiResp.Candidates) == 0 {
                log.Printf("[GEMINI] No candidates in response")
                return "", fmt.Errorf("no candidates returned from Gemini")
        }

        if len(geminiResp.Candidates[0].Content.Parts) == 0 {
                log.Printf("[GEMINI] No parts in candidates")
                return "", fmt.Errorf("no content returned from Gemini")
        }

        result := geminiResp.Candidates[0].Content.Parts[0].Text
        totalTime := time.Since(startTime)
        log.Printf("[GEMINI] SUCCESS - Total time: %v, API time: %v, Result length: %d", totalTime, apiTime, len(result))
        return result, nil
}

var transliterationPrompt = `You are a Tamil Transliteration Engine.
Convert the given English phonetic input into the top 5 most likely Tamil words.
Output ONLY valid JSON in the following structure:

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
- Only output Tamil Unicode for "word".
- Never output English translations.
- Never output anything outside JSON.
- If input is too short or meaningless, return empty suggestions list.
- Scores must be descending from 1.0 to ~0.6.

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
