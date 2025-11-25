// Gemini AI service - supports both Replit AI Integrations and direct Google API
package llm

import (
        "bytes"
        "encoding/json"
        "fmt"
        "io"
        "log"
        "net/http"
        "os"
        "strings"
        "time"
)

var proofreadingPrompt = `You are an expert Tamil Proofreading Assistant specialized in finding ALL types of errors.

CRITICAL: Your job is to CAREFULLY analyze the given Tamil text and find ALL mistakes including:
1. SPELLING ERRORS - Wrong letters, missing letters, extra letters
2. GRAMMAR ERRORS - Verb conjugation, subject-verb agreement, case markers
3. PUNCTUATION ERRORS - Missing/wrong punctuation marks, spacing issues
4. INCOMPLETE WORDS - Words that are cut off or incomplete (e.g., "நல்வாழ்த்துக" should be "நல்வாழ்த்துக்கள்")
5. MISSING SPACES - Text without proper word spacing (e.g., "word1word2" should be "word1 word2")
6. SANDHI ERRORS - Incorrect Tamil sandhi (punarchi) rules
7. WORD CHOICE - Wrong word usage or better alternatives

BE VERY THOROUGH - Even small issues like missing spaces between sentences should be reported!

For every mistake you find, you must identify:
- The original text (word or phrase)
- The corrected version
- A clear Tamil explanation of WHY this is an error
- The type of the issue

STRICT OUTPUT FORMAT (MANDATORY JSON):
{
    "corrected_text": "The full corrected Tamil text with all fixes applied",
    "corrections": [
        {
            "original": "exact wrong text",
            "corrected": "the fixed version",
            "reason": "விளக்கம் தமிழில்",
            "type": "spelling|grammar|punctuation|suggestion"
        }
    ]
}

RULES:
- ALWAYS respond with valid JSON only - no markdown, no extra text
- ALWAYS include "corrected_text" with the full fixed text
- ALWAYS include "corrections" array (even if empty)
- Explanations in "reason" must be in Tamil
- Check for missing spaces after punctuation marks like ! ? .
- Check for incomplete words

INPUT TEXT:
{{user_text}}`

type GeminiResponse struct {
        Candidates []struct {
                Content struct {
                        Parts []struct {
                                Text string `json:"text"`
                        } `json:"parts"`
                } `json:"content"`
        } `json:"candidates"`
}

// CallGeminiProofread calls Gemini with the proofreading prompt
// Uses Replit AI Integrations if available, otherwise falls back to direct Google API
func CallGeminiProofread(userText string, model string, apiKey string) (string, error) {
        log.Printf("[GEMINI] Starting with model: %s, text length: %d", model, len(userText))

        // Check for Replit AI Integrations environment variables
        replitBaseURL := os.Getenv("AI_INTEGRATIONS_GEMINI_BASE_URL")
        replitAPIKey := os.Getenv("AI_INTEGRATIONS_GEMINI_API_KEY")

        var url string
        var useReplitIntegration bool

        if replitBaseURL != "" && replitAPIKey != "" {
                // Use Replit AI Integrations (no external API key needed)
                log.Printf("[GEMINI] Using Replit AI Integrations")
                url = fmt.Sprintf("%s/models/%s:generateContent", replitBaseURL, model)
                apiKey = replitAPIKey
                useReplitIntegration = true
        } else if apiKey != "" {
                // Use direct Google API with provided key
                log.Printf("[GEMINI] Using direct Google API")
                url = fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
                        model, apiKey)
                useReplitIntegration = false
        } else {
                return "", fmt.Errorf("no API key or Replit AI Integration available")
        }

        // Build final prompt
        finalPrompt := strings.Replace(proofreadingPrompt, "{{user_text}}", userText, 1)

        // Request payload with JSON mode and optimized settings
        payload := map[string]interface{}{
                "contents": []map[string]interface{}{
                        {
                                "role": "user",
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
                        "maxOutputTokens":  8192,
                        "responseMimeType": "application/json",
                },
        }

        jsonBody, _ := json.Marshal(payload)

        // HTTP client with timeout
        client := &http.Client{
                Timeout: 30 * time.Second,
        }

        req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
        if err != nil {
                log.Printf("[GEMINI] Request build error: %v", err)
                return "", err
        }

        req.Header.Set("Content-Type", "application/json")

        // Add Authorization header for Replit AI Integrations
        if useReplitIntegration {
                req.Header.Set("Authorization", "Bearer "+apiKey)
        }

        resp, err := client.Do(req)
        if err != nil {
                log.Printf("[GEMINI] Request error: %v", err)
                return "", err
        }
        defer resp.Body.Close()

        log.Printf("[GEMINI] Response status: %d", resp.StatusCode)

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
        log.Printf("[GEMINI] Extracted result (length: %d): %s", len(result), result)
        return result, nil
}
