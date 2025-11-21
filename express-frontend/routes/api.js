const express = require('express');
const router = express.Router();
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080/api/v1';

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

// Proxy other API calls to Go backend
router.all('/*', async (req, res) => {
  try {
    // req.path includes the leading slash, so /v1/submit becomes just v1/submit
    const backendPath = req.path.replace(/^\/v1\//, ''); // Remove /v1/ prefix
    const url = `${BACKEND_URL}/${backendPath}`;
    
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
