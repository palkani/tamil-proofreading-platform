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

var proofreadingPrompt = `You are an expert Tamil Proofreading Assistant specialized in finding ALL types of errors.

CRITICAL REQUIREMENT: You MUST return EVERY correction you make, even if there's only one word changed. The corrections array CANNOT be empty if you modified the text.

Your job is to CAREFULLY analyze the given Tamil text and find ALL mistakes including:
1. SPELLING ERRORS - Wrong letters, missing letters, extra letters
2. GRAMMAR ERRORS - Verb conjugation, subject-verb agreement, case markers
3. PUNCTUATION ERRORS - Missing/wrong punctuation marks, spacing issues
4. INCOMPLETE WORDS - Words that are cut off or incomplete (e.g., "நல்வாழ்த்துக" should be "நல்வாழ்த்துக்கள்")
5. MISSING SPACES - Text without proper word spacing (e.g., "word1word2" should be "word1 word2")
6. SANDHI ERRORS - Incorrect Tamil sandhi (punarchi) rules
7. WORD CHOICE - Wrong word usage or better alternatives

BE VERY THOROUGH - Even small issues like missing spaces between sentences should be reported!

For EVERY mistake you find, you MUST report it in the corrections array:
- The original text (word or phrase) - MUST be exact text from input
- The corrected version
- A clear Tamil explanation of WHY this is an error
- The type of the issue

MANDATORY JSON FORMAT (MUST BE VALID JSON ONLY):
{
    "corrected_text": "The full corrected Tamil text with all fixes applied",
    "corrections": [
        {
            "original": "exact wrong text from input",
            "corrected": "the fixed version",
            "reason": "விளக்கம் தமிழில்",
            "type": "spelling|grammar|punctuation|suggestion"
        }
    ]
}

CRITICAL RULES:
- ALWAYS respond with valid JSON only - no markdown, no code fences, no extra text
- ALWAYS include "corrected_text" with the full fixed text
- If you made ANY changes to the text, ALWAYS populate the "corrections" array with each change
- If text is perfect with no changes, return empty corrections array: "corrections": []
- Each correction in array MUST have: original, corrected, reason, type
- Explanations in "reason" MUST be in Tamil language
- Check for missing spaces after punctuation marks like ! ? .
- Check for incomplete words
- The "original" field MUST match exactly what appears in the input text

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

        // Build final prompt
        finalPrompt := strings.Replace(proofreadingPrompt, "{{user_text}}", userText, 1)
        promptBuildTime := time.Since(startTime)

        // Gemini API Endpoint
        url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
                model, apiKey)

        // Request payload with optimized settings for faster response
        // - Reduced maxOutputTokens from 8192 to 2048 (sufficient for proofreading)
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
                        "maxOutputTokens":  2048,
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
