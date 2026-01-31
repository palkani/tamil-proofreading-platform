const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

// AI Content Writer Service - Wrapper for Python Flask API
// This service proxies requests to the Python Flask API running on port 5002

const AI_WRITER_API_URL = process.env.AI_WRITER_API_URL || 'http://localhost:5002';
const AI_WRITER_TIMEOUT = 60000; // 60 seconds for content generation

// ============= RESPONSE CACHE =============
// Cache generated content to reduce API calls and avoid rate limits
const CONTENT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CONTENT_CACHE_MAX_SIZE = 100; // Max cached responses

class ContentCache {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  _generateKey(options) {
    // Create a hash of the request parameters
    const keyData = JSON.stringify({
      prompt: options.prompt,
      language: options.language,
      content_type: options.content_type,
      tone: options.tone,
      word_count: options.word_count,
      include_title: options.include_title,
      include_meta: options.include_meta,
    });
    return crypto.createHash('md5').update(keyData).digest('hex');
  }

  get(options) {
    const key = this._generateKey(options);
    const entry = this.cache.get(key);
    
    if (entry && Date.now() < entry.expiresAt) {
      this.stats.hits++;
      console.log(`[CONTENT-CACHE] Hit for prompt: "${String(options.prompt).substring(0, 50)}..."`);
      return entry.data;
    }
    
    this.stats.misses++;
    return null;
  }

