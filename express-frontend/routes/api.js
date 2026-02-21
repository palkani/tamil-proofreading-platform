const express = require('express');
const router = express.Router();
const axios = require('axios');
const http = require('http');
const https = require('https');
const multer = require('multer');
const FormData = require('form-data');
const crypto = require('crypto');

// Shared Gemini key rotator for multi-key support
const { keyRotator } = require('../utils/gemini-key-rotator');

// Latency-based regional backend resolver (Asia vs US Cloud Run instances)
const { getRegionalBackendUrl } = require('../utils/regional-backend');

// SEO automation service
const seoAutomation = require('../services/seo-automation');

// HTTP Agent pooling for high concurrency (1000+ users)
// This reuses TCP connections instead of creating new ones per request
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,    // 30 seconds keep-alive
  maxSockets: 100,          // Max concurrent sockets per host
  maxFreeSockets: 50,       // Max idle sockets to keep in pool
  timeout: 60000,           // 60 second socket timeout
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 100,
  maxFreeSockets: 50,
  timeout: 60000,
});

// Create axios instance with connection pooling
const axiosWithPool = axios.create({
  httpAgent: httpAgent,
  httpsAgent: httpsAgent,
  timeout: 60000,           // Default 60 second timeout
  maxRedirects: 5,
});

// ---------------------------------------------------------------------------
// Per-request backend URL (latency-based regional routing)
// ---------------------------------------------------------------------------
// Stamp req._backendUrl once at the router boundary so every handler below
// automatically uses the geographically closest Cloud Run instance without
// any per-handler changes needed.
router.use((req, res, next) => {
  req._backendUrl = getRegionalBackendUrl(req);
  next();
});

// Kept for module-level code that runs before a request is available.
function getBackendApiUrl() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  if (baseUrl.endsWith('/api/v1')) return baseUrl;
  return baseUrl.replace(/\/$/, '') + '/api/v1';
}
const BACKEND_URL = getBackendApiUrl(); // fallback — handlers use req._backendUrl

// Returns the corrections proxy base URL for a specific request.
// Uses req._backendUrl (regional) and falls back to the transliterator URL.
function getCorrectionsBackendBase(req) {
  const backend = (req._backendUrl || BACKEND_URL || '').replace(/\/$/, '');
  if (backend && !/^https?:\/\/localhost(\d*)(\/|$)/i.test(backend)) {
    return backend;
  }
  const runner = (process.env.TRANSLITERATOR_BASE_URL || process.env.NEXT_PUBLIC_TRANSLITERATOR_BASE_URL || '').replace(/\/$/, '');
  if (runner) {
    return runner.endsWith('/api/v1') ? runner : runner + '/api/v1';
  }
  return '';
}

const ENABLE_PROXY_LOGS = process.env.PROXY_LOG !== 'false';

// ---------------------------------------------------------------------------
// Short-lived in-memory cache for corrections results.
// Prevents duplicate Gemini calls when the user clicks "Check" multiple times
// on the same text within 30 seconds (common UX pattern).
// ---------------------------------------------------------------------------
const correctionsCache = new Map();
const CORRECTIONS_CACHE_TTL = 30 * 1000; // 30 seconds

