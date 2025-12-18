const express = require('express');
const router = express.Router();
const axios = require('axios');

// Construct backend API URL - handle both cases:
// 1. BACKEND_URL = http://localhost:8080/api/v1 (dev)
// 2. BACKEND_URL = https://prooftamil-backend-xxx.run.app (prod - needs /api/v1)
function getBackendApiUrl() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  if (baseUrl.endsWith('/api/v1')) {
    return baseUrl;
  }
  return baseUrl.replace(/\/$/, '') + '/api/v1';
}

const BACKEND_URL = getBackendApiUrl();
const ENABLE_PROXY_LOGS = process.env.PROXY_LOG !== 'false';

// Helper function to split text into manageable chunks for better accuracy
// Optimized: Increased chunk size from 120 to 200 chars to reduce API calls
function splitIntoSentences(text) {
  // Split by common Tamil and English sentence delimiters
  const sentences = text.split(/([.!?।]\s*)/g);
  const chunks = [];
  let current = '';
  let globalOffset = 0;
  
  for (const part of sentences) {
    if (current.length + part.length <= 200) {
      current += part;
    } else {
      if (current.trim()) {
        chunks.push({ text: current.trim(), offset: globalOffset });
        globalOffset += current.length;
      }
      current = part;
    }
  }
  
  if (current.trim()) {
    chunks.push({ text: current.trim(), offset: globalOffset });
  }
  
  // If no chunks created (no delimiters), return the whole text
  return chunks.length > 0 ? chunks : [{ text: text.trim(), offset: 0 }];
}

// Proxy to Gemini AI integration with improved accuracy via chunking
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

    // Split into chunks to improve detection accuracy
    const chunks = splitIntoSentences(text);
    
    // OPTIMIZATION: Process all chunks in parallel for 3-5x speed improvement
    const chunkPromises = chunks.map(async (chunk) => {
      try {
        const response = await axios.post(
          `${baseUrl}/models/gemini-2.5-flash:generateContent`,
          {
            systemInstruction: {
              parts: [{
                text: `You are a strict Tamil language expert. Analyze Tamil text for grammar errors, misspellings, and invalid word forms.

CRITICAL TAMIL GRAMMAR RULES:
1. Missing puḷḷi (புள்ளி) at word endings - "அளியுங்கள" → "கொடுங்கள்" or "அளியுங்கள்"
2. Incorrect sandhi (புணர்ச்சி) - "பதிவபுதுப்பித்தல்" → "பதிவுப் புதுப்பித்தல்"
3. Wrong verb conjugations and honorific forms
4. Spelling errors and colloquial forms

EXAMPLES YOU MUST FLAG:
- "அளியுங்கள" → "கொடுங்கள்" (missing புள்ளி or informal)
- "பதிவபுதுப்பித்தல்" → "பதிவுப் புதுப்பித்தல்" (wrong sandhi)
- "வாங்க" → "வாருங்கள்" (too informal)

BE VERY STRICT. Flag ANY questionable word.
Provide title and description in TAMIL language only.`
              }]
            },
            contents: [{
              role: "user",
              parts: [{
                text: `Analyze this Tamil text word-by-word and flag ALL grammar errors:\n\n${chunk.text}`
              }]
            }],
            generationConfig: {
              temperature: 0,
              topP: 0.1,
              maxOutputTokens: 1024,
              responseMimeType: "application/json",
              responseSchema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    type: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    original: { type: "string" },
                    suggestion: { type: "string" },
                    position: {
                      type: "object",
                      properties: {
                        start: { type: "integer" },
                        end: { type: "integer" }
                      }
                    }
                  },
                  required: ["id", "type", "title", "description", "original", "suggestion"]
                }
              }
            }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            timeout: 10000 // 10 second timeout for faster failure detection
          }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        
        // Clean and validate JSON before parsing
        let cleanedJson = aiText.trim();
        
        // If response is truncated or malformed, try to fix it
        if (!cleanedJson.endsWith(']')) {
          // Find the last complete object
          const lastCompleteObject = cleanedJson.lastIndexOf('}');
          if (lastCompleteObject > 0) {
            cleanedJson = cleanedJson.substring(0, lastCompleteObject + 1) + ']';
          } else {
            cleanedJson = '[]';
          }
        }
        
        const chunkSuggestions = JSON.parse(cleanedJson);
        
        if (Array.isArray(chunkSuggestions)) {
          // Adjust offsets to global text positions
          return chunkSuggestions.map(sugg => {
            if (sugg.position) {
              sugg.position.start += chunk.offset;
              sugg.position.end += chunk.offset;
            }
            sugg.id = `${sugg.id}-chunk${chunk.offset}`;
            return sugg;
          });
        }
        return [];
      } catch (parseErr) {
        console.error('Failed to process chunk, skipping:', parseErr.message);
        return []; // Return empty array instead of failing
      }
    });

    // Wait for all chunks to complete in parallel
    const allChunkResults = await Promise.all(chunkPromises);
    const allSuggestions = allChunkResults.flat();

    res.json({ suggestions: allSuggestions });
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to analyze text',
      details: error.response?.data || error.message
    });
  }
});

