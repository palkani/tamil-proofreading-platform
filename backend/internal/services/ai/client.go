package ai

import (
        "encoding/json"
        "fmt"
        "strings"
        "time"

        "tamil-proofreading-platform/backend/internal/logger"
)

type Correction struct {
        Original  string `json:"original"`
        Corrected string `json:"corrected"`
        Reason    string `json:"reason"`
        Type      string `json:"type"`
}

type AIResult struct {
        CorrectedText string        `json:"corrected_text"`
        Corrections   []Correction  `json:"corrections"`
        Summary       string        `json:"summary"`
        Confidence    float64       `json:"confidence"`
        Mode          string        `json:"mode"`
        ProcessedAt   time.Time     `json:"processed_at"`
}

func ProcessText(mode string, text string) (map[string]interface{}, error) {
        startTime := time.Now()

        // Validate inputs
        if text == "" {
                err := fmt.Errorf("empty text provided")
                logger.LogError(mode, err)
                return nil, err
        }

        if mode == "" {
                mode = "correct"
        }

        // Build prompt based on mode
        prompt := buildPrompt(mode, text)
        logger.LogDebug("Mode: %s, Text length: %d, Prompt length: %d", mode, len([]rune(text)), len([]rune(prompt)))

        // Simulate AI processing
        var corrections []Correction
        var summary string

        switch mode {
        case "correct":
                corrections, summary = analyzeForCorrections(text)
        case "rewrite":
                corrections, summary = analyzeForRewrite(text)
        case "shorten":
                corrections, summary = analyzeForShorten(text)
        case "lengthen":
                corrections, summary = analyzeForLengthen(text)
        case "translate":
                corrections, summary = analyzeForTranslate(text)
        default:
                corrections, summary = analyzeForCorrections(text)
        }

        duration := time.Since(startTime)
        logger.LogDebug("Processing completed in %v", duration)

        // Build result
        result := AIResult{
                CorrectedText: text,
                Corrections:   corrections,
                Summary:       summary,
                Confidence:    0.95,
                Mode:          mode,
                ProcessedAt:   time.Now(),
        }

        // Convert to map
        resultMap := make(map[string]interface{})
        jsonData, err := json.Marshal(result)
        if err != nil {
                logger.LogAIError(mode, "json_marshal_error", err)
                return nil, err
        }

        err = json.Unmarshal(jsonData, &resultMap)
        if err != nil {
                logger.LogAIError(mode, "json_unmarshal_error", err)
                return nil, err
        }

        return resultMap, nil
}

func buildPrompt(mode string, text string) string {
        prompts := map[string]string{
                "correct": `You are a Tamil grammar and proofreading expert. Analyze the following Tamil text and identify any grammar, spelling, or punctuation errors.

Text: "%s"

Respond with:
1. A list of corrections needed
2. Explanations in Tamil
3. Corrected version of the text`,

                "rewrite": `You are a Tamil writing expert. Rewrite the following Tamil text to make it more elegant and clearer while maintaining the original meaning.

Text: "%s"

Provide:
1. Rewritten version
2. Key improvements made
3. Alternative phrasings`,

                "shorten": `You are a Tamil content expert. Shorten the following Tamil text while preserving all important information.

Text: "%s"

Provide:
1. Shortened version
2. Words removed and why
3. Clarity maintained`,

                "lengthen": `You are a Tamil writer. Expand the following Tamil text with more details and examples.

Text: "%s"

Provide:
1. Expanded version
2. Details added
3. Examples included`,

                "translate": `You are a Tamil-English translator. Translate the following English text to Tamil.

Text: "%s"

Provide:
1. Tamil translation
2. Alternative translations
3. Explanation of word choices`,
        }

        prompt, exists := prompts[mode]
        if !exists {
                prompt = prompts["correct"]
        }

        return fmt.Sprintf(prompt, text)
}

func analyzeForCorrections(text string) ([]Correction, string) {
        corrections := []Correction{}

        // Mock analysis - in production, this would call Gemini API
        if strings.Contains(text, "  ") {
                corrections = append(corrections, Correction{
                        Original:  "double space",
                        Corrected: "single space",
                        Reason:    "உரைகளில் இரட்டை இடைவெளி இருக்கக்கூடாது",
                        Type:      "spacing",
                })
        }

        if strings.Contains(text, ",,,") || strings.Contains(text, "...") {
                corrections = append(corrections, Correction{
                        Original:  "multiple punctuation",
                        Corrected: "single punctuation",
                        Reason:    "ஒன்றுக்கு மேற்பட்ட இறுதிப் புள்ளிகளைத் தவிர்க்கவும்",
                        Type:      "punctuation",
                })
        }

        summary := fmt.Sprintf("பாரம்பரிய பரிசோதனை முடிந்தது. %d திருத்தங்கள் கண்டறியப்பட்டுள்ளன", len(corrections))
        return corrections, summary
}

func analyzeForRewrite(text string) ([]Correction, string) {
        corrections := []Correction{
                {
                        Original:  text,
                        Corrected: "மேம்படுத்தப்பட்ட பதிப்பு வந்திருக்கிறது",
                        Reason:    "நடையை மேம்படுத்த பதிப்பி செய்யப்பட்டது",
                        Type:      "rewrite",
                },
        }

        summary := "மறுதொடுக்கல் முடிந்தது. உரை மேம்படுத்தப்பட்டுள்ளது"
        return corrections, summary
}

func analyzeForShorten(text string) ([]Correction, string) {
        correctedText := text
        if len([]rune(text)) > 100 {
                correctedText = string([]rune(text)[:100]) + "..."
        }

        corrections := []Correction{
                {
                        Original:  text,
                        Corrected: correctedText,
                        Reason:    "நீளம் குறைக்கப்பட்டுள்ளது",
                        Type:      "shorten",
                },
        }

        summary := "சுருக்கம் முடிந்தது. குறிப்பிடத்தக்க நீளம் குறைக்கப்பட்டுள்ளது"
        return corrections, summary
}

func analyzeForLengthen(text string) ([]Correction, string) {
        expandedText := text + ". மேலும் விவரங்கள் சேர்க்கப்பட்டுள்ளன."

        corrections := []Correction{
                {
                        Original:  text,
                        Corrected: expandedText,
                        Reason:    "விவரங்கள் சேர்க்கப்பட்டுள்ளன",
                        Type:      "lengthen",
                },
        }

        summary := "நீட்டிப்பு முடிந்தது. நிறைய விவரங்கள் சேர்க்கப்பட்டுள்ளன"
        return corrections, summary
}

func analyzeForTranslate(text string) ([]Correction, string) {
        corrections := []Correction{
                {
                        Original:  text,
                        Corrected: "தமிழ் மொழிபெயர்ப்பு வந்திருக்கிறது",
                        Reason:    "ஆங்கிலம் தமிழுக்கு மொழிபெயர்க்கப்பட்டுள்ளது",
                        Type:      "translation",
                },
        }

        summary := "மொழிபெயர்ப்பு முடிந்தது"
        return corrections, summary
}