  set(options, data) {
    // Evict oldest entry if cache is full
    if (this.cache.size >= CONTENT_CACHE_MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const key = this._generateKey(options);
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + CONTENT_CACHE_TTL,
    });
    console.log(`[CONTENT-CACHE] Cached response for prompt: "${String(options.prompt).substring(0, 50)}..."`);
  }

  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[CONTENT-CACHE] Cleaned ${cleaned} expired entries`);
    }
  }

  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
        : '0%',
    };
  }
}

const contentCache = new ContentCache();
// ============= END RESPONSE CACHE =============

// HTTPS Agent with keep-alive for stable Gemini API connections
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 20,
  maxFreeSockets: 10,
  timeout: AI_WRITER_TIMEOUT,
});

// Axios instance with connection pooling
const geminiAxios = axios.create({
  httpsAgent: httpsAgent,
  timeout: AI_WRITER_TIMEOUT,
});

function isLocalhostUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('localhost') || u.includes('127.0.0.1');
}

// Use shared key rotator for consistent key management across all services
const { keyRotator } = require('../../utils/gemini-key-rotator');

function getGeminiConfig() {
  const keyInfo = keyRotator.getNextKey();
  const apiKey = keyInfo ? keyInfo.key : null;
  const keyIndex = keyInfo ? keyInfo.index : -1;
  const baseUrl = keyRotator.baseUrl;
  return { apiKey, baseUrl, keyIndex };
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function extractFirstJsonObject(text) {
  const s = String(text || '').trim();
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return s.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function createServiceError(message, details) {
  const err = new Error(message);
  err.details = details;
  return err;
}

function looksTruncatedJson(text) {
  const s = String(text || '').trim();
  if (!s.startsWith('{')) return false;
  // Common truncation: doesn't end with closing brace, often ends mid-string.
  if (!s.endsWith('}')) return true;
  return false;
}

function chooseMaxOutputTokens(requestedWordCount) {
  const wc = Number(requestedWordCount);
  if (!Number.isFinite(wc) || wc <= 0) return 8192;
  // More generous token allocation to avoid truncation
  // Approximate: 1 word ≈ 1.5 tokens for English, more for Tamil
  // Add extra buffer for JSON structure
  const estimatedTokens = Math.ceil(wc * 2.5) + 1024; // 2.5x multiplier + 1024 buffer for JSON
  // Clamp between 4096 and 16384
  return Math.max(4096, Math.min(16384, estimatedTokens));
}

async function geminiGenerate(systemText, userText, schema, maxOutputTokens = 2048, retryCount = 0) {
  const maxRetries = Math.min(keyRotator.getKeyCount(), 3); // Max 3 retries across different keys
  const { apiKey, baseUrl, keyIndex } = getGeminiConfig();
  
  if (!apiKey) {
    throw createServiceError(
      'AI Content Writer is not configured',
      `Missing Gemini API key. Set GEMINI_API_KEY_1 (or GEMINI_API_KEY_2, etc.) in Vercel environment variables. You can get free keys from https://aistudio.google.com/apikey`
    );
  }

  const keyLabel = keyRotator.getKeyCount() > 1 ? ` (key ${keyIndex + 1}/${keyRotator.getKeyCount()})` : '';
  
  const response = await geminiAxios.post(
    `${baseUrl}/models/gemini-2.5-flash:generateContent`,
    {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens,
        responseMimeType: 'application/json',
        ...(schema ? { responseSchema: schema } : {}),
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      timeout: AI_WRITER_TIMEOUT,
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    const errorMsg =
      response.data?.error?.message ||
      response.data?.error ||
      `Gemini API failed (${response.status})`;
    
    // Log full error details for debugging
    console.error(`[AI-WRITER] Gemini API error${keyLabel}:`, {
      status: response.status,
      error: response.data?.error,
      message: errorMsg,
      retryCount,
    });
    
    // Handle rate limiting with automatic key rotation
    if (response.status === 429) {
      keyRotator.markRateLimited(keyIndex);
      
      // Retry with a different key if available
      if (retryCount < maxRetries && keyRotator.getAvailableKeyCount() > 0) {
        console.log(`[AI-WRITER] Rate limited on key ${keyIndex + 1}, trying another key (attempt ${retryCount + 2}/${maxRetries + 1})`);
        return geminiGenerate(systemText, userText, schema, maxOutputTokens, retryCount + 1);
      }
      
      const waitTime = keyRotator.getSecondsUntilAvailable();
      const status = keyRotator.getStatus();
      console.error('[AI-WRITER] All keys rate limited:', status);
      
      throw createServiceError(
        'Rate limit exceeded', 
        `All ${status.totalKeys} API key(s) are rate limited. Please wait ${waitTime} seconds and try again.`
      );
    }
    
    if (response.status === 403) {
      throw createServiceError('API key invalid', `Gemini API key${keyLabel} is invalid or has insufficient permissions. Please check your API key configuration.`);
    }
    if (response.status === 400) {
      throw createServiceError('Invalid request', errorMsg || 'The request to Gemini API was malformed. Please try with different content.');
    }
    
    throw createServiceError('Gemini API error', errorMsg);
  }

  const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = safeJsonParse(aiText, null);
  if (parsed) return parsed;

  // Sometimes Gemini wraps JSON in prose; try to extract the first JSON object.
  const extracted = extractFirstJsonObject(aiText);
  if (extracted) {
    const parsedExtracted = safeJsonParse(extracted, null);
    if (parsedExtracted) return parsedExtracted;
  }

  if (looksTruncatedJson(aiText)) {
    throw createServiceError(
      'Gemini response was truncated',
      `Gemini returned incomplete JSON (likely due to output length). Try reducing word count or disabling meta/keywords. First 300 chars: ${String(aiText).trim().slice(0, 300)}`
    );
  }

  throw createServiceError(
    'Gemini response was not valid JSON',
    `Could not parse JSON response. First 300 chars: ${String(aiText).trim().slice(0, 300)}`
  );
}

/**
 * Health check for AI Content Writer service
 */
async function healthCheck() {
  try {
    // Prefer the Python service in local/dev if configured and not localhost-only in prod.
    if (AI_WRITER_API_URL && !isLocalhostUrl(AI_WRITER_API_URL)) {
      const response = await axios.get(`${AI_WRITER_API_URL}/api/health`, {
        timeout: 5000,
        validateStatus: () => true,
      });
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }
    }

    // Fallback: report healthy if Gemini is configured (production path)
    const totalKeys = keyRotator.getKeyCount();
    const availableKeys = keyRotator.getAvailableKeyCount();
    
    if (totalKeys > 0) {
      return {
        status: availableKeys > 0 ? 'healthy' : 'degraded',
        service: 'AI Content Writer (Gemini)',
        version: '1.0.0',
        keys: {
          total: totalKeys,
          available: availableKeys,
          rateLimited: totalKeys - availableKeys,
        },
        cache: contentCache.getStats(),
      };
    }

    return {
      status: 'unhealthy',
      service: 'AI Content Writer',
      error: 'No API keys configured',
      help: 'Set GEMINI_API_KEY_1 in environment variables. Get free keys at https://aistudio.google.com/apikey',
    };
  } catch (error) {
    console.error('[AI-WRITER] Health check failed:', error.message);
    return null;
  }
}