// English to Tamil Translation with Gemini AI
// This endpoint translates English text to Tamil and provides grammar corrections
router.post('/gemini/translate', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini AI not configured - API key missing' });
    }

    console.log('[TRANSLATE] Translating English to Tamil:', text.substring(0, 50) + '...');

    const response = await axios.post(
      `${baseUrl}/models/gemini-2.5-flash:generateContent`,
      {
        systemInstruction: {
          parts: [{
            text: `You are an expert English to Tamil translator. Translate the given English text to proper, grammatically correct Tamil.

TRANSLATION RULES:
1. Use formal, literary Tamil (செந்தமிழ்) when appropriate
2. Preserve the meaning and tone of the original text
3. Use proper Tamil grammar and sentence structure
4. For technical terms, provide the Tamil equivalent if available
5. Maintain paragraph structure

OUTPUT FORMAT (MANDATORY JSON):
{
  "translated_text": "The complete Tamil translation",
  "suggestions": [
    {
      "original": "original English phrase",
      "translated": "Tamil translation",
      "alternative": "alternative Tamil phrasing (optional)",
      "note": "explanation in Tamil about the translation choice"
    }
  ]
}

RULES:
- ALWAYS respond with valid JSON only
- Include key phrase translations in suggestions array
- Provide alternatives for important translations`
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: `Translate this English text to Tamil:\n\n${text}`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        timeout: 30000
      }
    );

    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    let result;
    try {
      result = JSON.parse(aiText.trim());
    } catch (parseErr) {
      console.error('[TRANSLATE] JSON parse error:', parseErr.message);
      result = { translated_text: aiText, suggestions: [] };
    }

    console.log('[TRANSLATE] Translation complete:', result.translated_text?.substring(0, 50) + '...');

    res.json({
      success: true,
      original_text: text,
      translated_text: result.translated_text || '',
      suggestions: result.suggestions || [],
      model_used: 'gemini-2.5-flash'
    });

  } catch (error) {
    console.error('[TRANSLATE] Error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to translate text',
      details: error.response?.data || error.message
    });
  }
});

// Transliteration endpoint - proxies to Go backend
router.post('/transliterate', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const url = `${BACKEND_URL}/transliterate`;
    console.log(`[TRANSLITERATE] POST ${url} with text: ${text}`);
    
    const response = await axios.post(url, { text });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`[TRANSLITERATE-ERROR] ${error.message}`);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'Transliteration failed'
    });
  }
});

// Google OAuth callback proxy: frontend callback terminates here, then proxied to backend
router.get('/v1/auth/google/callback', async (req, res) => {
  try {
    const target = `${BACKEND_URL}/auth/google/callback`;
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;
    delete forwardHeaders.connection;
    delete forwardHeaders['content-length'];
    forwardHeaders['x-oauth-handoff'] = 'json';

    console.log('[OAUTH-HANDOFF] callback handled on frontend host=', req.hostname);
    console.log('[OAUTH-PROXY] forwarding to:', target);

    const response = await axios({
      method: 'get',
      url: target,
      params: req.query,
      headers: forwardHeaders,
      withCredentials: true,
      validateStatus: () => true,
    });

    // If backend returned JSON handoff
    const contentType = response.headers['content-type'] || '';
    if (response.status === 200 && contentType.includes('application/json') && response.data?.access_token) {
      // Set cookie on frontend domain
      const cookie = [
        `access_token=${response.data.access_token}`,
        'Path=/',
        'Secure',
        'SameSite=Lax',
        'Domain=.prooftamil.com',
        'HttpOnly'
      ].join('; ');
      res.setHeader('Set-Cookie', cookie);
      console.log('[OAUTH-HANDOFF] set-cookie for prooftamil.com');
      console.log('[OAUTH-HANDOFF] redirecting to /workspace');
      return res.redirect(response.data.redirect || '/workspace');
    }

    // fallback: forward cookies and location
    const setCookie = response.headers['set-cookie'];
    if (setCookie) res.setHeader('set-cookie', setCookie);
    if (response.headers.location) res.setHeader('location', response.headers.location);

    res.status(response.status);
    if (response.status >= 300 && response.status < 400) {
      return res.end();
    }
    return res.send(response.data);
  } catch (error) {
    console.error('[OAUTH-PROXY] error', error?.message);
    res.redirect('/login?error=google_oauth_failed');
  }
});

// Proxy other API calls to Go backend
router.all('/*', async (req, res) => {
  try {
    // Normalize path to avoid double /v1 when BACKEND_URL already has /api/v1
    // Example: BACKEND_URL=/api/v1 and req.path=/v1/auth/register -> strip leading /v1
    let normalizedPath = req.path;
    if (BACKEND_URL.endsWith('/api/v1') && normalizedPath.startsWith('/v1/')) {
      normalizedPath = normalizedPath.replace(/^\/v1/, '');
    }

    const url = `${BACKEND_URL}${normalizedPath}`;
    
    // Debug logging for auth passthrough
    console.log('[PROXY] incoming authorization:', req.headers.authorization);
    if (ENABLE_PROXY_LOGS) {
      console.log(`[PROXY] ${req.method} ${req.path} -> ${url}`);
    }

    // Forward all incoming headers as-is (incl. Authorization/cookies), but strip host to avoid upstream conflicts
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;
    delete forwardHeaders.connection; // not needed upstream
    delete forwardHeaders['content-length']; // let axios set correct length

    const config = {
      method: req.method,
      url,
      headers: forwardHeaders,
      params: req.query,
      data: req.body,
      validateStatus: () => true,
    };

    const response = await axios(config);
    res.status(response.status).send(response.data);
  } catch (error) {
    console.error(`[PROXY-ERROR] ${error.message}`);
    console.error('[PROXY-ERROR] Response data:', error.response?.data);
    console.error('[PROXY-ERROR] Status:', error.response?.status);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'Backend request failed'
    });
  }
});

module.exports = router;