function getCacheKey(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

function getCachedResult(key) {
  const entry = correctionsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CORRECTIONS_CACHE_TTL) {
    correctionsCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedResult(key, data) {
  // Cap at 50 entries; evict oldest to avoid unbounded growth
  if (correctionsCache.size >= 50) {
    correctionsCache.delete(correctionsCache.keys().next().value);
  }
  correctionsCache.set(key, { ts: Date.now(), data });
}

// Helper function to split text into manageable chunks for better accuracy
// Chunk size 400: fewer API calls per request (each call has ~1-2s RTT overhead).
// Accuracy is not affected — Gemini handles 400-char Tamil paragraphs well.
function splitIntoSentences(text) {
  // Split by common Tamil and English sentence delimiters
  const sentences = text.split(/([.!?।]\s*)/g);
  const chunks = [];
  let current = '';
  let globalOffset = 0;

  for (const part of sentences) {
    if (current.length + part.length <= 400) {
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

    const { baseUrl } = keyRotator;

    if (!keyRotator.getNextKey()) {
      return res.status(500).json({
        error: 'Gemini AI not configured - API key missing',
        help: 'Set GEMINI_API_KEY_1 in Vercel environment. Get free keys at https://aistudio.google.com/apikey'
      });
    }

    // Cache hit: avoid redundant Gemini calls for the same text
    const analyzeCacheKey = getCacheKey(text.trim());
    const analyzeCache = getCachedResult(analyzeCacheKey);
    if (analyzeCache) {
      return res.json(analyzeCache);
    }

    // Split into chunks; each chunk gets its own Gemini key so parallel chunks
    // spread rate-limit usage across all available keys.
    const chunks = splitIntoSentences(text);
    const chunkPromises = chunks.map(async (chunk) => {
      const keyInfo = keyRotator.getNextKey();
      const apiKey = keyInfo ? keyInfo.key : null;
      const keyIndex = keyInfo ? keyInfo.index : -1;
      if (!apiKey) return [];
      try {
        const response = await axiosWithPool.post(
          `${baseUrl}/models/gemini-2.5-flash:generateContent`,
          {
            systemInstruction: {
              parts: [{
                text: `நீங்கள் ஒரு தமிழ் மொழி நிபுணர். தமிழ் உரையில் உள்ள இலக்கணப் பிழைகள், எழுத்துப் பிழைகள், தவறான சொற்களை கண்டறியுங்கள்.

🔴 கண்டிப்பான விதிகள் - இவற்றை மட்டுமே பிழையாகக் குறிக்கவும்:

1. புள்ளி (ஒற்று) விடுபட்டது:
   ❌ "அளியுங்கள" → ✅ "அளியுங்கள்"
   ❌ "வருகிறார்கள" → ✅ "வருகிறார்கள்"

2. எழுத்துப் பிழைகள் (Spelling errors):
   ❌ "வணகம்" → ✅ "வணக்கம்"
   ❌ "தமிள்" → ✅ "தமிழ்"

3. தவறான வினை வடிவங்கள் (Wrong verb forms):
   ❌ "செய்தீர்" → ✅ "செய்தீர்கள்" (மரியாதை உருவம்)
   ❌ "போனேன்" → ✅ "சென்றேன்" (இலக்கிய வடிவம்)

4. சொற்கள் தவறாக இணைந்தது (Words wrongly joined):
   ❌ "பதிவபுதுப்பித்தல்" → ✅ "பதிவு புதுப்பித்தல்"

🟢 பிழையாகக் குறிக்க வேண்டாம் - இவை சரியானவை:
- புணர்ச்சி மாற்றங்கள் இரண்டும் சரி:
  ✅ "வரலாற்றுச் சிறப்பு" = ✅ "வரலாற்று சிறப்பு"
  ✅ "அரசியல்சாசனச் சட்டம்" = ✅ "அரசியல்சாசன சட்டம்"
- பேச்சு வழக்கு vs இலக்கிய வழக்கு இரண்டும் சரி

🔵 முக்கிய அறிவுறுத்தல்கள்:
1. ஒரே பிழையை இரண்டு முறை குறிக்காதீர்கள் (NO DUPLICATES)
2. title மற்றும் description எப்போதும் தமிழில் மட்டுமே எழுதவும்
3. ஒவ்வொரு பிழைக்கும் தெளிவான விளக்கம் கொடுக்கவும்
4. original சொல் உரையில் அப்படியே இருக்க வேண்டும்
5. suggestion சரியான வடிவமாக இருக்க வேண்டும்

📝 பதில் வடிவம் (JSON Array):
- id: தனித்துவமான அடையாளம்
- type: "spelling" அல்லது "grammar" அல்லது "punctuation"
- title: பிழையின் வகை (தமிழில்)
- description: விரிவான விளக்கம் (தமிழில்)
- original: மூல உரையில் உள்ள தவறான சொல்
- suggestion: சரியான சொல்
- position: { start: எண், end: எண் }`
              }]
            },
            contents: [{
              role: "user",
              parts: [{
                text: `கீழே உள்ள தமிழ் உரையை பகுப்பாய்வு செய்யுங்கள். இலக்கணப் பிழைகள், எழுத்துப் பிழைகள், புள்ளி விடுபட்டவை மட்டுமே குறிக்கவும். 
                
முக்கியம்: 
- ஒரே பிழையை மீண்டும் குறிக்காதீர்கள்
- title, description தமிழில் மட்டுமே
- original சொல் உரையில் அப்படியே இருக்க வேண்டும்

உரை:\n\n${chunk.text}`
              }]
            }],
            generationConfig: {
              temperature: 0,
              topP: 0.1,
              maxOutputTokens: 800,
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
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            timeout: 10000
          }
        );

        if (response.status === 429) {
          keyRotator.markRateLimited(keyIndex);
          return [];
        }
        if (response.status !== 200) {
          console.error(`[GEMINI] API error ${response.status}:`, response.data?.error);
          return [];
        }

        let cleanedJson = (response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]').trim();
        if (!cleanedJson.endsWith(']')) {
          const lastCompleteObject = cleanedJson.lastIndexOf('}');
          cleanedJson = lastCompleteObject > 0
            ? cleanedJson.substring(0, lastCompleteObject + 1) + ']'
            : '[]';
        }

        const chunkSuggestions = JSON.parse(cleanedJson);
        if (Array.isArray(chunkSuggestions)) {
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
        return [];
      }
    });

    const allSuggestions = (await Promise.all(chunkPromises)).flat();
    const filtered = allSuggestions.filter((s) => {
      const orig = (s.original || '').trim();
      const sugg = (s.suggestion || s.corrected || '').trim();
      if (!orig || !sugg) return false;
      if (orig === sugg) return false;
      if (orig.normalize('NFC') === sugg.normalize('NFC')) return false;
      return true;
    });

    const analyzeResult = { suggestions: filtered };
    setCachedResult(analyzeCacheKey, analyzeResult);
    res.json(analyzeResult);
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to analyze text',
      details: error.response?.data || error.message
    });
  }
});

// Grammar/Corrections API for AI assistant - exact format: { success, corrections: [{ blockId, originalText, correction, reason, type }] }
// Tries Cloud Run first (BACKEND_URL/submit with save_draft=false) so you see requests in Cloud Run logs; falls back to Express→Gemini.
router.post('/corrections', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, corrections: [], error: 'Text is required' });
    }

    // Cache hit: return immediately without hitting any backend or Gemini
    const cacheKey = getCacheKey(text.trim());
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // 1) Try backend (Cloud Run) first so /api/corrections shows up in Cloud Run logs.
    // Timeout reduced to 7s: Cloud Run responds in < 3s when warm; if it can't respond in
    // 7s it's cold/unavailable and we fall through to Gemini immediately.
    const correctionsBackend = getCorrectionsBackendBase(req);
    if (correctionsBackend) {
      try {
        const submitUrl = `${correctionsBackend}/submit`;
        const proxyRes = await axiosWithPool.post(
          submitUrl,
          { text: text.trim(), save_draft: false },
          { headers: { 'Content-Type': 'application/json' }, timeout: 7000, validateStatus: () => true }
        );
        if (proxyRes.status === 200 && proxyRes.data && proxyRes.data.success === true && Array.isArray(proxyRes.data.corrections)) {
          console.log('[CORRECTIONS] Proxied to Cloud Run', { url: submitUrl, count: proxyRes.data.corrections.length });
          const result = { success: true, corrections: proxyRes.data.corrections };
          setCachedResult(cacheKey, result);
          return res.json(result);
        }
      } catch (proxyErr) {
        console.warn('[CORRECTIONS] Backend proxy failed, using Express→Gemini', proxyErr.message);
      }
    } else {
      console.log('[CORRECTIONS] No backend URL (set BACKEND_URL or TRANSLITERATOR_BASE_URL for Cloud Run proxy)');
    }

    // 2) Fallback: Express → Gemini (no Cloud Run; check Vercel logs)
    const { baseUrl } = keyRotator;

    if (!keyRotator.getNextKey()) {
      console.warn('[CORRECTIONS] No Gemini API key - set GEMINI_API_KEY_1 or GOOGLE_GENAI_API_KEY in env (Vercel/Express)');
      return res.status(500).json({ success: false, corrections: [], error: 'Gemini AI not configured' });
    }

    const chunks = splitIntoSentences(text);
    console.log('[CORRECTIONS] POST /api/corrections (Express→Gemini)', { textLen: text.length, chunks: chunks.length });

    // Rotate the Gemini key independently per chunk so concurrent chunks spread
    // across all available keys and a single rate-limited key doesn't stall everything.
    const chunkPromises = chunks.map(async (chunk) => {
      const keyInfo = keyRotator.getNextKey();
      const apiKey = keyInfo ? keyInfo.key : null;
      const keyIndex = keyInfo ? keyInfo.index : -1;
      if (!apiKey) return [];
      try {
        const response = await axiosWithPool.post(
          `${baseUrl}/models/gemini-2.5-flash:generateContent`,
          {
            systemInstruction: {
              parts: [{
                text: `நீங்கள் ஒரு தமிழ் மொழி நிபுணர். தமிழ் உரையில் உள்ள இலக்கணப் பிழைகள், எழுத்துப் பிழைகள், தவறான சொற்களை கண்டறியுங்கள்.

🔴 கண்டிப்பான விதிகள் - இவற்றை மட்டுமே பிழையாகக் குறிக்கவும்:

1. புள்ளி (ஒற்று) விடுபட்டது:
   ❌ "கொடுங்கள" → ✅ "கொடுங்கள்"
   ❌ "வருகிறார்கள" → ✅ "வருகிறார்கள்"
   ❌ "சொல்ல" → ✅ "சொல்ல" (சரி) அல்லது ❌ "சொல்" → ✅ "சொல்ல்" (தவறு)

2. எழுத்துப் பிழைகள் (Spelling errors):
   ❌ "வணகம்" → ✅ "வணக்கம்"
   ❌ "தமிள்" → ✅ "தமிழ்"
   ❌ "நன்ரி" → ✅ "நன்றி"

3. சொற்கள் தவறாக இணைந்தது (Words wrongly joined):
   ❌ "பதிவபுதுப்பித்தல்" → ✅ "பதிவு புதுப்பித்தல்"
   ❌ "இaboratoryருக்கிறது" → தவறான இணைப்பு

4. தவறான எழுத்து மாற்றம் (Wrong character substitution):
   ❌ "ண" க்கு பதில் "ன" (அல்லது நேர்மாறாக) - சூழலைப் பொறுத்து
   ❌ "ற" க்கு பதில் "ர" (அல்லது நேர்மாறாக) - சூழலைப் பொறுத்து

🟢 பிழையாகக் குறிக்க வேண்டாம் - இவை சரியானவை:
- புணர்ச்சி மாற்றங்கள் இரண்டும் சரி:
  ✅ "வரலாற்றுச் சிறப்பு" = ✅ "வரலாற்று சிறப்பு"
  ✅ "அரசியல்சாசனச் சட்டம்" = ✅ "அரசியல்சாசன சட்டம்"
- பேச்சு வழக்கு vs இலக்கிய வழக்கு இரண்டும் சரி:
  ✅ "போனேன்" = ✅ "சென்றேன்" (இரண்டும் சரி)
  ✅ "செய்தீர்" = ✅ "செய்தீர்கள்" (இரண்டும் சரி)
  ✅ "வந்தான்" = ✅ "வந்தான்" (பேச்சு வழக்கு சரி)
- வட்டார வழக்குகள் சரியானவை

🔵 முக்கிய அறிவுறுத்தல்கள்:
1. ஒரே பிழையை இரண்டு முறை குறிக்காதீர்கள் (NO DUPLICATES)
2. title மற்றும் description எப்போதும் தமிழில் மட்டுமே எழுதவும்
3. ஒவ்வொரு பிழைக்கும் தெளிவான விளக்கம் கொடுக்கவும்
4. original சொல் உரையில் அப்படியே இருக்க வேண்டும்
5. suggestion சரியான வடிவமாக இருக்க வேண்டும்
6. சந்தேகமாக இருந்தால், பிழையாகக் குறிக்காதீர்கள்

📝 பதில் வடிவம் (JSON Array):
- id: தனித்துவமான அடையாளம்
- type: "spelling" அல்லது "grammar" அல்லது "punctuation"
- title: பிழையின் வகை (தமிழில்)
- description: விரிவான விளக்கம் (தமிழில்)
- original: மூல உரையில் உள்ள தவறான சொல்
- suggestion: சரியான சொல்
- position: { start: எண், end: எண் }`
              }]
            },
            contents: [{
              role: 'user',
              parts: [{
                text: `கீழே உள்ள தமிழ் உரையை பகுப்பாய்வு செய்யுங்கள். இலக்கணப் பிழைகள், எழுத்துப் பிழைகள் மட்டுமே குறிக்கவும். உரை:\n\n${chunk.text}`
              }]
            }],
            generationConfig: {
              temperature: 0,
              topP: 0.1,
              // 800 tokens is sufficient for up to ~6 corrections per 400-char chunk.
              // Lower limit → faster time-to-first-token from Gemini.
              maxOutputTokens: 800,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    original: { type: 'string' },
                    suggestion: { type: 'string' },
                    position: { type: 'object', properties: { start: { type: 'integer' }, end: { type: 'integer' } } }
                  },
                  required: ['id', 'type', 'title', 'description', 'original', 'suggestion']
                }
              }
            }
          },
          { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, timeout: 10000 }
        );

        if (response.status === 429) {
          keyRotator.markRateLimited(keyIndex);
          return [];
        }
        if (response.status !== 200) return [];

        let cleanedJson = (response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]').trim();
        if (!cleanedJson.endsWith(']')) {
          const lastComplete = cleanedJson.lastIndexOf('}');
          if (lastComplete > 0) cleanedJson = cleanedJson.substring(0, lastComplete + 1) + ']';
          else cleanedJson = '[]';
        }
        const arr = JSON.parse(cleanedJson);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message || String(e);
        const status = e.response?.status;
        console.warn('[CORRECTIONS] Gemini chunk error', { status, message: msg?.slice(0, 200) });
        return [];
      }
    });

    const allSuggestions = (await Promise.all(chunkPromises)).flat();
    const filtered = allSuggestions.filter((s) => {
      const orig = (s.original || '').trim();
      const sugg = (s.suggestion || s.corrected || '').trim();
      if (!orig || !sugg) return false;
      if (orig === sugg) return false;
      if (orig.normalize('NFC') === sugg.normalize('NFC')) return false;
      return true;
    });

    const corrections = filtered.map((s) => ({
      blockId: '0',
      originalText: (s.original || '').trim(),
      correction: (s.suggestion || s.corrected || '').trim(),
      reason: (s.description || s.title || '').trim() || 'இலக்கண/எழுத்துப் பிழை திருத்தம்.',
      type: (s.type && ['spelling', 'grammar', 'punctuation'].includes(s.type)) ? s.type : 'spelling'
    }));

    console.log('[CORRECTIONS] Returning', { count: corrections.length, rawSuggestions: allSuggestions.length });
    const result = { success: true, corrections };
    setCachedResult(cacheKey, result);
    return res.json(result);
  } catch (error) {
    console.error('[CORRECTIONS] Error:', error.message);
    return res.status(500).json({ success: false, corrections: [], error: error.message });
  }
});