/**
 * Generate content using AI
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated content
 */
async function generateContent(options) {
  try {
    // Check cache first to avoid unnecessary API calls
    const cachedResult = contentCache.get(options);
    if (cachedResult) {
      return cachedResult;
    }

    // Use Python API if it's configured to a non-localhost URL (deployed service).
    if (AI_WRITER_API_URL && !isLocalhostUrl(AI_WRITER_API_URL)) {
      const response = await axios.post(
        `${AI_WRITER_API_URL}/api/generate-content`,
        options,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: AI_WRITER_TIMEOUT,
        }
      );
      // Cache the response
      if (response.data && response.data.success) {
        contentCache.set(options, response.data);
      }
      return response.data;
    }

    // Production-safe fallback: generate using Gemini directly.
    const {
      prompt,
      language = 'english',
      content_type = 'blog',
      tone = 'professional',
      word_count = 500,
      include_title = true,
      include_meta = false,
    } = options || {};

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required');
    }

    const schema = {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        content: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            meta_description: { type: 'string' },
            keywords: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['content'],
        },
        metadata: {
          type: 'object',
          properties: {
            word_count: { type: 'integer' },
            language: { type: 'string' },
            content_type: { type: 'string' },
            model: { type: 'string' },
          },
          required: ['word_count', 'language', 'content_type', 'model'],
        },
      },
      required: ['success', 'content', 'metadata'],
    };

    const languageRule =
      String(language).toLowerCase() === 'tamil'
        ? 'Write the full content in Tamil (தமிழ்) only.'
        : String(language).toLowerCase() === 'bilingual'
          ? 'Write bilingual content: Tamil first, then English translation for each paragraph.'
          : 'Write the full content in English only.';

    const safeWordCount = Math.max(100, Math.min(3000, Number(word_count) || 500));

    const systemText = `You are an expert content writer.
Task: Produce a high-quality ${content_type}.
Tone: ${tone}
${languageRule}

CRITICAL WORD COUNT REQUIREMENT:
- You MUST write EXACTLY ${safeWordCount} words (±10% tolerance)
- Do NOT write less than ${Math.floor(safeWordCount * 0.9)} words
- Do NOT write more than ${Math.ceil(safeWordCount * 1.1)} words
- Count words carefully before submitting

Output MUST be valid JSON only. Do not include markdown fences, explanations, or extra text.`;

    const userText = `Topic/prompt:\n${prompt}\n\nWORD COUNT: Write EXACTLY ${safeWordCount} words of content.\n\nRequirements:\n- include_title: ${include_title}\n- include_meta: ${include_meta}\n\nReturn JSON with shape:\n{\n  \"success\": true,\n  \"content\": {\"title\": \"\", \"meta_description\": \"\", \"keywords\": \"\", \"content\": \"\"},\n  \"metadata\": {\"word_count\": <actual_word_count>, \"language\": \"${language}\", \"content_type\": \"${content_type}\", \"model\": \"gemini-2.5-flash\"}\n}\n\nRules:\n- If include_title is false, set title to empty string.\n- If include_meta is false, set meta_description and keywords to empty string.\n- content should use paragraphs separated by blank lines.\n- IMPORTANT: metadata.word_count should reflect the ACTUAL word count of the content you wrote.`;

    // Try with schema first; if schema causes provider-side failure, fall back to plain JSON mime type.
    let result;
    try {
      result = await geminiGenerate(systemText, userText, schema, chooseMaxOutputTokens(safeWordCount));
    } catch (e) {
      const msg = String(e?.message || '');
      const details = e?.details ? String(e.details) : '';
      const looksLikeSchemaIssue =
        msg.toLowerCase().includes('schema') ||
        details.toLowerCase().includes('schema') ||
        details.toLowerCase().includes('response schema');
      const looksTruncated =
        msg.toLowerCase().includes('truncated') ||
        details.toLowerCase().includes('incomplete json') ||
        details.toLowerCase().includes('truncated');
      if (!looksLikeSchemaIssue && !looksTruncated) throw e;

      if (looksLikeSchemaIssue) {
        console.warn('[AI-WRITER] Schema mode failed, retrying without responseSchema:', { msg, details });
        result = await geminiGenerate(systemText, userText, null, chooseMaxOutputTokens(safeWordCount));
      } else {
        // Truncation: retry with higher token limit but KEEP the original word count
        const retryTokens = Math.min(32768, chooseMaxOutputTokens(safeWordCount) * 2); // Double the tokens

        const retrySystemText = `${systemText}\n\nIMPORTANT: Ensure JSON is complete and valid. Do not truncate.`;

        console.warn('[AI-WRITER] Gemini output truncated; retrying with higher token limit', { word_count: safeWordCount, retryTokens });
        result = await geminiGenerate(retrySystemText, userText, null, retryTokens); // Skip schema on retry
      }
    }

    // If Gemini responded but was truncated, retry once with a shorter target length.
    // This is better UX than forcing the user to manually lower word count.
    if (!result || result.success !== true) {
      // no-op: handled below
    }

    if (!result || result.success !== true) {
      throw createServiceError(
        'Content generation failed',
        `Invalid AI response: ${JSON.stringify(result).slice(0, 400)}`
      );
    }
    // Ensure metadata model is set
    result.metadata = result.metadata || {};
    result.metadata.model = result.metadata.model || 'gemini-2.5-flash';
    
    // Cache the successful result
    contentCache.set(options, result);
    
    return result;
  } catch (error) {
    console.error('[AI-WRITER] Generate content error:', error.message);
    throw error;
  }
}

