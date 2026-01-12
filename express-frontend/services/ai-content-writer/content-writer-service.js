const axios = require('axios');

// AI Content Writer Service - Wrapper for Python Flask API
// This service proxies requests to the Python Flask API running on port 5002

const AI_WRITER_API_URL = process.env.AI_WRITER_API_URL || 'http://localhost:5002';
const AI_WRITER_TIMEOUT = 60000; // 60 seconds for content generation

/**
 * Health check for AI Content Writer service
 */
async function healthCheck() {
  try {
    const response = await axios.get(`${AI_WRITER_API_URL}/api/health`, {
      timeout: 5000
    });
    return response.data;
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
    const response = await axios.post(
      `${AI_WRITER_API_URL}/api/generate-content`,
      options,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: AI_WRITER_TIMEOUT
      }
    );
    return response.data;
  } catch (error) {
    console.error('[AI-WRITER] Generate content error:', error.message);
    if (error.response) {
      throw new Error(error.response.data?.error || 'Content generation failed');
    }
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
    const response = await axios.post(
      `${AI_WRITER_API_URL}/api/improve-content`,
      options,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: AI_WRITER_TIMEOUT
      }
    );
    return response.data;
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
    const response = await axios.post(
      `${AI_WRITER_API_URL}/api/translate`,
      options,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: AI_WRITER_TIMEOUT
      }
    );
    return response.data;
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

