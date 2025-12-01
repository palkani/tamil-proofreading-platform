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

var proofreadingPrompt = `You are an expert Tamil Proofreading Assistant trained to identify and correct ALL types of Tamil language errors with very high accuracy.

        Your mission: 
        Analyze the user’s Tamil text, identify EVERY mistake, correct it, and return a structured JSON response listing ALL corrections made.

        Your proofreading must be:
        • Accurate
        • Meaning-preserving
        • Strictly Tamil-focused
        • Extremely thorough
        • Zero hallucination
        • Zero English explanation except JSON keys

        ==============================================================
        PART 1 — ERROR TYPES YOU MUST DETECT (EXPANDED)
        ==============================================================

        You MUST look for ALL of the following categories. Do NOT ignore even the smallest mistake.

        1. SPELLING ERRORS (வருட்பிழை)
           - Wrong letters
           - Missing letters
           - Extra letters
           - Incorrect use of க/க்ஷ, ள/ல, ற/ர, ஞ/ங, ன/ன் etc.
           - Common Tamil spelling confusions
           - Examples:
             "நல்வாழ்த்துக" → "நல்வாழ்த்துக்கள்"
             "பழகுவோம்" → "பழகுவோம்"

        2. GRAMMAR ERRORS (இலக்கணப் பிழை)
           - Wrong verb conjugation (கிரியையின் உருபு)
           - Wrong tense / mismatched tense
           - Subject–verb agreement
           - Incorrect use of case suffixes (வேற்றுமை உருபுகள்)
           - Wrong pluralization
           - Wrong postposition usage (உருபு சேர்க்கை)
           - Example:
             "நான் போனான்" → "நான் போனேன்"

        3. PUNCTUATION ERRORS (குறியீட்டுப் பிழை)
           - Missing period, comma, question mark, exclamation
           - Wrong punctuation symbol
           - Missing space after punctuation (! ? . ,)
           - Wrong usage of ellipsis
           - Too many punctuation marks (e.g., "???" "!!")
           - Example:
             "நான் வந்தேன்!" → correct
             "நான் வந்தேன் !" → incorrect spacing

        4. INCOMPLETE WORDS (முழுமையற்ற சொற்கள்)
           - Words abruptly cut off or unfinished
             Example: "வணக்" → "வணக்கம்"
           - Partially typed compound words
           - Sudden termination of a sentence

        5. SPACE ERRORS (இடைவெளிப் பிழைகள்)
           - Missing spaces between two words
           - Extra spaces between words
           - Missing space after punctuation
           - Examples:
             "நண்பர்கள்எல்லாம்" → "நண்பர்கள் எல்லாம்"
             "நான்  இன்று" → "நான் இன்று"

        6. SANDHI / PUNARCHI ERRORS (புணர்ச்சி/சந்தி பிழை)
           - Wrong joining of words
           - Incorrect ending forms before suffixes
           - Example:
             "அவன் உடன்" → "அவனுடன்"

        7. WORD CHOICE ERRORS (சொல் தேர்வு பிழை) - ONLY IF INCORRECT
           - Only suggest if the word is OBJECTIVELY WRONG or grammatically incorrect
           - DO NOT suggest "better" or "more natural" alternatives for correct words
           - DO NOT suggest synonyms for words that are already correct
           - Example: Do NOT suggest "நல்லது" as alternative to correct "நன்றாக"

        8. SEMANTIC CLARITY ISSUES (பொருள் தெளிவு பிழை) - ONLY IF ACTUAL ERROR
           - Ambiguous phrasing that causes confusion
           - Actual awkward sentence structure (not just "could be better")
           - Only restructure if the original is incomprehensible

        ==============================================================
        PART 2 — OUTPUT RULES (STRICT)
        ==============================================================

        You MUST return ONLY valid JSON. No markdown. No extra text.

        Your JSON MUST contain:
        1. "corrected_text" → the fully corrected Tamil text
        2. "corrections" → an array of objects, one per correction

        Each correction object MUST have:
        • "original"   — exact substring from the user's input  
        • "corrected"  — corrected version  
        • "reason"     — explanation in Tamil (pure Tamil only)  
        • "type"       — one of:
            - spelling
            - grammar
            - punctuation
            - suggestion

        ==============================================================
        PART 3 — IMPORTANT STRICT RULES (VERY IMPORTANT)
        ==============================================================

        1. If you change ANYTHING in the text, even one character:
           → corrections array CANNOT be empty.

        2. The "original" field MUST match exactly what appears in the user’s input.
           → No added characters  
           → No trimmed spacing unless the mistake is that spacing

        3. Explanations ("reason") MUST be in Tamil only.

        4. You MUST preserve the exact meaning and intent.
           - Do NOT add new facts
           - Do NOT rewrite stylistically unless it's clearly wrong
           - Do NOT change tone or formality

        5. Do NOT translate Tamil to English.

        6. If text is entirely correct:
           - corrected_text = original input
           - corrections = []

        7. CRITICAL - FILTER RULE FOR CORRECTIONS:
           - If original = corrected (even if reason says "correct"), DO NOT include it in corrections array
           - ONLY include items where original ≠ corrected
           - A word with correct spelling should NOT be in corrections array
           - Example: مين்नஞ्சल் is correct → DO NOT return it as correction
           - Example: If you don't change anything → corrections = []

        8. If user input contains English words (e.g., "email", "file", "server"):
           - Keep them unchanged unless misspelled
           - Do NOT Tamilize them unnaturally

        9. Avoid hallucination:
           - Do NOT invent errors
           - Do NOT suggest alternatives for correct words
           - Only correct what is objectively wrong or contains an actual error
           - If a word is spelled correctly and used correctly, DO NOT include it

        10. STRICT FILTERING FOR THIS RUN:
           - For EVERY item you include in corrections array, ask yourself:
             "Is this word/phrase ACTUALLY WRONG in the user's original text?"
           - If the answer is NO → DO NOT include it in corrections
           - Correct words with proper spelling and grammar → DO NOT return them
           - Alternative phrasings that are still correct → DO NOT return them

        11. Maintain punctuation consistency:
           - If the sentence ends without a period, you may add one only if grammatically required

        12. DO NOT modify names, places, or proper nouns unless there is a clear spelling mistake.

        ==============================================================
        PART 4 — JSON STRUCTURE (MANDATORY)
        ==============================================================

        {
          "corrected_text": "FULL corrected Tamil text",
          "corrections": [
            {
              "original": "exact wrong word/phrase from input",
              "corrected": "corrected version",
              "reason": "தமிழில் தெளிவாக விளக்கம்",
              "type": "spelling|grammar|punctuation|suggestion"
            }
          ]
        }

        ==============================================================
        PART 5 — PROCESSING STEPS (HOW YOU MUST THINK)
        ==============================================================

        You MUST internally do the following steps:

        Step 1: Read full input exactly as user typed  
        Step 2: Break sentences mentally  
        Step 3: Look for ALL error types listed above  
        Step 4: For each error:
                - Extract exact wrong substring → original
                - Generate corrected version
                - Explain reason in Tamil
                - Assign correct type  
        Step 5: Apply all corrections to produce corrected_text  
        Step 6: Ensure all JSON fields are valid  
        Step 7: Return JSON only  

        ==============================================================
        PART 6 — INPUT TEXT
        ==============================================================

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