// English to Tamil Translation with Gemini AI
// Pure translation only: returns translated Tamil text (no proofreading pass after)
router.post('/gemini/translate', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Use shared key rotator for multi-key support
    const keyInfo = keyRotator.getNextKey();
    const apiKey = keyInfo ? keyInfo.key : null;
    const keyIndex = keyInfo ? keyInfo.index : -1;
    const baseUrl = keyRotator.baseUrl;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Gemini AI not configured - API key missing',
        help: 'Set GEMINI_API_KEY_1 in Vercel environment'
      });
    }

    console.log('[TRANSLATE] Translating English to Tamil:', text.substring(0, 50) + '...');

    const response = await axiosWithPool.post(
      `${baseUrl}/models/gemini-2.5-flash:generateContent`,
      {
        systemInstruction: {
          parts: [{
            text: `You are an expert English to Tamil translator.

TRANSLATION RULES:
1. Preserve the meaning and tone of the original text
2. Use natural Tamil grammar and sentence structure
3. For technical terms, provide the Tamil equivalent if available
4. Maintain paragraph structure
5. Use modern, commonly understood Tamil words

OUTPUT FORMAT (MANDATORY JSON):
{
  "translated_text": "The complete Tamil translation"
}

RULES:
- ALWAYS respond with valid JSON only
- Do NOT include any extra keys besides "translated_text"`
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: `Translate this English text to Tamil:\n\n${text}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
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
      result = { translated_text: aiText };
    }

    console.log('[TRANSLATE] Translation complete:', result.translated_text?.substring(0, 50) + '...');

    res.json({
      success: true,
      original_text: text,
      translated_text: result.translated_text || '',
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
    
    const url = `${req._backendUrl}/transliterate`;
    console.log(`[TRANSLITERATE] POST ${url} with text: ${text}`);
    
    const response = await axiosWithPool.post(url, { text });
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
    const target = `${req._backendUrl}/auth/google/callback`;
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;
    delete forwardHeaders.connection;
    delete forwardHeaders['content-length'];
    forwardHeaders['x-oauth-handoff'] = 'json';

    console.log('[OAUTH-HANDOFF] callback handled on frontend host=', req.hostname);
    console.log('[OAUTH-PROXY] forwarding to:', target);

    const maxRetries = 10;
    const retryDelayMs = 2500;
    let response;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      response = await axios({
        method: 'get',
        url: target,
        params: req.query,
        headers: forwardHeaders,
        withCredentials: true,
        validateStatus: () => true,
        maxRedirects: 0,
        timeout: 15000,
      });
      if (response.status !== 503) break;
      if (attempt < maxRetries) {
        console.log(`[OAUTH-PROXY] backend 503 (starting), retry ${attempt}/${maxRetries} in ${retryDelayMs}ms`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }

    if (response.status === 503) {
      console.warn('[OAUTH-PROXY] backend still 503 after', maxRetries, 'retries; redirect to login');
      return res.redirect(302, '/login?error=backend_starting&message=Backend+is+starting.+Please+try+again+in+30+seconds.');
    }

    // Log all response headers for debugging
    console.log('[OAUTH-HANDOFF] Response status:', response.status);
    console.log('[OAUTH-HANDOFF] Response headers:', Object.keys(response.headers));
    console.log('[OAUTH-HANDOFF] Set-Cookie header:', response.headers['set-cookie']);
    
    // If backend returned JSON handoff
    const contentType = response.headers['content-type'] || '';
    if (response.status === 200 && contentType.includes('application/json') && response.data?.access_token) {
      // Forward Set-Cookie headers from backend (includes refresh_token and access_token cookies)
      // Note: axios lowercases header names, so it's 'set-cookie' not 'Set-Cookie'
      const setCookie = response.headers['set-cookie'];
      console.log('[OAUTH-HANDOFF] Backend Set-Cookie headers:', setCookie ? (Array.isArray(setCookie) ? setCookie.length : 1) + ' cookie(s)' : 'none');
      
      if (setCookie) {
        // Handle both single cookie string and array of cookies
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
        console.log('[OAUTH-HANDOFF] Cookies to forward:', cookies);
        cookies.forEach(cookie => {
          // Use appendHeader to allow multiple Set-Cookie headers
          res.append('Set-Cookie', cookie);
          console.log('[OAUTH-HANDOFF] Added cookie:', cookie.substring(0, 100) + '...');
        });
        console.log('[OAUTH-HANDOFF] forwarded', cookies.length, 'cookie(s) from backend');
      } else {
        console.warn('[OAUTH-HANDOFF] WARNING: No Set-Cookie headers received from backend!');
      }
      
      const token = response.data.access_token;
      console.log('[OAUTH-HANDOFF] received access_token, redirecting to drafts');
      // Redirect to drafts with token in URL - client will store it
      return res.redirect(`/drafts?access_token=${encodeURIComponent(token)}`);
    }

    // fallback: forward cookies and location
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      // Handle both single cookie string and array of cookies
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      cookies.forEach(cookie => {
        res.setHeader('Set-Cookie', cookie);
      });
    }
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

// OCR Tool - Direct implementation using Tesseract.js
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL;
// Handwriting OCR - Tamil handwritten notes to text (Python service)
const HANDWRITING_OCR_URL = process.env.HANDWRITING_OCR_URL || 'http://localhost:8000';
let ocrService = null;

// Try to load OCR service (direct implementation)
try {
  // IMPORTANT: Do not use direct Tesseract.js OCR inside Vercel serverless.
  // Vercel often does not include the tesseract-core WASM files at runtime, causing ENOENT and timeouts.
  const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
  if (isVercel) {
    console.log('[OCR] Skipping direct OCR service on Vercel; external OCR_SERVICE_URL is required');
    ocrService = null;
  } else {
    ocrService = require('../services/ocr-service');
    console.log('[OCR] Direct OCR service loaded (Tesseract.js)');
  }
} catch (error) {
  console.warn('[OCR] Direct OCR service not available:', error.message);
  console.warn('[OCR] Will attempt to use external OCR service if OCR_SERVICE_URL is set');
}

// Configure multer for OCR file uploads (images and PDFs only)
const uploadOCR = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/tiff', 'image/bmp', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  }
});

// Configure multer for document converter uploads (all document types)
const uploadConverter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'text/plain', // .txt
      'text/html', // .html
      'application/rtf', // .rtf
      'application/vnd.oasis.opendocument.text' // .odt
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Also check by extension as fallback
      const ext = file.originalname.split('.').pop().toLowerCase();
      const allowedExts = ['pdf', 'docx', 'doc', 'txt', 'html', 'rtf', 'odt'];
      if (allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, DOCX, TXT, HTML, RTF, and ODT are allowed.'));
      }
    }
  }
});

// Keep 'upload' for backward compatibility (used by OCR)
const upload = uploadOCR;

// Store generated Word documents temporarily (in-memory for now, could use Redis/file storage)
const ocrDocuments = new Map();

// AI Content Writer service
let contentWriterService = null;
try {
  contentWriterService = require('../services/ai-content-writer/content-writer-service');
} catch (error) {
  console.warn('[AI-CONTENT-WRITER] Service not available:', error.message);
}

// OCR health check endpoint
router.get('/ocr/health', (req, res) => {
  try {
    // Check if OCR service is available
    if (ocrService) {
      return res.json({
        status: 'healthy',
        service: 'OCR Service',
        implementation: 'Direct (Tesseract.js)',
        version: '1.0.0'
      });
    }
    
    // Check external service if configured
    if (OCR_SERVICE_URL && OCR_SERVICE_URL !== 'http://localhost:5000') {
      return res.json({
        status: 'healthy',
        service: 'OCR Service',
        implementation: 'External',
        url: OCR_SERVICE_URL,
        version: '1.0.0'
      });
    }

    // Fallback: if backend exposes OCR proxy endpoints, report that
    // This allows Vercel to only configure BACKEND_URL and keep OCR_SERVICE_URL on backend Cloud Run.
    return res.status(200).json({
      status: 'unknown',
      service: 'OCR Service',
      implementation: 'Backend proxy (if configured)',
      url: `${req._backendUrl}/ocr/upload`,
      version: '1.0.0'
    });
    
    return res.status(503).json({
      status: 'unhealthy',
      service: 'OCR Service',
      error: 'OCR service is not available'
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      service: 'OCR Service',
      error: error.message
    });
  }
});

// OCR upload endpoint - uses direct implementation or proxies to external service
router.post('/ocr/upload', uploadOCR.single('file'), async (req, res) => {
  try {
    if (ENABLE_PROXY_LOGS) {
      console.log('[OCR] POST /ocr/upload');
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const lang = req.body.lang || 'eng+tam';
    const fileBuffer = req.file.buffer;
    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;

    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    const isProd = process.env.NODE_ENV === 'production' || isVercel;
    const hasExternalOcr = OCR_SERVICE_URL && OCR_SERVICE_URL !== 'http://localhost:5000';

    // In production/serverless, direct Tesseract.js OCR can be extremely slow or hang.
    // Prefer the external OCR service (Cloud Run) when available.
    // If OCR_SERVICE_URL is not configured on Vercel, fall back to BACKEND_URL OCR proxy endpoints (if backend is configured).
    if (isProd && !hasExternalOcr) {
      try {
        const url = `${req._backendUrl}/ocr/upload`;
        if (ENABLE_PROXY_LOGS) console.log('[OCR] Using backend OCR proxy:', url);

        const formData = new FormData();
        formData.append('file', fileBuffer, { filename, contentType: mimeType });
        formData.append('lang', lang);

        const response = await axiosWithPool.post(url, formData, {
          headers: {
            ...formData.getHeaders(),
            // Forward cookies/auth if present (some backends may gate large uploads)
            cookie: req.headers.cookie,
            authorization: req.headers.authorization,
          },
          maxContentLength: 16 * 1024 * 1024,
          maxBodyLength: 16 * 1024 * 1024,
          timeout: 120000,
          validateStatus: () => true,
        });

        return res.status(response.status).send(response.data);
      } catch (e) {
        return res.status(503).json({
          error: 'OCR is not configured for production yet.',
          details:
            'On Vercel, direct OCR is not supported. Configure OCR on the backend by setting OCR_SERVICE_URL on Cloud Run (or set OCR_SERVICE_URL in Vercel to an OCR microservice). See README_OCR_SETUP.md.',
        });
      }
    }
    
    // Prefer external OCR service if configured (production path)
    if (hasExternalOcr) {
      console.log('[OCR] Using external OCR service:', OCR_SERVICE_URL);
      
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: mimeType
      });
      formData.append('lang', lang);
      
      const response = await axiosWithPool.post(`${OCR_SERVICE_URL}/upload`, formData, {
        headers: {
          ...formData.getHeaders()
        },
        maxContentLength: 16 * 1024 * 1024,
        maxBodyLength: 16 * 1024 * 1024,
        timeout: 120000
      });
      
      if (typeof response.data === 'object') {
        return res.json(response.data);
      } else {
        try {
          const jsonData = JSON.parse(response.data);
          return res.json(jsonData);
        } catch (e) {
          throw new Error('OCR service returned invalid response');
        }
      }
    }

    // Try direct OCR implementation (dev fallback)
    let directOcrError = null;
    if (ocrService) {
      console.log('[OCR] Using direct OCR implementation');
      try {
        const OCR_TIMEOUT_MS = 90_000; // 90s (prevents hanging requests)
        const result = await Promise.race([
          ocrService.processFile(fileBuffer, filename, mimeType, lang),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('OCR processing timed out. Please try a smaller/clearer image, or try again later.')),
              OCR_TIMEOUT_MS
            )
          )
        ]);

        // Store document path for download (only if we actually have a file)
        ocrDocuments.set(result.download_filename, result.download_path || null);

        // Clean up old documents (keep last 10)
        if (ocrDocuments.size > 10) {
          const firstKey = ocrDocuments.keys().next().value;
          try {
            const fs = require('fs');
            const oldPath = ocrDocuments.get(firstKey);
            if (oldPath && fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          } catch (e) {
            // Ignore cleanup errors
          }
          ocrDocuments.delete(firstKey);
        }

        return res.json({
          success: true,
          text: result.text.substring(0, 500) + (result.text.length > 500 ? '...' : ''),
          full_text: result.full_text,
          download_filename: result.download_filename,
          char_count: result.char_count
        });
      } catch (ocrError) {
        directOcrError = ocrError;
        console.error('[OCR] Direct OCR processing failed:', ocrError.message);
        // Continue to external OCR service fallback if configured
      }
    }
    
    // No external OCR service configured.
    // If direct OCR exists but failed, return the real error instead of "service unavailable".
    if (directOcrError) {
      const msg = directOcrError.message || 'OCR processing failed';
      const isPdfNoText = mimeType === 'application/pdf' && msg.toLowerCase().includes('no extractable text');
      return res.status(422).json({
        error: isPdfNoText ? 'This PDF appears to be image-based and cannot be extracted yet.' : msg,
        details: isPdfNoText
          ? 'Currently we can extract text from PDFs that contain embedded text. For scanned PDFs, please upload an image (JPG/PNG) or use an external OCR service.'
          : msg
      });
    }

    // Truly no OCR service available
    return res.status(503).json({
      error: 'OCR service is not currently available. Please contact support.',
      details: 'OCR functionality requires Tesseract.js or an external OCR service'
    });
    
  } catch (error) {
    console.error('[OCR] Upload error:', error.message);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        error: 'OCR service is not available. The service may be down.',
        details: error.message
      });
    }
    
    if (error.response && error.response.headers['content-type']?.includes('text/html')) {
      return res.status(503).json({ 
        error: 'OCR service returned an error page.',
        details: 'Please check OCR service configuration'
      });
    }
    
    res.status(error.response?.status || 500).json({
      error: error.message || 'OCR processing failed',
      details: error.response?.data?.error || error.message
    });
  }
});

// OCR download endpoint
router.get('/ocr/download/:filename', async (req, res) => {
  try {
    if (ENABLE_PROXY_LOGS) {
      console.log('[OCR] GET /ocr/download/:filename');
    }
    
    const filename = req.params.filename;
    
    // Check if file is in our temporary storage (direct OCR)
    if (ocrDocuments.has(filename)) {
      const filePath = ocrDocuments.get(filename);
      const fs = require('fs');
      const path = require('path');
      
      if (filePath && fs.existsSync(filePath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        return res.sendFile(path.resolve(filePath));
      } else {
        ocrDocuments.delete(filename);
      }
    }
    
    // Fallback to external service if configured
    if (OCR_SERVICE_URL && OCR_SERVICE_URL !== 'http://localhost:5000') {
      const response = await axiosWithPool.get(`${OCR_SERVICE_URL}/download/${filename}`, {
        responseType: 'stream'
      });
      
      res.setHeader('Content-Disposition', response.headers['content-disposition'] || `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      return response.data.pipe(res);
    }

    // Fallback to backend OCR proxy (Cloud Run backend) if available
    try {
      const response = await axiosWithPool.get(`${req._backendUrl}/ocr/download/${encodeURIComponent(filename)}`, {
        responseType: 'stream',
        headers: {
          cookie: req.headers.cookie,
          authorization: req.headers.authorization,
        },
        validateStatus: () => true,
      });

      res.status(response.status);
      if (response.headers['content-disposition']) {
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      }
      return response.data.pipe(res);
    } catch (e) {
      // ignore, fall through
    }
    
    return res.status(404).json({ error: 'File not found' });
  } catch (error) {
    console.error('[OCR] Download error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'File download failed',
      details: error.message
    });
  }
});

