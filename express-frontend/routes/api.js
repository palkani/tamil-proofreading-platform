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

// Google OAuth callback handler - MUST come before wildcard route!
router.get('/v1/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  console.log('=====================================');
  console.log('[EXPRESS-OAUTH-CALLBACK] HANDLER TRIGGERED');
  console.log('[EXPRESS-OAUTH-CALLBACK] Full URL:', req.originalUrl);
  console.log('[EXPRESS-OAUTH-CALLBACK] Code received:', code ? 'YES' : 'NO');
  console.log('[EXPRESS-OAUTH-CALLBACK] Error:', error || 'NONE');
  console.log('=====================================');
  
  if (error) {
    console.error('[EXPRESS-OAUTH-CALLBACK] Error from Google:', error);
    return res.redirect(`/login?error=${encodeURIComponent(error)}`);
  }
  
  if (!code) {
    console.error('[EXPRESS-OAUTH-CALLBACK] No authorization code received');
    return res.redirect('/login?error=Missing authorization code');
  }
  
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // CRITICAL: When behind a proxy (Firebase → Cloud Run), use X-Forwarded headers
    // X-Forwarded-Host: the original domain user accessed (e.g., prooftamil.com)
    // Host: the internal Cloud Run service domain (e.g., prooftamil-frontend-xxx.run.app)
    
    // Get original hostname from proxy headers or fall back to Host header
    const xForwardedHost = req.get('x-forwarded-host');
    const xForwardedProto = req.get('x-forwarded-proto') || 'https';
    const hostname = xForwardedHost || req.get('host');
    const protocol = xForwardedProto === 'http' ? 'http' : 'https';
    
    // Always use hardcoded production URI when we detect production environment
    const isProduction = hostname && (hostname.includes('prooftamil.com') || hostname.includes('run.app'));
    const redirectUri = isProduction
      ? 'https://prooftamil.com/api/v1/auth/google/callback'
      : `${protocol}://${hostname}/api/v1/auth/google/callback`;
    
    console.log('[EXPRESS-OAUTH-CALLBACK] Config loaded');
    console.log('[EXPRESS-OAUTH-CALLBACK] X-Forwarded-Host:', xForwardedHost);
    console.log('[EXPRESS-OAUTH-CALLBACK] Host header:', req.get('host'));
    console.log('[EXPRESS-OAUTH-CALLBACK] X-Forwarded-Proto:', xForwardedProto);
    console.log('[EXPRESS-OAUTH-CALLBACK] Is Production:', isProduction);
    console.log('[EXPRESS-OAUTH-CALLBACK] Redirect URI:', redirectUri);
    console.log('[EXPRESS-OAUTH-CALLBACK] Client ID available:', !!clientId);
    console.log('[EXPRESS-OAUTH-CALLBACK] Client Secret available:', !!clientSecret);
    
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth not configured');
    }
    
    console.log('[EXPRESS-OAUTH-CALLBACK] Exchanging code for token...');
    
    // Exchange authorization code for ID token
    console.log('[EXPRESS-OAUTH-CALLBACK] Posting to Google token endpoint...');
    console.log('[EXPRESS-OAUTH-CALLBACK] Request body keys: client_id, client_secret, code, grant_type, redirect_uri');
    console.log('[EXPRESS-OAUTH-CALLBACK] Redirect URI in request:', redirectUri);
    
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });
    
    console.log('[EXPRESS-OAUTH-CALLBACK] Token response received');
    console.log('[EXPRESS-OAUTH-CALLBACK] Response status:', tokenResponse.status);
    
    const idToken = tokenResponse.data.id_token;
    if (!idToken) {
      console.error('[EXPRESS-OAUTH-CALLBACK] No ID token in response:', tokenResponse.data);
      throw new Error('No ID token in response');
    }
    
    console.log('[EXPRESS-OAUTH-CALLBACK] ID Token received successfully');
    
    // Send ID token to backend for verification
    console.log('[EXPRESS-OAUTH-CALLBACK] Verifying token with backend...');
    const backendUrl = getBackendApiUrl();
    const authResponse = await axios.post(`${backendUrl}/auth/social`, {
      provider: 'google',
      token: idToken
    });
    
    console.log('[EXPRESS-OAUTH-CALLBACK] Backend response received');
    
    if (!authResponse.data.user) {
      throw new Error('No user data in backend response');
    }
    
    const user = authResponse.data.user;
    console.log('[EXPRESS-OAUTH-CALLBACK] Backend authentication successful:', user.email);
    
    // Create session - set user data
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user'
    };
    
    console.log('[EXPRESS-OAUTH-CALLBACK] Session object created:', JSON.stringify(req.session.user));
    console.log('[EXPRESS-OAUTH-CALLBACK] Session ID:', req.sessionID);
    
    // CRITICAL FIX: Manually set the session cookie since express-session's automatic mechanism
    // doesn't work properly behind the Firebase proxy. This ensures the browser receives the
    // session cookie and can maintain the session across instances via PostgreSQL store.
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
    
    // Add secure flag only in production to allow HTTPS enforcement
    const isSecureConnection = req.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production';
    if (isSecureConnection) {
      cookieOptions.secure = true;
    }
    
    // Set the session cookie explicitly
    res.cookie('connect.sid', req.sessionID, cookieOptions);
    
    console.log('[EXPRESS-OAUTH-CALLBACK] Session cookie set manually:');
    console.log('[EXPRESS-OAUTH-CALLBACK] - Cookie name: connect.sid');
    console.log('[EXPRESS-OAUTH-CALLBACK] - Cookie value:', req.sessionID);
    console.log('[EXPRESS-OAUTH-CALLBACK] - Cookie options:', JSON.stringify(cookieOptions));
    console.log('[EXPRESS-OAUTH-CALLBACK] - Is Secure Connection:', isSecureConnection);
    
    // Save session to database and redirect
    req.session.save((err) => {
      if (err) {
        console.error('[EXPRESS-OAUTH-CALLBACK] Session save error:', err);
        return res.redirect(`/login?error=${encodeURIComponent('Session creation failed')}`);
      }
      
      console.log('[EXPRESS-OAUTH-CALLBACK] Session saved to database successfully');
      console.log('[EXPRESS-OAUTH-CALLBACK] Redirecting to /dashboard...');
      res.redirect('/dashboard');
    });
    
  } catch (error) {
    console.error('=====================================');
    console.error('[EXPRESS-OAUTH-CALLBACK] ERROR OCCURRED');
    console.error('[EXPRESS-OAUTH-CALLBACK] Error message:', error.message);
    console.error('[EXPRESS-OAUTH-CALLBACK] Error type:', error.code);
    if (error.response?.data) {
      console.error('[EXPRESS-OAUTH-CALLBACK] Response data:', JSON.stringify(error.response.data));
    }
    if (error.response?.status) {
      console.error('[EXPRESS-OAUTH-CALLBACK] Status code:', error.response.status);
    }
    console.error('[EXPRESS-OAUTH-CALLBACK] Stack:', error.stack);
    console.error('=====================================');
    
    const errorMessage = error.response?.data?.error || error.message || 'Authentication failed';
    res.redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
  }
});

// Proxy other API calls to Go backend
router.all('/*', async (req, res) => {
  try {
    // req.path includes the leading slash, construct full URL
    // BACKEND_URL is http://localhost:8080/api/v1, req.path is /auth/register
    const url = `${BACKEND_URL}${req.path}`;
    
    console.log(`[PROXY] ${req.method} ${req.path} -> ${url}`);
    
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
    console.error(`[PROXY-ERROR] ${error.message}`);
    console.error('[PROXY-ERROR] Response data:', error.response?.data);
    console.error('[PROXY-ERROR] Status:', error.response?.status);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'Backend request failed'
    });
  }
});

module.exports = router;
