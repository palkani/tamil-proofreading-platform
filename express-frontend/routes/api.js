const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

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

    // Gemini config:
    // - In some deployments we use Replit AI Integrations (AI_INTEGRATIONS_*).
    // - In others we use Google GenAI directly (GOOGLE_GENAI_API_KEY).
    // Always allow direct Google mode with a sane default baseUrl.
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    const baseUrl =
      process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini AI not configured - API key missing' });
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
// Pure translation only: returns translated Tamil text (no proofreading pass after)
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
            text: `You are an expert English to Tamil translator.

TRANSLATION RULES:
1. Preserve the meaning and tone of the original text
2. Preserve the meaning and tone of the original text
3. Use natural Tamil grammar and sentence structure
4. For technical terms, provide the Tamil equivalent if available
5. Maintain paragraph structure

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
      maxRedirects: 0, // Don't follow redirects automatically
    });

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
      url: `${BACKEND_URL}/ocr/upload`,
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
        const url = `${BACKEND_URL}/ocr/upload`;
        if (ENABLE_PROXY_LOGS) console.log('[OCR] Using backend OCR proxy:', url);

        const formData = new FormData();
        formData.append('file', fileBuffer, { filename, contentType: mimeType });
        formData.append('lang', lang);

        const response = await axios.post(url, formData, {
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
      
      const response = await axios.post(`${OCR_SERVICE_URL}/upload`, formData, {
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
      const response = await axios.get(`${OCR_SERVICE_URL}/download/${filename}`, {
        responseType: 'stream'
      });
      
      res.setHeader('Content-Disposition', response.headers['content-disposition'] || `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      return response.data.pipe(res);
    }

    // Fallback to backend OCR proxy (Cloud Run backend) if available
    try {
      const response = await axios.get(`${BACKEND_URL}/ocr/download/${encodeURIComponent(filename)}`, {
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
    const url = `${BACKEND_URL}/submit`;
    
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
    
    const response = await axios.post(url, requestBody, {
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

// ============= AI CONTENT WRITER API ROUTES =============
// These routes proxy requests to the Python Flask API running on port 5002

// AI Content Writer health check
router.get('/ai-content-writer/health', async (req, res) => {
  try {
    if (!contentWriterService) {
      return res.status(503).json({
        status: 'unhealthy',
        service: 'AI Content Writer',
        error: 'Service not available'
      });
    }
    
    const health = await contentWriterService.healthCheck();
    if (health) {
      return res.json(health);
    } else {
      return res.status(503).json({
        status: 'unhealthy',
        service: 'AI Content Writer',
        error: 'Service health check failed'
      });
    }
  } catch (error) {
    console.error('[AI-CONTENT-WRITER] Health check error:', error.message);
    return res.status(503).json({
      status: 'unhealthy',
      service: 'AI Content Writer',
      error: error.message
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
const BLOG_PUBLISH_ALLOWED_EMAILS = ['palkani.r@gmail.com', 'prooftamil@gmail.com'];

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

    const url = `${BACKEND_URL}/blog/posts`;
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

    console.log('[BLOG-PUBLISH] Admin publishing:', userEmail);

    const backendRes = await axios.post(url, req.body, {
      headers,
      validateStatus: () => true,
    });

    // Log backend response for debugging
    if (backendRes.status !== 200 && backendRes.status !== 201) {
      console.error('[BLOG-PUBLISH] Backend error:', backendRes.status, backendRes.data);
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

    const url = `${BACKEND_URL}/blog/posts/${encodeURIComponent(id)}`;
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

    const backendRes = await axios.delete(url, {
      headers,
      validateStatus: () => true,
    });

    return res.status(backendRes.status).json(backendRes.data);
  } catch (error) {
    console.error('[BLOG-DELETE] error:', error.message);
    return res.status(502).json({ error: 'Blog delete failed', details: error.message });
  }
});

// ============= END BLOG PUBLISH API =============

// CRITICAL: IME suggestions endpoint MUST be before router.all('/*') catch-all
// IME suggestions endpoint - proxy to backend
router.get('/ime/suggest', async (req, res) => {
  try {
    console.log('[IME] Route handler called for GET /ime/suggest');
    console.log('[IME] Query params:', req.query);
    
    const { q, mode = 'smart', limit = 8 } = req.query;
    
    // Better validation with detailed error message
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      console.warn('[IME] Invalid query parameter - q is missing or empty');
      return res.status(400).json({ 
        error: 'Query parameter "q" is required and must be a non-empty string',
        received: { q: q, type: typeof q, length: q ? String(q).length : 0 }
      });
    }
    
    const url = `${BACKEND_URL}/ime/suggest?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${limit}`;
    
    if (ENABLE_PROXY_LOGS) {
      console.log(`[IME] GET ${url}`);
    }
    
    // Forward authorization header if present
    const headers = {};
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    
    const response = await axios.get(url, {
      headers,
      validateStatus: () => true,
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`[IME-ERROR] ${error.message}`);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'IME suggestion failed'
    });
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
    const url = `${BACKEND_URL}/newsletter/subscribe`;
    const response = await axios.post(url, req.body, {
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
    const url = `${BACKEND_URL}/newsletter/confirm/${req.params.token}`;
    const response = await axios.get(url, {
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
    const url = `${BACKEND_URL}/newsletter/unsubscribe?token=${token || ''}&email=${email || ''}`;
    const response = await axios.get(url, {
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
    const url = `${BACKEND_URL}/newsletter/unsubscribe`;
    const response = await axios.post(url, req.body, {
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
    const url = `${BACKEND_URL}/newsletter/count`;
    const response = await axios.get(url, {
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
  // CRITICAL: Also skip /ime/suggest to prevent double handling
  if (req.path === '/ime/suggest' && req.method === 'GET') {
    console.warn('[API-ROUTER] /ime/suggest route was intercepted by catch-all - this should not happen!');
    return res.status(404).json({ error: 'Route not found - check route order' });
  }
  // Skip if this is a route we've already handled
  if (req.path === '/submit' && req.method === 'POST') {
    // This should never happen if routes are in correct order, but log if it does
    console.warn('[API-ROUTER] /submit route was intercepted by catch-all - this should not happen!');
    return res.status(404).json({ error: 'Route not found - check route order' });
  }
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

router.all('/v1/*', async (req, res) => {
  try {
    const path = req.path.replace('/v1', ''); // Remove /v1 prefix
    const url = `${BACKEND_URL}${path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
    
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
