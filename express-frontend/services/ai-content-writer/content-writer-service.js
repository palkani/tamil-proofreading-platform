const axios = require('axios');

// AI Content Writer Service - Wrapper for Python Flask API
// This service proxies requests to the Python Flask API running on port 5002

const AI_WRITER_API_URL = process.env.AI_WRITER_API_URL || 'http://localhost:5002';
const AI_WRITER_TIMEOUT = 60000; // 60 seconds for content generation

function isLocalhostUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('localhost') || u.includes('127.0.0.1');
}

function getGeminiConfig() {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  return { apiKey, baseUrl };
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

async function geminiGenerate(systemText, userText, schema, maxOutputTokens = 2048) {
  const { apiKey, baseUrl } = getGeminiConfig();
  if (!apiKey) {
    throw createServiceError(
      'AI Content Writer is not configured',
      'Missing Gemini API key. Set AI_INTEGRATIONS_GEMINI_API_KEY (preferred) or GOOGLE_GENAI_API_KEY in production env.'
    );
  }

  const response = await axios.post(
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
    const msg =
      response.data?.error?.message ||
      response.data?.error ||
      `Gemini API failed (${response.status})`;
    throw createServiceError('Gemini API error', msg);
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
    const { apiKey } = getGeminiConfig();
    if (apiKey) {
      return {
        status: 'healthy',
        service: 'AI Content Writer (Gemini fallback)',
        version: '1.0.0',
      };
    }

    return null;
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

    const systemText = `You are an expert content writer.
Task: Produce a high-quality ${content_type}.
Tone: ${tone}
Target length: ~${word_count} words.
${languageRule}

Output MUST be valid JSON only. Do not include markdown fences, explanations, or extra text.`;

    const userText = `Topic/prompt:\n${prompt}\n\nRequirements:\n- include_title: ${include_title}\n- include_meta: ${include_meta}\n\nReturn JSON with shape:\n{\n  \"success\": true,\n  \"content\": {\"title\": \"\", \"meta_description\": \"\", \"keywords\": \"\", \"content\": \"\"},\n  \"metadata\": {\"word_count\": ${word_count}, \"language\": \"${language}\", \"content_type\": \"${content_type}\", \"model\": \"gemini-2.5-flash\"}\n}\n\nRules:\n- If include_title is false, set title to empty string.\n- If include_meta is false, set meta_description and keywords to empty string.\n- content should use paragraphs separated by blank lines.`;

    // Try with schema first; if schema causes provider-side failure, fall back to plain JSON mime type.
    let result;
    try {
      result = await geminiGenerate(systemText, userText, schema, 3072);
    } catch (e) {
      const msg = String(e?.message || '');
      const details = e?.details ? String(e.details) : '';
      const looksLikeSchemaIssue =
        msg.toLowerCase().includes('schema') ||
        details.toLowerCase().includes('schema') ||
        details.toLowerCase().includes('response schema');
      if (!looksLikeSchemaIssue) throw e;
      console.warn('[AI-WRITER] Schema mode failed, retrying without responseSchema:', { msg, details });
      result = await geminiGenerate(systemText, userText, null, 3072);
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

module.exports = {
  healthCheck,
  generateContent,
  improveContent,
  translateContent
};