/**
 * Improve existing content
 * @param {Object} options - Improvement options
 * @returns {Promise<Object>} Improved content
 */
async function improveContent(options) {
  try {
    if (AI_WRITER_API_URL && !isLocalhostUrl(AI_WRITER_API_URL)) {
      const response = await axios.post(
        `${AI_WRITER_API_URL}/api/improve-content`,
        options,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: AI_WRITER_TIMEOUT,
        }
      );
      return response.data;
    }

    const { content, improvement_type = 'improve', language = 'english' } = options || {};
    if (!content || typeof content !== 'string') {
      throw new Error('Content is required');
    }

    const schema = {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        original: { type: 'string' },
        improved: { type: 'string' },
      },
      required: ['success', 'original', 'improved'],
    };

    const systemText = `You are an expert editor. Improve the given text.
Language: ${language}
Improvement type: ${improvement_type}
Return ONLY valid JSON.`;

    const userText = `Original text:\n${content}\n\nReturn JSON:\n{\"success\": true, \"original\": \"...\", \"improved\": \"...\"}\n\nRules:\n- improved must preserve meaning but enhance clarity and correctness.\n- Keep paragraph breaks.`;

    const result = await geminiGenerate(systemText, userText, schema, 2048);
    if (!result || result.success !== true) {
      throw new Error('Content improvement failed');
    }
    return result;
  } catch (error) {
    console.error('[AI-WRITER] Improve content error:', error.message);
    if (error.response) {
      throw new Error(error.response.data?.error || 'Content improvement failed');
    }
    throw error;
  }
}

/**
 * Translate content between languages
 * @param {Object} options - Translation options
 * @returns {Promise<Object>} Translated content
 */
async function translateContent(options) {
  try {
    if (AI_WRITER_API_URL && !isLocalhostUrl(AI_WRITER_API_URL)) {
      const response = await axios.post(
        `${AI_WRITER_API_URL}/api/translate`,
        options,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: AI_WRITER_TIMEOUT,
        }
      );
      return response.data;
    }

    const { content, from_language = 'english', to_language = 'tamil' } = options || {};
    if (!content || typeof content !== 'string') {
      throw new Error('Content is required');
    }

    const schema = {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        original: { type: 'string' },
        translated: { type: 'string' },
        from_language: { type: 'string' },
        to_language: { type: 'string' },
      },
      required: ['success', 'original', 'translated', 'from_language', 'to_language'],
    };

    const systemText = `You are an expert translator.
Translate from ${from_language} to ${to_language}.
Return ONLY valid JSON.`;

    const userText = `Text to translate:\n${content}\n\nReturn JSON:\n{\"success\": true, \"original\": \"...\", \"translated\": \"...\", \"from_language\": \"${from_language}\", \"to_language\": \"${to_language}\"}\n\nRules:\n- Keep paragraph breaks.\n- Preserve meaning and tone.`;

    const result = await geminiGenerate(systemText, userText, schema, 2048);
    if (!result || result.success !== true) {
      throw new Error('Translation failed');
    }
    return result;
  } catch (error) {
    console.error('[AI-WRITER] Translate content error:', error.message);
    if (error.response) {
      throw new Error(error.response.data?.error || 'Translation failed');
    }
    throw error;
  }
}

