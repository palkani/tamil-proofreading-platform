const express = require('express');
const router = express.Router();
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080/api/v1';

// Helper function to split text into manageable chunks for better accuracy
function splitIntoSentences(text) {
  // Split by common Tamil and English sentence delimiters
  const sentences = text.split(/([.!?।]\s*)/g);
  const chunks = [];
  let current = '';
  let globalOffset = 0;
  
  for (const part of sentences) {
    if (current.length + part.length <= 120) {
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
    const allSuggestions = [];
    
    for (const chunk of chunks) {
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
            maxOutputTokens: 2048,
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
          }
        }
      );

      const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      
      try {
        const chunkSuggestions = JSON.parse(aiText);
        
        if (Array.isArray(chunkSuggestions)) {
          // Adjust offsets to global text positions
          chunkSuggestions.forEach(sugg => {
            if (sugg.position) {
              sugg.position.start += chunk.offset;
              sugg.position.end += chunk.offset;
            }
            sugg.id = `${sugg.id}-chunk${chunk.offset}`;
            allSuggestions.push(sugg);
          });
        }
      } catch (parseErr) {
        console.error('Failed to parse chunk response:', aiText, parseErr);
      }
    }

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