// Handwriting OCR (Tamil handwritten notes to text) - proxy to Python service
const uploadHandwriting = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, BMP, TIFF images are allowed.'));
    }
  }
});

router.get('/handwriting-ocr/health', async (req, res) => {
  try {
    const response = await axiosWithPool.get(`${HANDWRITING_OCR_URL}/health`, { timeout: 5000 });
    return res.json(response.data);
  } catch (err) {
    return res.status(503).json({
      status: 'unhealthy',
      error: 'Handwriting OCR service is not available',
      details: err.message
    });
  }
});

router.post('/handwriting-ocr/extract-words', uploadHandwriting.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname || 'image.png', contentType: req.file.mimetype });
    const response = await axiosWithPool.post(
      `${HANDWRITING_OCR_URL}/api/ocr/extract-words`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
    return res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data;
    const message = data?.detail || (Array.isArray(data?.detail) ? data.detail.map(d => d.msg).join(' ') : null) || data?.message || error.message;
    return res.status(status).json({
      success: false,
      error: message || 'Failed to process handwritten image'
    });
  }
});

// Document Converter Service
const converterService = require('../services/document-converter/converter-service');

// Document Converter - Health check
router.get('/converter/health', async (req, res) => {
  try {
    const health = await converterService.healthCheck();
    if (health) {
      return res.json(health);
    }
    return res.status(503).json({ 
      status: 'unhealthy',
      error: 'Document converter service is not available'
    });
  } catch (error) {
    console.error('[Converter] Health check error:', error.message);
    return res.status(503).json({ 
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Document Converter - Get supported conversions
router.get('/converter/supported-conversions', async (req, res) => {
  try {
    const data = await converterService.getSupportedConversions();
    return res.json(data);
  } catch (error) {
    console.error('[Converter] Get supported conversions error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Document Converter - Convert document
router.post('/converter/convert', uploadConverter.single('file'), async (req, res) => {
  try {
    if (ENABLE_PROXY_LOGS) {
      console.log('[Converter] POST /converter/convert');
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const toFormat = req.body.to_format || req.body.toFormat;
    if (!toFormat) {
      return res.status(400).json({ error: 'Target format (to_format) is required' });
    }
    
    const fileBuffer = req.file.buffer;
    const filename = req.file.originalname;
    
    console.log('[Converter] Converting file:', filename, 'to format:', toFormat);
    
    const result = await converterService.convertDocument(fileBuffer, filename, toFormat);
    
    return res.json(result);
  } catch (error) {
    console.error('[Converter] Conversion error:', error.message);
    return res.status(error.response?.status || 500).json({
      error: error.message || 'Conversion failed',
      details: error.details || error.response?.data?.error || error.message
    });
  }
});

// Document Converter - Download converted file
router.get('/converter/download/:filename', async (req, res) => {
  try {
    if (ENABLE_PROXY_LOGS) {
      console.log('[Converter] GET /converter/download/:filename');
    }
    
    const filename = req.params.filename;
    const fileStream = await converterService.downloadFile(filename);
    
    // Set appropriate headers
    const ext = filename.split('.').pop().toLowerCase();
    const contentTypes = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'html': 'text/html',
      'rtf': 'application/rtf',
      'odt': 'application/vnd.oasis.opendocument.text'
    };
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    
    fileStream.pipe(res);
  } catch (error) {
    console.error('[Converter] Download error:', error.message);
    return res.status(error.response?.status || 500).json({
      error: error.message || 'Download failed'
    });
  }
});

// Submit endpoint - proxy to backend submissions
// IMPORTANT: This route must be defined BEFORE the catch-all router.all('/*') to ensure it's matched
router.post('/submit', async (req, res) => {
  try {
    // Backend expects POST /api/v1/submit (NOT /submissions)
    const url = `${req._backendUrl}/submit`;
    
    // Minimal logging for performance (only in debug mode)
    if (ENABLE_PROXY_LOGS && process.env.DEBUG_SUBMIT === 'true') {
      console.log(`[SUBMIT] POST ${url} (text: ${req.body?.text?.length || 0} chars, save_draft: ${req.body?.save_draft})`);
    }
    
    // Forward authorization header if present
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Copy relevant headers from request
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    // IMPORTANT: Backend auth prefers HTTP-only cookie "access_token".
    // Since this is a server-side proxy call, we must forward the incoming Cookie header.
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }

    // NOTE:
    // The Go backend already supports "inline analysis" without auth when save_draft=false,
    // and returns the exact GoTamil-style { success, request_id, corrections[] } shape.
    // So we should not intercept /api/submit with any demo logic here.
    
    // Prepare request body
    const requestBody = {
      text: req.body?.text || '',
      html: req.body?.html || '',
      model: req.body?.model || 'gemini-flash'
    };
    
    // Add save_draft flag if present
    if (req.body?.save_draft !== undefined) {
      requestBody.save_draft = req.body.save_draft;
    }
    
    const response = await axiosWithPool.post(url, requestBody, {
      headers,
      validateStatus: () => true, // Don't throw on any status
    });

    // Logged-in path should behave exactly like Workspace.
    // If backend returns 401 here, surface it (client should re-login).
    
    // Only log errors, not success (performance optimization)
    if (response.status !== 200 && response.status !== 201 && ENABLE_PROXY_LOGS) {
      console.log(`[SUBMIT] Error ${response.status}:`, response.data?.error || 'Unknown error');
    }
    
    res.status(response.status).json(response.data);
  } catch (error) {
    // Concise error logging for performance
    console.error('[SUBMIT-ERROR]', error.message, error.response?.status || '');
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || 'Submission failed',
      details: error.response?.data?.details || error.message
    });
  }
});

// SSE stream proxy for submission updates
// This endpoint streams real-time updates from the Go backend using Server-Sent Events
router.get('/submissions/:id/stream', async (req, res) => {
  const submissionId = req.params.id;
  const url = `${req._backendUrl}/submissions/${submissionId}/stream`;
  
  console.log(`[SSE] Proxying stream for submission ${submissionId}`);
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
  
  try {
    // Forward auth headers
    const headers = {};
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }
    
    // Make streaming request to backend
    const response = await axiosWithPool.get(url, {
      headers,
      responseType: 'stream',
      timeout: 120000, // 2 minute timeout for long analyses
      validateStatus: () => true,
    });
    
    if (response.status !== 200) {
      console.error(`[SSE] Backend returned ${response.status} for submission ${submissionId}`);
      res.write(`event: failure\ndata: {"message": "Backend error ${response.status}"}\n\n`);
      res.end();
      return;
    }
    
    // Pipe the SSE stream from backend to client
    response.data.on('data', (chunk) => {
      res.write(chunk);
    });
    
    response.data.on('end', () => {
      console.log(`[SSE] Stream ended for submission ${submissionId}`);
      res.end();
    });
    
    response.data.on('error', (err) => {
      console.error(`[SSE] Stream error for submission ${submissionId}:`, err.message);
      res.write(`event: failure\ndata: {"message": "Stream error"}\n\n`);
      res.end();
    });
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`[SSE] Client disconnected for submission ${submissionId}`);
      response.data.destroy();
    });
    
  } catch (error) {
    console.error(`[SSE] Error proxying stream for submission ${submissionId}:`, error.message);
    res.write(`event: failure\ndata: {"message": "${error.message}"}\n\n`);
    res.end();
  }
});

// ============= AI CONTENT WRITER API ROUTES =============
// These routes proxy requests to the Python Flask API running on port 5002

// AI Content Writer health check - includes Gemini key status
router.get('/ai-content-writer/health', async (req, res) => {
  try {
    // Get key rotator status
    const keyStatus = keyRotator.getStatus();
    
    if (!contentWriterService) {
      return res.status(503).json({
        status: 'unhealthy',
        service: 'AI Content Writer',
        error: 'Service not available',
        geminiKeys: keyStatus,
      });
    }
    
    const health = await contentWriterService.healthCheck();
    if (health) {
      // Add key status to health response
      return res.json({
        ...health,
        geminiKeys: keyStatus,
      });
    } else {
      return res.status(503).json({
        status: 'unhealthy',
        service: 'AI Content Writer',
        error: 'Service health check failed',
        geminiKeys: keyStatus,
      });
    }
  } catch (error) {
    console.error('[AI-CONTENT-WRITER] Health check error:', error.message);
    return res.status(503).json({
      status: 'unhealthy',
      service: 'AI Content Writer',
      error: error.message,
      geminiKeys: keyRotator.getStatus(),
    });
  }
});

// Generate content endpoint
router.post('/ai-content-writer/generate-content', async (req, res) => {
  try {
    if (ENABLE_PROXY_LOGS) {
      console.log('[AI-CONTENT-WRITER] POST /generate-content');
    }
    
    if (!contentWriterService) {
      return res.status(503).json({
        error: 'AI Content Writer service is not available',
        details: 'The Python Flask API may not be running. Please check the service.'
      });
    }
    
    const result = await contentWriterService.generateContent(req.body);
    return res.json(result);
  } catch (error) {
    console.error('[AI-CONTENT-WRITER] Generate content error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Content generation failed',
      details: error.details || error.response?.data?.error || error.message
    });
  }
});

// Render a blog template for preview/publishing (deterministic, no AI)
router.post('/ai-content-writer/render-blog-template', async (req, res) => {
  try {
    if (!contentWriterService || typeof contentWriterService.renderBlogTemplate !== 'function') {
      return res.status(503).json({
        error: 'AI Content Writer service is not available',
      });
    }
    const result = await contentWriterService.renderBlogTemplate(req.body);
    return res.json(result);
  } catch (error) {
    console.error('[AI-CONTENT-WRITER] Render blog template error:', error.message);
    res.status(500).json({
      error: error.message || 'Template render failed',
      details: error.details || error.message,
    });
  }
});

// SEO validation endpoint - check if content is SEO-optimized before publishing
router.post('/seo/validate', (req, res) => {
  try {
    const { title, meta_description, content_text, keywords, slug } = req.body;
    
    const result = seoAutomation.validateSEO({
      title,
      meta_description,
      content_text,
      keywords,
      slug,
    });
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[SEO] Validation error:', error.message);
    res.status(500).json({ error: 'SEO validation failed', details: error.message });
  }
});

// SEO helper - generate meta description from content
router.post('/seo/generate-meta', (req, res) => {
  try {
    const { content, maxLength = 155 } = req.body;
    const metaDescription = seoAutomation.generateMetaDescription(content, maxLength);
    res.json({ success: true, meta_description: metaDescription });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate meta description' });
  }
});

// SEO helper - extract keywords from content
router.post('/seo/extract-keywords', (req, res) => {
  try {
    const { content, maxKeywords = 8 } = req.body;
    const keywords = seoAutomation.extractKeywords(content, maxKeywords);
    res.json({ success: true, keywords });
  } catch (error) {
    res.status(500).json({ error: 'Failed to extract keywords' });
  }
});

// Generate social variants (LinkedIn/Facebook/Instagram Reels) - copy/export only
router.post('/ai-content-writer/social-variants', async (req, res) => {
  try {
    if (!contentWriterService || typeof contentWriterService.generateSocialVariants !== 'function') {
      return res.status(503).json({
        error: 'AI Content Writer service is not available',
      });
    }
    const result = await contentWriterService.generateSocialVariants(req.body);
    return res.json(result);
  } catch (error) {
    console.error('[AI-CONTENT-WRITER] Social variants error:', error.message);
    res.status(500).json({
      error: error.message || 'Social variant generation failed',
      details: error.details || error.message,
    });
  }
});

// Event name suggester (Tamil tool) - generate catchy event name ideas
router.post('/event-name-suggester/suggest', async (req, res) => {
  try {
    if (!contentWriterService || typeof contentWriterService.generateEventNames !== 'function') {
      return res.status(503).json({
        error: 'Event Name Suggester service is not available',
      });
    }
    const result = await contentWriterService.generateEventNames(req.body);
    return res.json(result);
  } catch (error) {
    console.error('[EVENT-NAMES] Suggest error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Event name suggestion failed',
      details: error.details || error.response?.data?.error || error.message,
    });
  }
});