function countWords(text) {
  const s = String(text || '').trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function readingTimeMinutes(text) {
  const wc = countWords(text);
  // 200 wpm heuristic
  return Math.max(1, Math.ceil(wc / 200));
}

function makeExcerpt(text, maxLen = 180) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).replace(/\s+\S*$/, '').trim() + '…';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a deterministic blog template (no AI required).
 * Returns HTML plus excerpt and readingTimeMinutes.
 */
async function renderBlogTemplate(options) {
  const {
    template_id = 'minimal',
    title = '',
    content = '',
    language = 'tamil',
    meta_description = '',
    keywords = '',
  } = options || {};

  const safeTitle = String(title || '').trim() || 'Untitled';
  const contentText = String(content || '').trim();
  const paragraphs = contentText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const readMins = readingTimeMinutes(contentText);
  const excerpt = String(meta_description || '').trim() || makeExcerpt(contentText, 190);

  const bodyHtml = paragraphs
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  // Template variants differ in header + section styling, but remain simple + safe.
  let headerKicker = '';
  let subhead = '';
  if (template_id === 'howto') {
    headerKicker = 'How-to';
    subhead = `${readMins} min read • ${escapeHtml(language)}`;
  } else if (template_id === 'story') {
    headerKicker = 'Story';
    subhead = `${readMins} min read • ${escapeHtml(language)}`;
  } else {
    headerKicker = 'Blog';
    subhead = `${readMins} min read • ${escapeHtml(language)}`;
  }

  const html = `
<article class="prooftamil-blog ${escapeHtml(template_id)}" data-template="${escapeHtml(template_id)}">
  <header>
    <div class="kicker">${escapeHtml(headerKicker)}</div>
    <h1>${escapeHtml(safeTitle)}</h1>
    <div class="subhead">${subhead}</div>
    ${excerpt ? `<p class="excerpt">${escapeHtml(excerpt)}</p>` : ''}
    ${keywords ? `<p class="keywords">${escapeHtml(keywords)}</p>` : ''}
  </header>
  <section class="content">
    ${bodyHtml}
  </section>
</article>`.trim();

  return {
    success: true,
    template_id,
    html,
    excerpt,
    reading_time_minutes: readMins,
    language,
  };
}

/**
 * Generate social variants (LinkedIn/Facebook/Instagram Reels pack) using Gemini.
 * Copy/export only; no direct posting.
 */
async function generateSocialVariants(options) {
  const {
    title = '',
    content = '',
    language = 'tamil',
    tone = 'professional',
    reels_duration_seconds = 30,
  } = options || {};

  const baseTitle = String(title || '').trim();
  const baseContent = String(content || '').trim();
  if (!baseContent) {
    throw createServiceError('Content is required', 'Provide content to generate social variants.');
  }

  const duration = [15, 30, 60].includes(Number(reels_duration_seconds))
    ? Number(reels_duration_seconds)
    : 30;

  const schema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      variants: {
        type: 'object',
        properties: {
          linkedin: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          facebook: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          instagram_reels: {
            type: 'object',
            properties: {
              duration_seconds: { type: 'integer' },
              hook: { type: 'string' },
              scene_beats: { type: 'array', items: { type: 'string' } },
              voiceover_script: { type: 'string' },
              on_screen_text: { type: 'array', items: { type: 'string' } },
              caption: { type: 'string' },
              hashtags: { type: 'array', items: { type: 'string' } },
            },
            required: [
              'duration_seconds',
              'hook',
              'scene_beats',
              'voiceover_script',
              'on_screen_text',
              'caption',
              'hashtags',
            ],
          },
        },
        required: ['linkedin', 'facebook', 'instagram_reels'],
      },
      metadata: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          tone: { type: 'string' },
          model: { type: 'string' },
        },
        required: ['language', 'tone', 'model'],
      },
    },
    required: ['success', 'variants', 'metadata'],
  };

  const languageRule =
    String(language).toLowerCase() === 'tamil'
      ? 'Write outputs in Tamil (தமிழ்) only.'
      : String(language).toLowerCase() === 'bilingual'
        ? 'Write bilingual outputs: Tamil first, then English.'
        : 'Write outputs in English only.';

  const systemText = `You are a social media copywriter.
Tone: ${tone}
${languageRule}

Return ONLY valid JSON (no markdown).
LinkedIn: keep under 2500 characters, include line breaks and a gentle CTA.
Facebook: concise, friendly, shareable.
Instagram Reels: produce a creator pack with hook + beats + voiceover + on-screen text + caption + hashtags.
Avoid sensitive claims and avoid hallucinating facts.`;

  const userText = `Title: ${baseTitle}
Content:
${baseContent}

Instagram Reels duration: ${duration} seconds.

Return JSON with shape:
{
  "success": true,
  "variants": {
    "linkedin": {"text": "..."},
    "facebook": {"text": "..."},
    "instagram_reels": {
      "duration_seconds": ${duration},
      "hook": "...",
      "scene_beats": ["..."],
      "voiceover_script": "...",
      "on_screen_text": ["..."],
      "caption": "...",
      "hashtags": ["#..."]
    }
  },
  "metadata": {"language": "${language}", "tone": "${tone}", "model": "gemini-2.5-flash"}
}`;

  const result = await geminiGenerate(systemText, userText, schema, 3072);
  if (!result || result.success !== true) {
    throw createServiceError('Social variant generation failed', `Invalid AI response: ${JSON.stringify(result).slice(0, 400)}`);
  }
  result.metadata = result.metadata || {};
  result.metadata.model = result.metadata.model || 'gemini-2.5-flash';
  return result;
}

