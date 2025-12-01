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