// Improve content endpoint
router.post('/ai-content-writer/improve-content', async (req, res) => {
  try {
    if (ENABLE_PROXY_LOGS) {
      console.log('[AI-CONTENT-WRITER] POST /improve-content');
    }
    
    if (!contentWriterService) {
      return res.status(503).json({
        error: 'AI Content Writer service is not available',
        details: 'The Python Flask API may not be running. Please check the service.'
      });
    }
    
    const result = await contentWriterService.improveContent(req.body);
    return res.json(result);
  } catch (error) {
    console.error('[AI-CONTENT-WRITER] Improve content error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Content improvement failed',
      details: error.details || error.response?.data?.error || error.message
    });
  }
});

// Translate content endpoint
router.post('/ai-content-writer/translate', async (req, res) => {
  try {
    if (ENABLE_PROXY_LOGS) {
      console.log('[AI-CONTENT-WRITER] POST /translate');
    }
    
    if (!contentWriterService) {
      return res.status(503).json({
        error: 'AI Content Writer service is not available',
        details: 'The Python Flask API may not be running. Please check the service.'
      });
    }
    
    const result = await contentWriterService.translateContent(req.body);
    return res.json(result);
  } catch (error) {
    console.error('[AI-CONTENT-WRITER] Translate content error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message || 'Translation failed',
      details: error.details || error.response?.data?.error || error.message
    });
  }
});