/**
 * Generate catchy, realistic event name suggestions (Tamil/English/Bilingual).
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function generateEventNames(options) {
  const {
    language = 'tamil', // tamil | english | bilingual
    event_type = 'Community event',
    audience = '',
    location = '',
    date = '',
    theme = '',
    tone = 'professional', // professional | casual | academic | creative | persuasive
    count = 10,
    keywords = '',
  } = options || {};

  const safeCount = Math.max(3, Math.min(20, Number(count) || 10));
  const languageRule =
    String(language).toLowerCase() === 'tamil'
      ? 'All suggestions must be in Tamil (தமிழ்) only.'
      : String(language).toLowerCase() === 'bilingual'
        ? 'For each suggestion, provide Tamil name first and an English name as a secondary field.'
        : 'All suggestions must be in English only.';

  const schema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            english_name: { type: 'string' },
            tagline: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['name'],
        },
      },
      metadata: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          tone: { type: 'string' },
          model: { type: 'string' },
          count: { type: 'integer' },
        },
        required: ['language', 'tone', 'model', 'count'],
      },
    },
    required: ['success', 'suggestions', 'metadata'],
  };

  const systemText = `You are a branding assistant for events.
Task: Suggest ${safeCount} catchy, realistic event names.
Tone: ${tone}
${languageRule}

Rules:
- Names must feel realistic (like real event titles).
- Avoid childish names unless tone=creative.
- Avoid repeats and near-duplicates.
- Keep names concise (2-6 words typical).
- Return ONLY valid JSON. No markdown, no extra text.`;

  const userText = `Event details:
- event_type: ${event_type}
- audience: ${audience}
- location: ${location}
- date: ${date}
- theme: ${theme}
- keywords: ${keywords}

Return JSON:
{
  "success": true,
  "suggestions": [
    {"name":"...", "english_name":"...", "tagline":"...", "reason":"..."}
  ],
  "metadata": {"language":"${language}", "tone":"${tone}", "model":"gemini-2.5-flash", "count": ${safeCount}}
}

Notes:
- Only include english_name when language=bilingual (otherwise set to empty string).
- tagline/reason can be empty strings, but name must be non-empty.`;

  const result = await geminiGenerate(systemText, userText, schema, 2048);
  if (!result || result.success !== true) {
    throw createServiceError('Event name generation failed', `Invalid AI response: ${JSON.stringify(result).slice(0, 400)}`);
  }
  result.metadata = result.metadata || {};
  result.metadata.model = result.metadata.model || 'gemini-2.5-flash';
  result.metadata.count = Number(result.metadata.count || safeCount);
  return result;
}

module.exports = {
  healthCheck,
  generateContent,
  improveContent,
  translateContent,
  renderBlogTemplate,
  generateSocialVariants,
  generateEventNames
};

