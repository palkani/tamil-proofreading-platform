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
            text: `You are a Tamil language expert. Analyze the following Tamil text for grammar, spelling, style, and clarity issues. Return a JSON array of suggestions.

Tamil text to analyze:
${text}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
[
  {
    "id": "unique-id",
    "type": "grammar|spelling|style|clarity",
    "title": "Brief issue title",
    "description": "Detailed explanation",
    "original": "original text segment",
    "suggestion": "corrected text",
    "position": {"start": 0, "end": 10}
  }
]

If no issues found, return: []`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
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