// ============= END AI CONTENT WRITER API ROUTES =============

// ============= BLOG PUBLISH API (Express -> Go backend) =============
// Admin-only emails allowed to publish blogs
const BLOG_PUBLISH_ALLOWED_EMAILS = ['palkani.r@gmail.com', 'prooftamil@gmail.com', 'banu.palkani@gmail.com'];

// Create a blog post in the backend (requires auth - ADMIN ONLY)
router.post('/blog/publish', async (req, res) => {
  try {
    // Check if user is allowed to publish (admin only)
    const userEmail = req.user?.email ? String(req.user.email).toLowerCase().trim() : '';
    if (!userEmail || !BLOG_PUBLISH_ALLOWED_EMAILS.includes(userEmail)) {
      console.log('[BLOG-PUBLISH] Unauthorized publish attempt:', userEmail || 'no user');
      return res.status(403).json({ 
        error: 'Blog publishing is restricted to administrators.',
        message: 'Please contact the admin to publish content.'
      });
    }

    // Note: BACKEND_URL already includes /api/v1, so just append /blog/posts
    const url = `${req._backendUrl}/blog/posts`;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    // Forward cookies with proper header case (Cookie, not cookie)
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }

    console.log('[BLOG-PUBLISH] Admin publishing:', userEmail, 'to URL:', url);
    console.log('[BLOG-PUBLISH] Request body keys:', Object.keys(req.body || {}));
    console.log('[BLOG-PUBLISH] Title:', req.body?.title?.substring(0, 50));
    console.log('[BLOG-PUBLISH] Content length:', req.body?.content_text?.length || 0);
    console.log('[BLOG-PUBLISH] Auth header present:', !!headers.Authorization);

    const backendRes = await axiosWithPool.post(url, req.body, {
      headers,
      validateStatus: () => true,
      timeout: 30000, // 30 second timeout for blog creation
    });

    // Log backend response for debugging
    console.log('[BLOG-PUBLISH] Backend response status:', backendRes.status);
    if (backendRes.status !== 200 && backendRes.status !== 201) {
      console.error('[BLOG-PUBLISH] Backend error:', backendRes.status, JSON.stringify(backendRes.data));
    }

    // If published successfully with status = 'published', ping search engines
    if ((backendRes.status === 200 || backendRes.status === 201) && 
        backendRes.data?.success && 
        req.body?.status === 'published') {
      // Ping search engines asynchronously (don't block the response)
      seoAutomation.pingSitemapToSearchEngines()
        .then(results => {
          console.log('[SEO] Sitemap ping results:', JSON.stringify(results));
        })
        .catch(err => {
          console.error('[SEO] Sitemap ping failed:', err.message);
        });
    }

    res.status(backendRes.status).json(backendRes.data);
  } catch (error) {
    console.error('[BLOG-PUBLISH] error:', error.message);
    if (error.response) {
      console.error('[BLOG-PUBLISH] Response:', error.response.status, error.response.data);
    }
    res.status(502).json({ error: 'Blog publish failed', details: error.message });
  }
});

// Delete a blog post by id (requires auth - ADMIN ONLY)
router.delete('/blog/posts/:id', async (req, res) => {
  try {
    // Check if user is allowed to delete (admin only)
    const userEmail = req.user?.email ? String(req.user.email).toLowerCase().trim() : '';
    if (!userEmail || !BLOG_PUBLISH_ALLOWED_EMAILS.includes(userEmail)) {
      return res.status(403).json({ error: 'Blog deletion is restricted to administrators.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    // Note: BACKEND_URL already includes /api/v1, so just append /blog/posts/:id
    const url = `${req._backendUrl}/blog/posts/${encodeURIComponent(id)}`;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    // Forward cookies with proper header case
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }

    const backendRes = await axiosWithPool.delete(url, {
      headers,
      validateStatus: () => true,
    });

    return res.status(backendRes.status).json(backendRes.data);
  } catch (error) {
    console.error('[BLOG-DELETE] error:', error.message);
    return res.status(502).json({ error: 'Blog delete failed', details: error.message });
  }
});

// Update a blog post by id (requires auth - ADMIN ONLY)
router.put('/blog/posts/:id', async (req, res) => {
  try {
    // Check if user is allowed to update (admin only)
    const userEmail = req.user?.email ? String(req.user.email).toLowerCase().trim() : '';
    if (!userEmail || !BLOG_PUBLISH_ALLOWED_EMAILS.includes(userEmail)) {
      return res.status(403).json({ error: 'Blog updates are restricted to administrators.' });
    }

    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const url = `${req._backendUrl}/blog/posts/${encodeURIComponent(id)}`;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }

    console.log('[BLOG-UPDATE] Updating post:', id, 'status:', req.body.status);

    const backendRes = await axiosWithPool.put(url, req.body, {
      headers,
      validateStatus: () => true,
    });

    if (backendRes.status !== 200) {
      console.error('[BLOG-UPDATE] Backend error:', backendRes.status, backendRes.data);
    }

    return res.status(backendRes.status).json(backendRes.data);
  } catch (error) {
    console.error('[BLOG-UPDATE] error:', error.message);
    return res.status(502).json({ error: 'Blog update failed', details: error.message });
  }
});

// ============= END BLOG PUBLISH API =============

// ============= OPTIMIZED SUGGEST ENDPOINTS =============
// These routes are critical for IME performance (target <100ms latency)

// Normalize backend suggest response to exact format: { success: true, suggestions: [ { word, score } ] }
function normalizeSuggestResponse(data) {
  const raw = (data && data.suggestions) ? data.suggestions : [];
  const suggestions = raw
    .map((s) => {
      const word = (s.word != null ? s.word : s.text != null ? s.text : s.ta) || '';
      const score = typeof s.score === 'number' ? Math.min(1, Math.max(0, s.score)) : 1;
      return word.trim() ? { word: word.trim(), score } : null;
    })
    .filter(Boolean);
  return { success: true, suggestions };
}

// Fallback when backend returns empty (e.g. backend not ready or no lexicon). Ensures short queries always get suggestions.
const BUILTIN_SUGGESTIONS = {
  t: [{ word: 'த்', score: 1 }, { word: 'ட', score: 0.9 }, { word: 'த', score: 0.85 }],
  ta: [{ word: 'தா', score: 1 }, { word: 'டா', score: 0.9 }, { word: 'த', score: 0.85 }, { word: 'ட', score: 0.8 }],
  n: [{ word: 'ன்', score: 1 }, { word: 'ண', score: 0.9 }, { word: 'ந', score: 0.85 }],
  na: [{ word: 'நா', score: 1 }, { word: 'ணா', score: 0.9 }, { word: 'னா', score: 0.85 }],
  k: [{ word: 'க்', score: 1 }, { word: 'க', score: 0.95 }],
  ka: [{ word: 'கா', score: 1 }, { word: 'க', score: 0.9 }],
  e: [{ word: 'எ', score: 1 }, { word: 'ஏ', score: 0.9 }],
  en: [{ word: 'என்', score: 1 }, { word: 'என', score: 0.95 }, { word: 'ஏன்', score: 0.9 }],
  enna: [{ word: 'என்ன', score: 1 }],
  a: [{ word: 'அ', score: 1 }, { word: 'ஆ', score: 0.95 }],
  am: [{ word: 'அம்', score: 1 }, { word: 'ஆம்', score: 0.95 }],
  amma: [{ word: 'அம்மா', score: 1 }],
  v: [{ word: 'வ்', score: 1 }, { word: 'வ', score: 0.95 }],
  va: [{ word: 'வா', score: 1 }, { word: 'வ', score: 0.9 }],
  s: [{ word: 'ச்', score: 1 }, { word: 'ச', score: 0.95 }],
  sa: [{ word: 'சா', score: 1 }, { word: 'ச', score: 0.9 }],
  p: [{ word: 'ப்', score: 1 }, { word: 'ப', score: 0.95 }],
  pa: [{ word: 'பா', score: 1 }, { word: 'ப', score: 0.9 }],
  m: [{ word: 'ம்', score: 1 }, { word: 'ம', score: 0.95 }],
  ma: [{ word: 'மா', score: 1 }, { word: 'ம', score: 0.9 }],
  r: [{ word: 'ர்', score: 1 }, { word: 'ர', score: 0.95 }],
  ra: [{ word: 'ரா', score: 1 }, { word: 'ர', score: 0.9 }],
  l: [{ word: 'ல்', score: 1 }, { word: 'ல', score: 0.95 }, { word: 'ள்', score: 0.9 }],
  la: [{ word: 'லா', score: 1 }, { word: 'ல', score: 0.9 }],
  i: [{ word: 'இ', score: 1 }, { word: 'ஈ', score: 0.9 }],
  u: [{ word: 'உ', score: 1 }, { word: 'ஊ', score: 0.9 }],
};

function getBuiltinSuggestions(q) {
  const key = String(q || '').toLowerCase().replace(/\s/g, '');
  if (!key) return [];
  if (BUILTIN_SUGGESTIONS[key]) return BUILTIN_SUGGESTIONS[key];
  for (let len = key.length - 1; len >= 1; len--) {
    const prefix = key.slice(0, len);
    if (BUILTIN_SUGGESTIONS[prefix]) return BUILTIN_SUGGESTIONS[prefix];
  }
  return [];
}

// Primary suggest endpoint used by workspace.js for IME (proxies to backend). Returns exact format: { success, suggestions: [{ word, score }] }.
router.get('/v1/suggest', async (req, res) => {
  const startTime = Date.now();
  try {
    const { q, mode = 'spoken', limit = 8 } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }

    const url = `${req._backendUrl}/transliterate/suggest?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`;
    const maxRetries = 4;
    const retryDelayMs = 1000;
    let response;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      response = await axiosWithPool.get(url, {
        validateStatus: () => true,
        timeout: 1500,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.status !== 503) break;
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, retryDelayMs));
    }

    res.set('Cache-Control', 'public, max-age=60');
    if (response.status === 503 || response.status !== 200) {
      const fallback = getBuiltinSuggestions(q);
      return res.status(200).json({ success: true, suggestions: fallback });
    }
    const out = normalizeSuggestResponse(response.data);
    if (out.suggestions.length === 0) {
      out.suggestions = getBuiltinSuggestions(q);
    }
    return res.status(200).json(out);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      console.log(`[SUGGEST] Timeout after ${elapsed}ms for q=${req.query.q}`);
      res.set('Cache-Control', 'no-cache');
      const fallback = getBuiltinSuggestions(req.query.q);
      return res.status(200).json({ success: true, suggestions: fallback });
    }
    console.error(`[SUGGEST] Error after ${elapsed}ms:`, error.message);
    const fallback = getBuiltinSuggestions(req.query.q);
    return res.status(200).json({ success: true, suggestions: fallback });
  }
});

