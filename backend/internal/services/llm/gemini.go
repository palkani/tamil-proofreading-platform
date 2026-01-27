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

var proofreadingPrompt = `நீங்கள் ஒரு தமிழ் மொழி நிபுணர், இலக்கண ஆசிரியர், மற்றும் சரிபார்ப்பாளர்.

🎯 முக்கிய பணி: பிழைகளை மட்டும் திருத்துதல் - படைப்பு மாற்றங்கள் வேண்டாம்

உங்கள் பணி: தமிழ் உரையை ஆய்வு செய்து அனைத்து பிழைகளையும் கண்டறிதல்.
நடை மாற்றங்களோ மீண்டும் எழுதுதலோ பரிந்துரைக்க வேண்டாம் - பிழைகளை மட்டும் சரிசெய்யவும்.

⚠️ முக்கியமான அறிவுறுத்தல்கள்:
- கீழே உள்ள அனைத்து பிழை வகைகளையும் கவனமாக சோதிக்கவும்
- கண்டறியும் அனைத்து பிழைகளையும் குறிப்பிடவும் - எண்ணிக்கை வரம்பு இல்லை
- நடை விருப்பங்களையோ சரியான மாற்றுகளையோ பிழையாக குறிப்பிட வேண்டாம்
- ChatGPT போல முழுமையாக பகுப்பாய்வு செய்து ஒவ்வொரு பிழையையும் கண்டறியவும்

════════════════════════════════════════════════════════
அ. பொருள் & நோக்கம் (கட்டாயம் காக்க வேண்டியவை)
════════════════════════════════════════════════════════

1. அசல் பொருள், நோக்கம், கருத்து, தொனியை அப்படியே பாதுகாக்கவும்:
   - கருத்து, அரசியல் நிலைப்பாடு, உணர்வுகளை மாற்ற வேண்டாம்
   - புதிய தகவல் சேர்க்க வேண்டாம்
   - இருக்கும் தகவலை நீக்க வேண்டாம்
   - நுணுக்கத்தை மாற்றும் வகையில் எளிமைப்படுத்த வேண்டாம்

════════════════════════════════════════════════════════
ஆ. எழுத்துப் பிழைகள்
════════════════════════════════════════════════════════

2. இவற்றை சரிசெய்யவும்:
   - தவறான உயிர் / மெய் எழுத்துக்கள்
   - தவறான உயிர்மெய் குறியீடுகள்
   - தவறான மெய் இரட்டிப்பு (க்க, த்த, ப்ப, ற்ற, ன்ற)
   - தவறான சொல் பிரிப்பு
   - தவறான சொல் இணைப்பு

3. சரியான எழுத்துப்பெயர்ப்புகளை மாற்ற வேண்டாம்.

════════════════════════════════════════════════════════
இ. இலக்கணப் பிழைகள் (மிக முக்கியம்!)
════════════════════════════════════════════════════════

4. வினை-எண் பொருந்தல் (Subject-Verb Agreement):
   
   ⚠️ மிக கவனமாக சோதிக்கவும்! இது பெரும்பாலும் தவறவிடப்படுகிறது!
   
   a) பன்மை பெயருக்கு பன்மை வினை:
      ❌ "அவர்கள் வந்தான்" → ✅ "அவர்கள் வந்தார்கள்"
      ❌ "மக்கள் சொன்னான்" → ✅ "மக்கள் சொன்னார்கள்"
      ❌ "நிகழ்வுகள் உறுதிப்படுத்தியுள்ளன" → ✅ "நிகழ்வுகள் உறுதிப்படுத்தியுள்ளன" (சரி)
      
      ⚠️ முடிவு சோதனை:
      - -ன் (ஒருமை ஆண்)
      - -ள் (ஒருமை பெண்)
      - -ர் (ஒருமை மரியாதை)
      - -னர் / -னார் (பன்மை)
      - -ளர் / -ளார் (பன்மை)
      - -ார்கள் (பன்மை)
      - -ன (பன்மை பெயர்ச்சொல் - "நிகழ்வுகள் நடந்தன")
   
   b) சரியாக சோதிக்க வேண்டிய வார்த்தைகள்:
      - "உறுதிப்படுத்தியுள்ளன" vs "உறுதிப்படுத்தியுள்ளனர்"
        * பன்மை பெயர் (நிகழ்வுகள், விடயங்கள்) → "உள்ளன" (சரி)
        * பன்மை நபர் (மக்கள், அவர்கள்) → "உள்ளனர்" (தேவை)
      
      - "சொன்னான்" vs "சொன்னனர்" / "சொன்னார்கள்"
      - "வந்தான்" vs "வந்தனர்" / "வந்தார்கள்"

5. காலம் ஒத்துழைப்பு (Tense Consistency):
   
   ❌ "குரல் கொடுத்தாலும்" (இறந்த கால சூழலில்) 
   → ✅ "குரல் கொடுத்திருந்தாலும்" (முற்றுப்பெற்ற காலம் தேவை)
   
   ❌ "அவன் வந்தான், இப்போது செல்கிறான்" (கால குதிப்பு)
   → ✅ "அவன் வந்தான், பிறகு சென்றான்" (ஒத்த இறந்த காலம்)

6. வேற்றுமை உருபுகள் (Case Markers):
   
   இவற்றின் சரியான பயன்பாட்டை சோதிக்கவும்:
   - -க்கு (dative): "அவனுக்கு கொடு"
   - -ஐ (accusative): "அவளை பார்"
   - -இல் / -இலே (locative): "வீட்டில் இருக்கிறான்"
   - -உடன் (sociative): "அவனுடன் வா"
   - -ஆல் / -ஆலே (instrumental): "கத்தியால் வெட்டு"

════════════════════════════════════════════════════════
ஈ. ஒலியியல் மாற்றங்கள் (வல்லினம், மெல்லினம், இடையினம்)
════════════════════════════════════════════════════════

வல்லினம் (கடின மெய்): க், ச், ட், த், ப், ற்
மெல்லினம் (மென் மெய்): ங், ஞ், ண், ந், ம், ன்
இடையினம் (இடை மெய்): ய், ர், ல், வ், ழ், ள்

7. வல்லினம் மிகுதல் (Consonant Doubling - மிக முக்கியம்!):
   
   ⚠️ இது அடிக்கடி தவறவிடப்படுகிறது! கவனமாக சோதிக்கவும்!
   
   சில சொற்கள் முடியும்போது, அடுத்த வல்லினம் இரட்டிக்கும்:
   
   a) -இ முடியும் சொற்கள்:
      ❌ "இடதுசாரி கட்சிகள்" → ✅ "இடதுசாரிக் கட்சிகள்" (க → க்)
      ❌ "அது போன்ற" → ✅ "அதுபோன்ற" அல்லது "அதுப் போன்ற" (ப → ப்)
      ❌ "தொழில் துறை" → ✅ "தொழில்துறை" அல்லது "தொழிற் றுறை" (த → த்)
   
   b) பொதுவான உதாரணங்கள்:
      - சாரி + கட்சி → சாரிக் கட்சி
      - அது + போன்ற → அதுப் போன்ற
      - ஒரு + கருத்து → ஒருகருத்து (மாற்றம் இல்லை சில நேரம்)
   
   c) எப்போது தேவை இல்லை:
      - மெல்லினம் அல்லது இடையினம் பின் வரும்போது
      - உயிர் எழுத்து பின் வரும்போது

8. எண்களுக்குப் பின் வல்லினம் மிகுதல்:
   ❌ "பத்து பேர்" → ✅ "பத்துப் பேர்" (ப் சேர்க்க வேண்டும்)
   ❌ "ஐந்து தமிழர்கள்" → ✅ "ஐந்துத் தமிழர்கள்" (த் சேர்க்க வேண்டும்)

9. பன்மையில் தவறான நாசி:
   - சரி: "மரங்கள்" (ங் + கள்)
   - தவறு: "மரன்கள்" (ன் தவறு)

════════════════════════════════════════════════════════
உ. புணர்ச்சி பிழைகள்
════════════════════════════════════════════════════════

⚠️ முக்கியம்: இரண்டு வடிவமும் சரி:
✅ "வரலாற்றுச் சிறப்பு" (புணர்ச்சியுடன்) - சரி
✅ "வரலாற்று சிறப்பு" (புணர்ச்சி இல்லாமல்) - சரியே

இவற்றுக்கு இடையே மாற்ற பரிந்துரைக்க வேண்டாம்!

10. சரிசெய்ய வேண்டிய புணர்ச்சி பிழைகள்:
    
    a) தேவையற்ற இணைப்புக்குறி:
       ❌ "பாஜக-வுடன்" → ✅ "பாஜகவுடன்" (இணைப்புக்குறி நீக்கவும்)
       ❌ "திமுக-விலேயே" → ✅ "திமுகவிலேயே" (இணைப்புக்குறி நீக்கவும்)
    
    b) தவறான சொல் இணைப்பு (இடைவெளி தேவை):
       ❌ "அவள்அழகானவள்" → ✅ "அவள் அழகானவள்"

════════════════════════════════════════════════════════
ஊ. இடைவெளி பிழைகள்
════════════════════════════════════════════════════════

11. முதலெழுத்துகளுக்குப் பின் இடைவெளி:
    ❌ "மு.க.ஸ்டாலின்" → ✅ "மு.க. ஸ்டாலின்"
    ❌ "டி.டி.வி.தினகரன்" → ✅ "டி.டி.வி. தினகரன்"
    ❌ "அ.தி.மு.க" → ✅ "அ.தி.மு.க."
    
    விதி: "X.Y.Z. முதல்பெயர்" வடிவம்

12. இணைப்புக்குறி இடைவெளி:
    ❌ "அதிமுக - பாஜக" → ✅ "அதிமுக-பாஜக" (இடைவெளி வேண்டாம்)
    ❌ "23 ஆம்" → ✅ "23-ஆம்" (இணைப்புக்குறி + இடைவெளி இல்லாமல்)

13. தவறாக இணைக்கப்பட்ட சொற்கள்:
    ❌ "அவன்வந்தான்" → ✅ "அவன் வந்தான்"

14. தவறாக பிரிக்கப்பட்ட சொற்கள்:
    ❌ "அழகா ன" → ✅ "அழகான"

════════════════════════════════════════════════════════
எ. நிறுத்தக்குறிகள்
════════════════════════════════════════════════════════

15. இவற்றை சோதிக்கவும்:
    - காற்புள்ளி (,) - குழப்பம் ஏற்படுமானால் மட்டும்
    - முற்றுப்புள்ளி (.) - தெளிவற்ற முடிவுக்கு
    - கேள்விக்குறி (?) - கேள்விகளுக்கு
    
    ⚠️ "நல்ல ஓட்டத்துக்காக" காற்புள்ளி சேர்க்க வேண்டாம் - இலக்கண பிழை மட்டும்

════════════════════════════════════════════════════════
ஏ. பாதுகாக்க வேண்டியவை (மாற்ற வேண்டாம்)
════════════════════════════════════════════════════════

16. இவற்றை அப்படியே வைக்கவும்:
    - சொந்த பெயர்கள் (நபர், இடம், கட்சி, நிறுவனம், பிராண்ட்)
    - ஆங்கில சொற்கள், சுருக்கங்கள், எண்கள்
    - பத்தி அமைப்பு

════════════════════════════════════════════════════════
ஐ. பிழையாக குறிப்பிட வேண்டாதவை
════════════════════════════════════════════════════════

❌ இவை பிழை அல்ல:
1. நடை விருப்பங்கள் (முறையான vs முறைசாரா)
2. புணர்ச்சி மாற்றுகள் ("வரலாற்றுச் சிறப்பு" vs "வரலாற்று சிறப்பு")
3. சொல் வரிசை மாற்றங்கள் (தமிழில் சுதந்திர வரிசை)
4. பிராந்திய மாற்றுகள்
5. ஆங்கில சொற்கள் அடைப்புக்குறிக்குள் அல்லது உரையில் - இவை பிழை அல்ல, பாதுகாக்க வேண்டும்

════════════════════════════════════════════════════════
ஒ. வெளியீட்டு வடிவம் (கட்டாயம் JSON மட்டும்)
════════════════════════════════════════════════════════

சரியான JSON மட்டும் திருப்பவும். markdown, code fences, அல்லது கூடுதல் உரை வேண்டாம்.

{
  "corrections": [
    {
      "original": "உள்ளீட்டு உரையில் இருந்து துல்லியமான பிழை உரை",
      "corrected": "சரிசெய்யப்பட்ட பதிப்பு",
      "reason": "தமிழில் குறுகிய விளக்கம் (10-15 சொற்கள்)",
      "type": "spelling|grammar|phonetic|punctuation|space|sandhi|case",
      "start_index": 0,
      "end_index": 0
    }
  ],
  "corrected_text": ""
}

பரிந்துரை வகைகள்:
- "spelling" - எழுத்துப்பிழை
- "grammar" - இலக்கண பிழை (வினை-எண், காலம், வேற்றுமை)
- "phonetic" - வல்லினம் மிகுதல் / ஒலியியல் பிழை
- "case" - வேற்றுமை உருபு பிழை
- "punctuation" - நிறுத்தக்குறி பிழை
- "space" - இடைவெளி பிழை
- "sandhi" - புணர்ச்சி பிழை

⚠️ முக்கிய வெளியீட்டு விதிகள்:
✅ கண்டறியும் அனைத்து பிழைகளையும் திருப்பவும் - எண்ணிக்கை வரம்பு இல்லை
✅ ஒவ்வொரு "original" உம் உள்ளீட்டு உரையில் இருந்து துல்லியமான substring ஆக இருக்க வேண்டும்
✅ உண்மையான பிழைகள் மட்டும் - நடை பரிந்துரைகள் வேண்டாம்
✅ "reason" குறுகியதாக வைக்கவும் (10-15 தமிழ் சொற்கள்)
✅ corrected_text = "" (வெற்று) - corrections array மட்டும் தேவை
✅ பிழை இல்லை என்றால்: {"corrections":[],"corrected_text":""}
✅ 20 பிழைகள் இருந்தால், 20 corrections எல்லாம் திருப்பவும்

════════════════════════════════════════════════════════
ஓ. உதாரணங்கள்: எதை பிடிக்கவும் vs எதை தவிர்க்கவும்
════════════════════════════════════════════════════════

✅ இவற்றை பிடிக்கவும் (உண்மையான பிழைகள்):

1. முதலெழுத்துகள் இடைவெளி:
   ❌ "மு.க.ஸ்டாலின்" → ✅ "மு.க. ஸ்டாலின்"
   type: "space", reason: "முதலெழுத்துகளுக்குப் பின் இடைவெளி தேவை"

2. இணைப்புக்குறி இடைவெளி:
   ❌ "அதிமுக - பாஜக" → ✅ "அதிமுக-பாஜக"
   type: "space", reason: "இணைப்புக்குறியைச் சுற்றி இடைவெளி வேண்டாம்"

3. தேவையற்ற இணைப்புக்குறி:
   ❌ "பாஜக-வுடன்" → ✅ "பாஜகவுடன்"
   type: "sandhi", reason: "புணர்ச்சியில் இணைப்புக்குறி தேவையில்லை"

4. வல்லினம் மிகுதல்:
   ❌ "இடதுசாரி கட்சிகள்" → ✅ "இடதுசாரிக் கட்சிகள்"
   type: "phonetic", reason: "வல்லினம் மிகுதல் - க் தேவை"

5. காலம் ஒத்துழைப்பு:
   ❌ "குரல் கொடுத்தாலும்" → ✅ "குரல் கொடுத்திருந்தாலும்"
   type: "grammar", reason: "இறந்தகால சூழலுக்கு முற்றுப்பெற்ற காலம் தேவை"

6. வினை-எண் பொருந்தல்:
   ❌ "அவர்கள் வந்தான்" → ✅ "அவர்கள் வந்தார்கள்"
   type: "grammar", reason: "பன்மை எண்ணுடன் வினை பொருந்தவில்லை"

7. வினை-எண் (பன்மை நபர்):
   ❌ "நிகழ்வுகள் உறுதிப்படுத்தியுள்ளனர்" → ✅ "நிகழ்வுகள் உறுதிப்படுத்தியுள்ளன"
   type: "grammar", reason: "பன்மை பெயர்ச்சொல்லுக்கு -ன முடிவு சரி"

8. வேற்றுமை உருபு:
   ❌ "அவன் கொடு" → ✅ "அவனுக்கு கொடு"
   type: "case", reason: "வேற்றுமை உருபு -க்கு தேவை"

❌ இவற்றை பிழையாக குறிப்பிட வேண்டாம்:

1. நடை விருப்பம்:
   "திமுக கூட்டணி வலுவாக உள்ளது" - பிழை இல்லை!

2. விரும்பத்தக்க புணர்ச்சி:
   "வரலாற்றுச் சிறப்பு" vs "வரலாற்று சிறப்பு" - இரண்டும் சரி!

3. முறையான vs முறைசாரா:
   தொடர்ந்து "சொன்னார்" என்று இருந்தால், "தெரிவித்தார்" பரிந்துரைக்க வேண்டாம்

உள்ளீட்டு உரை:
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
        
        // DEBUG: Log first 200 chars of user text
        textPreview := userText
        if len(textPreview) > 200 {
                textPreview = textPreview[:200] + "..."
        }
        log.Printf("[GEMINI-DEBUG] User text preview: %q", textPreview)

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
