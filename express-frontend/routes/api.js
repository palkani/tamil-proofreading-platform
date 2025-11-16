const express = require('express');
const router = express.Router();
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080/api/v1';

// Proxy to Gemini AI integration
router.post('/gemini/analyze', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Use Replit AI Integrations for Gemini
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    
    if (!apiKey || !baseUrl) {
      return res.status(500).json({ error: 'Gemini AI not configured' });
    }

    const response = await axios.post(
      `${baseUrl}/models/gemini-2.5-flash:generateContent`,
      {
        contents: [{
          role: "user",
          parts: [{
            text: `You are a strict Tamil language expert. Analyze Tamil text for grammar errors, misspellings, and invalid word forms. Be VERY STRICT - flag any word that seems incorrect or unusual.

CRITICAL: Flag words that are missing proper endings or have incorrect inflections.

Common Tamil Grammar Issues to Check:
1. Missing puḷḷi (புள்ளி) at word endings - e.g., "அளியுங்கள" should be "அளியுங்கள்" or better yet "கொடுங்கள்"
2. Incorrect verb conjugations
3. Wrong honorific forms
4. Spelling variations and mistakes

SPECIFIC EXAMPLES OF ERRORS YOU MUST FLAG:
- "அளியுங்கள" → Suggest: "கொடுங்கள்" or "தாருங்கள்" or "அளியுங்கள்" (Reason: Missing final character or uncommon form)
- "வாங்க" → Suggest: "வாருங்கள்" (Reason: Too informal, use respectful form)
- "பன்ன" → Suggest: "செய்ய" (Reason: Colloquial, use proper form)

Text to analyze:
${text}

Check EACH WORD carefully. If a word looks unusual, missing proper endings, or grammatically questionable, FLAG IT.

**IMPORTANT: Provide all "title" and "description" fields in TAMIL language, not English.**

Return valid JSON array (no markdown):
[
  {
    "id": "err-1",
    "type": "grammar",
    "title": "தமிழில் பிழையின் தலைப்பு",
    "description": "தமிழில் பிழையின் விரிவான விளக்கம்",
    "original": "the error word",
    "suggestion": "correct word",
    "position": {"start": 0, "end": 5}
  }
]

Example for "அளியுங்கள":
{
  "id": "err-1",
  "type": "grammar",
  "title": "தவறான வினை முற்று வடிவம்",
  "description": "'அளியுங்கள' என்ற சொல் தவறான கட்டளை வடிவம். இதில் இறுதி எழுத்தில் புள்ளி (ள்) இல்லை அல்லது தவறான முடிவு உள்ளது. மரியாதையான கட்டளை வடிவம் 'அளியுங்கள்' ஆக இருக்க வேண்டும். 'கொடுங்கள்' அல்லது 'தாருங்கள்' என்பவை மிகவும் இயல்பான மாற்று வார்த்தைகள்.",
  "original": "அளியுங்கள",
  "suggestion": "கொடுங்கள்",
  "position": {"start": 33, "end": 42}
}

If genuinely NO errors: []

BE STRICT - flag anything questionable. ALWAYS write title and description in TAMIL.`
          }]
        }],
        generationConfig: {
          temperature: 0.05,
          maxOutputTokens: 2048
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        }
      }
    );

    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    let suggestions = [];
    try {
      const cleaned = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      suggestions = JSON.parse(cleaned);
      
      if (!Array.isArray(suggestions)) {
        suggestions = [];
      }
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', parseErr);
      suggestions = [];
    }

    res.json({ suggestions });
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to analyze text',
      details: error.response?.data || error.message
    });
  }
});

// Proxy other API calls to Go backend
router.all('/*', async (req, res) => {
  try {
    const backendPath = req.path.replace(/^\//, '');
    const url = `${BACKEND_URL}/${backendPath}`;
    
    const config = {
      method: req.method,
      url: url,
      headers: {
        ...req.headers,
        host: undefined, // Remove host header
      },
      params: req.query,
      data: req.body,
    };

    const response = await axios(config);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Backend proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'Backend request failed'
    });
  }
});

module.exports = router;