// CRITICAL: IME suggestions endpoint MUST be before router.all('/*') catch-all
// IME suggestions endpoint - proxy to backend. Returns exact format: { success, suggestions: [{ word, score }] }.
router.get('/ime/suggest', async (req, res) => {
  const startTime = Date.now();
  try {
    const { q, mode = 'smart', limit = 8 } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const url = `${req._backendUrl}/ime/suggest?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`;
    const headers = {};
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;

    const response = await axiosWithPool.get(url, {
      headers,
      validateStatus: () => true,
      timeout: 1500,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    res.set('Cache-Control', 'public, max-age=60');
    if (response.status !== 200) {
      const fallback = getBuiltinSuggestions(q);
      return res.status(200).json({ success: true, suggestions: fallback });
    }
    const out = normalizeSuggestResponse(response.data);
    if (out.suggestions.length === 0) {
      out.suggestions = getBuiltinSuggestions(q);
    }
    return res.status(200).json(out);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      console.log(`[IME] Timeout after ${elapsed}ms for q=${req.query.q}`);
      res.set('Cache-Control', 'no-cache');
      const fallback = getBuiltinSuggestions(req.query.q);
      return res.status(200).json({ success: true, suggestions: fallback });
    }
    console.error(`[IME] Error after ${elapsed}ms:`, error.message);
    const fallback = getBuiltinSuggestions(req.query.q);
    return res.status(200).json({ success: true, suggestions: fallback });
  }
});

// ==================== ENHANCED EMAIL SPAM DETECTOR ====================
// NOTE: This route must be defined BEFORE the catch-all proxy routes below

// Classic spam keywords (high confidence indicators)
const SPAM_KEYWORDS_HIGH = [
  'winner', 'congratulations', 'you have won', 'claim your prize', 'lottery',
  'inheritance', 'million dollars', 'billion dollars', 'wire transfer',
  'nigerian prince', 'beneficiary', 'next of kin', 'dying wish',
  'viagra', 'cialis', 'pharmacy', 'enlarge', 'weight loss miracle',
  'casino', 'poker', 'gambling', 'bitcoin opportunity', 'crypto investment',
  'work from home', 'make money fast', 'earn $', 'double your',
  'password expired', 'account suspended', 'account locked', 'verify immediately',
  'social security', 'irs refund', 'tax refund'
];

// Medium confidence spam keywords
const SPAM_KEYWORDS_MEDIUM = [
  'act now', 'limited time', 'offer expires', 'don\'t miss out',
  'click here', 'click below', 'click now', 'buy now',
  'free gift', 'free offer', 'no cost', 'no obligation', 'risk free',
  'dear friend', 'dear customer', 'dear valued', 'dear winner',
  'urgent action', 'immediate attention', 'respond immediately',
  'verify your account', 'confirm your identity', 'update your information',
  'credit card required', 'order now', 'supplies limited',
  'once in a lifetime', 'exclusive deal', 'special promotion'
];

// Phishing indicators
const PHISHING_PATTERNS = [
  'verify your account', 'confirm your password', 'update your payment',
  'unusual activity', 'suspicious login', 'security alert',
  'your account will be', 'will be suspended', 'will be terminated',
  'click the link below', 'log in to verify', 'reset your password',
  'billing information', 'payment declined', 'invoice attached'
];

// Newsletter/marketing patterns (legitimate but bulk mail)
const NEWSLETTER_PATTERNS = [
  'unsubscribe', 'manage preferences', 'email preferences',
  'view in browser', 'view this email', 'view online',
  'you are receiving this', 'you received this email',
  'mailing list', 'newsletter', 'update your preferences',
  'powered by mailchimp', 'powered by constant contact', 'powered by glue up',
  'sent via', 'this email was sent to'
];

// Suspicious URL patterns
const SUSPICIOUS_URL_PATTERNS = [
  /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, // IP-based URLs
  /https?:\/\/[^\/]*@/i, // URLs with @ symbol (credential hiding)
  /https?:\/\/[a-z0-9]{20,}\./i, // Very long random subdomains
  /(bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|adf\.ly|j\.mp)/i, // URL shorteners
];

// Suspicious TLDs often used in spam/phishing
const SUSPICIOUS_TLDS = [
  '.xyz', '.top', '.work', '.click', '.link', '.tk', '.ml', '.ga', '.cf', '.gq',
  '.buzz', '.club', '.online', '.site', '.website', '.space', '.icu', '.cam'
];

// Known safe/legitimate domains (reduce false positives)
const SAFE_DOMAINS = [
  'google.com', 'gmail.com', 'youtube.com', 'facebook.com', 'twitter.com',
  'linkedin.com', 'microsoft.com', 'apple.com', 'amazon.com', 'paypal.com',
  'github.com', 'zoom.us', 'dropbox.com', 'mailchimp.com', 'eventbrite.com'
];

function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s<>"'\])+]+/gi;
  return (text.match(urlRegex) || []).map(u => u.replace(/[.,;:!?)]+$/, ''));
}

