// Add logging to CallGeminiProofread to see actual responses
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

var proofreadingPrompt = `You are an expert Tamil Proofreading Assistant.

Your job is to carefully analyze the given Tamil text (multiple sentences or paragraphs) and produce detailed corrections.

For every mistake you find, you must identify:
- The original text (word or phrase)
- The corrected version
- A clear Tamil explanation of the correction
- The type of the issue: "grammar", "spelling", "punctuation", or "suggestion"

VERY IMPORTANT RULES:
- Respond ONLY in Tamil.
- Preserve the original meaning.
- Do NOT rewrite entire sentences unless a correction is needed.
- Return ONLY the corrections found.
- Each correction must be precise and explain the linguistic rule.
- Keep output as clean JSON — strict format below.
- If no corrections, return an empty list.

STRICT OUTPUT FORMAT (MANDATORY):
{
    "success": true,
    "corrections": [
        {
            "originalText": "",
            "correction": "",
            "reason": "",
            "type": ""
        }
    ]
}

FIELD DEFINITIONS:
- "originalText": The exact incorrect Tamil word or phrase.
- "correction": The corrected form.
- "reason": A short but clear Tamil explanation (grammatical rule, spelling rule, sandhi rule, etc.)
- "type": One of the following: "grammar", "spelling", "punctuation", "suggestion"

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

// CallGeminiProofread calls Gemini 2.5 Flash with the proofreading prompt
func CallGeminiProofread(userText string, model string, apiKey string) (string, error) {
        if apiKey == "" {
                return "", fmt.Errorf("API key not provided")
        }

        log.Printf("[GEMINI] Starting with model: %s, text length: %d", model, len(userText))

        // Build final prompt
        finalPrompt := strings.Replace(proofreadingPrompt, "{{user_text}}", userText, 1)

        // Gemini API Endpoint
        url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
                model, apiKey)

        // Request payload
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
        }

        jsonBody, _ := json.Marshal(payload)

        // HTTP client with timeout
        client := &http.Client{
                Timeout: 20 * time.Second,
        }

        req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
        if err != nil {
                log.Printf("[GEMINI] Request build error: %v", err)
                return "", err
        }

        req.Header.Set("Content-Type", "application/json")

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