function extractDomain(url) {
  try {
    const match = url.match(/https?:\/\/([^\/\?#]+)/i);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function analyzeUrls(urls) {
  const analysis = {
    total: urls.length,
    shorteners: 0,
    ipBased: 0,
    suspiciousTld: 0,
    suspiciousPatterns: 0,
    uniqueDomains: new Set(),
    issues: []
  };

  for (const url of urls) {
    const domain = extractDomain(url);
    if (domain) analysis.uniqueDomains.add(domain);

    // Check for URL shorteners
    if (SUSPICIOUS_URL_PATTERNS[4].test(url)) {
      analysis.shorteners++;
    }

    // Check for IP-based URLs
    if (SUSPICIOUS_URL_PATTERNS[0].test(url)) {
      analysis.ipBased++;
      analysis.issues.push('IP-based URL detected (often used in phishing)');
    }

    // Check for @ in URL (credential hiding technique)
    if (SUSPICIOUS_URL_PATTERNS[1].test(url)) {
      analysis.suspiciousPatterns++;
      analysis.issues.push('URL contains @ symbol (credential hiding technique)');
    }

    // Check for suspicious TLDs
    for (const tld of SUSPICIOUS_TLDS) {
      if (domain.endsWith(tld)) {
        analysis.suspiciousTld++;
        break;
      }
    }
  }

  return analysis;
}

function analyzeHtmlPatterns(text) {
  const analysis = { issues: [], score: 0 };

  // Check for hidden text (common spam technique)
  if (/style\s*=\s*["'][^"']*color\s*:\s*(white|#fff|#ffffff|transparent)/i.test(text)) {
    analysis.issues.push('Hidden/invisible text detected');
    analysis.score += 15;
  }

  // Check for tracking pixels
  if (/<img[^>]*(?:width|height)\s*=\s*["']?[01](?:px)?["']?[^>]*>/i.test(text)) {
    analysis.issues.push('Tracking pixel detected');
    analysis.score += 5;
  }

  // Check for excessive images with no alt text
  const imgTags = text.match(/<img[^>]*>/gi) || [];
  const noAltImgs = imgTags.filter(img => !/alt\s*=/i.test(img)).length;
  if (noAltImgs > 5) {
    analysis.issues.push('Many images without alt text (possible image-based spam)');
    analysis.score += 10;
  }

  // Check for form elements (phishing indicator)
  if (/<form[^>]*>/i.test(text) && /<input[^>]*type\s*=\s*["']?password/i.test(text)) {
    analysis.issues.push('Password input form detected in email');
    analysis.score += 25;
  }

  // Check for JavaScript (should never be in email)
  if (/<script[^>]*>/i.test(text) || /javascript:/i.test(text)) {
    analysis.issues.push('JavaScript detected (dangerous)');
    analysis.score += 20;
  }

  return analysis;
}

function spamCheckHeuristic(subject, body) {
  const combined = ((subject || '') + '\n' + (body || '')).trim();
  const lower = combined.toLowerCase();
  let score = 0;
  const reasons = [];
  const warnings = [];

  // === HIGH CONFIDENCE SPAM KEYWORDS ===
  let highHits = 0;
  for (const kw of SPAM_KEYWORDS_HIGH) {
    if (lower.includes(kw)) highHits++;
  }
  if (highHits > 0) {
    score += Math.min(highHits * 8, 40);
    reasons.push(`High-risk spam keywords detected (${highHits})`);
  }

  // === MEDIUM CONFIDENCE SPAM KEYWORDS ===
  let medHits = 0;
  for (const kw of SPAM_KEYWORDS_MEDIUM) {
    if (lower.includes(kw)) medHits++;
  }
  if (medHits > 0) {
    score += Math.min(medHits * 3, 20);
    reasons.push(`Marketing/urgency phrases detected (${medHits})`);
  }

  // === PHISHING PATTERNS ===
  let phishHits = 0;
  for (const p of PHISHING_PATTERNS) {
    if (lower.includes(p)) phishHits++;
  }
  if (phishHits > 0) {
    score += Math.min(phishHits * 10, 35);
    reasons.push(`Phishing indicators detected (${phishHits})`);
  }

  // === NEWSLETTER DETECTION ===
  let newsletterHits = 0;
  for (const n of NEWSLETTER_PATTERNS) {
    if (lower.includes(n)) newsletterHits++;
  }
  if (newsletterHits >= 2) {
    // Don't add to spam score, but note it's bulk mail
    warnings.push('This appears to be a newsletter/marketing email (bulk mail indicators detected)');
  }

  // === CAPS RATIO ===
  let letters = 0, caps = 0;
  for (const c of combined) {
    if (/[a-zA-Z]/.test(c)) {
      letters++;
      if (c === c.toUpperCase() && c !== c.toLowerCase()) caps++;
    }
  }
  if (letters > 0) {
    const ratio = caps / letters;
    if (ratio > 0.5) { score += 15; reasons.push('High proportion of capital letters'); }
    else if (ratio > 0.3) { score += 8; reasons.push('Elevated use of caps'); }
  }

  // === URL ANALYSIS ===
  const urls = extractUrls(combined);
  const urlAnalysis = analyzeUrls(urls);

  if (urlAnalysis.ipBased > 0) {
    score += 20;
    reasons.push('IP-based URLs detected (common in phishing)');
  }

  if (urlAnalysis.suspiciousPatterns > 0) {
    score += 15;
  }

  if (urlAnalysis.shorteners > 0) {
    score += Math.min(urlAnalysis.shorteners * 5, 15);
    warnings.push(`URL shorteners detected (${urlAnalysis.shorteners}) - destination unknown`);
  }

  if (urlAnalysis.suspiciousTld > 0) {
    score += Math.min(urlAnalysis.suspiciousTld * 5, 15);
    reasons.push(`Suspicious domain TLDs detected (${urlAnalysis.suspiciousTld})`);
  }

  // Link density (adjusted - high density in newsletters is normal)
  const words = combined.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (words > 0 && newsletterHits < 2) {
    const linksPer100 = (urls.length / words) * 100;
    if (linksPer100 >= 15) { score += 15; reasons.push('Very high link density'); }
    else if (linksPer100 >= 8) { score += 8; reasons.push('High link density'); }
  }

  // === HTML ANALYSIS ===
  const htmlAnalysis = analyzeHtmlPatterns(combined);
  score += htmlAnalysis.score;
  reasons.push(...htmlAnalysis.issues);

  // === EXCESSIVE PUNCTUATION ===
  if (/!{3,}|\?{3,}/.test(combined)) {
    score += 8;
    reasons.push('Excessive punctuation');
  } else if (/!{2}|\?{2}/.test(combined)) {
    score += 3;
  }

  // === MONEY PATTERNS ===
  const moneyPattern = /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\s*(?:million|billion|thousand)\s*(?:dollars?|usd|\$)/gi;
  const moneyMatches = combined.match(moneyPattern) || [];
  if (moneyMatches.length > 2) {
    score += 10;
    reasons.push('Multiple money amounts mentioned');
  }

  // === GENERIC GREETING ===
  if (/^dear\s+(?:friend|customer|valued\s+customer|sir|madam|user|account\s*holder)/im.test(lower)) {
    score += 8;
    reasons.push('Generic greeting (common in spam/phishing)');
  }

  // === FINAL CALCULATION ===
  score = Math.min(score, 100);
  const isSpam = score >= 50;
  
  let confidence = 'low';
  if (score >= 75 || score <= 20) confidence = 'high';
  else if (score >= 60 || score <= 35) confidence = 'medium';

  // Deduplicate reasons
  const uniqueReasons = [...new Set(reasons)];

  return {
    is_spam: isSpam,
    score: Math.round(score * 100) / 100,
    confidence,
    reasons: uniqueReasons,
    warnings,
    analysis: {
      urls_found: urls.length,
      unique_domains: urlAnalysis.uniqueDomains.size,
      is_newsletter: newsletterHits >= 2,
      url_shorteners: urlAnalysis.shorteners,
      suspicious_urls: urlAnalysis.ipBased + urlAnalysis.suspiciousPatterns
    },
    disclaimer: 'This is a content-based heuristic analysis only. It cannot detect sender reputation, email authentication (SPF/DKIM/DMARC), or link destination safety. For comprehensive spam detection, use your email provider\'s built-in filters.'
  };
}

router.post('/spam-check', (req, res) => {
  try {
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const result = spamCheckHeuristic(subject, body);
    res.json(result);
  } catch (err) {
    console.error('[spam-check]', err);
    res.status(500).json({ error: 'Spam check failed' });
  }
});

// ==================== NEWSLETTER API ROUTES ====================
// These routes proxy newsletter requests to the Go backend

// Subscribe to newsletter
router.post('/newsletter/subscribe', async (req, res) => {
  try {
    const url = `${req._backendUrl}/newsletter/subscribe`;
    const response = await axiosWithPool.post(url, req.body, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[NEWSLETTER] Subscribe error:', error.message);
    res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
  }
});

// Confirm subscription (via email link)
router.get('/newsletter/confirm/:token', async (req, res) => {
  try {
    const url = `${req._backendUrl}/newsletter/confirm/${req.params.token}`;
    const response = await axiosWithPool.get(url, {
      validateStatus: () => true,
    });
    // Redirect to a success page or show message
    if (response.status === 200) {
      res.redirect('/?newsletter=confirmed');
    } else {
      res.redirect('/?newsletter=error');
    }
  } catch (error) {
    console.error('[NEWSLETTER] Confirm error:', error.message);
    res.redirect('/?newsletter=error');
  }
});

// Unsubscribe from newsletter
router.get('/newsletter/unsubscribe', async (req, res) => {
  try {
    const token = req.query.token;
    const email = req.query.email;
    const url = `${req._backendUrl}/newsletter/unsubscribe?token=${token || ''}&email=${email || ''}`;
    const response = await axiosWithPool.get(url, {
      validateStatus: () => true,
    });
    // Redirect to confirmation page
    if (response.status === 200) {
      res.redirect('/?newsletter=unsubscribed');
    } else {
      res.redirect('/?newsletter=error');
    }
  } catch (error) {
    console.error('[NEWSLETTER] Unsubscribe error:', error.message);
    res.redirect('/?newsletter=error');
  }
});

router.post('/newsletter/unsubscribe', async (req, res) => {
  try {
    const url = `${req._backendUrl}/newsletter/unsubscribe`;
    const response = await axiosWithPool.post(url, req.body, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[NEWSLETTER] Unsubscribe error:', error.message);
    res.status(500).json({ error: 'Failed to unsubscribe. Please try again.' });
  }
});

// Get subscriber count (public)
router.get('/newsletter/count', async (req, res) => {
  try {
    const url = `${req._backendUrl}/newsletter/count`;
    const response = await axiosWithPool.get(url, {
      validateStatus: () => true,
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[NEWSLETTER] Count error:', error.message);
    res.status(200).json({ count: 0 }); // Return 0 on error instead of failing
  }
});

// Proxy other API calls to Go backend
// IMPORTANT: This catch-all must be LAST to avoid intercepting specific routes like /submit
router.all('/*', async (req, res) => {
  // CRITICAL: Skip routes that are handled locally (not proxied to backend)
  const localRoutes = [
    { path: '/ime/suggest', method: 'GET' },
    { path: '/submit', method: 'POST' },
    { path: '/spam-check', method: 'POST' },
    { path: '/seo/validate', method: 'POST' },
    { path: '/seo/generate-meta', method: 'POST' },
    { path: '/seo/extract-keywords', method: 'POST' },
  ];
  
  for (const route of localRoutes) {
    if (req.path === route.path && req.method === route.method) {
      console.warn(`[API-ROUTER] ${route.path} route was intercepted by catch-all - this should not happen! Check route order.`);
      return res.status(404).json({ error: 'Route not found - check route order', path: req.path });
    }
  }
  try {
    // Normalize path to avoid double /v1 when BACKEND_URL already has /api/v1
    // Example: BACKEND_URL=/api/v1 and req.path=/v1/auth/register -> strip leading /v1
    let normalizedPath = req.path;
    if (req._backendUrl.endsWith('/api/v1') && normalizedPath.startsWith('/v1/')) {
      normalizedPath = normalizedPath.replace(/^\/v1/, '');
    }

    const url = `${req._backendUrl}${normalizedPath}`;
    
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

router.all('/v1/*', async (req, res) => {
  try {
    const path = req.path.replace('/v1', ''); // Remove /v1 prefix
    const url = `${req._backendUrl}${path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
    if (ENABLE_PROXY_LOGS) {
      console.log(`[PROXY] ${req.method} ${req.path} -> ${url}`);
    }
    
    const config = {
      method: req.method,
      url: url,
      headers: {
        ...req.headers,
        host: undefined, // Remove host header
      },
      data: req.body,
      params: req.query,
      maxRedirects: 0,
      validateStatus: () => true, // Don't throw on any status
    };
    
    // Forward authorization header if present
    if (req.headers.authorization) {
      config.headers.authorization = req.headers.authorization;
    }
    
    const response = await axios(config);
    
    // Forward status and headers
    res.status(response.status);
    Object.keys(response.headers).forEach(key => {
      if (key !== 'content-encoding' && key !== 'transfer-encoding') {
        res.setHeader(key, response.headers[key]);
      }
    });
    
    // Send response data
    res.send(response.data);
  } catch (error) {
    console.error('[PROXY] Error proxying request:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Proxy error', details: error.message });
    }
  }
});

module.exports = router;
