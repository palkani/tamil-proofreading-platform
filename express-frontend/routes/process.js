/**
 * Process Route - Text processing with AI integration
 * POST /api/process - Main text processing endpoint
 */

const express = require('express');
const router = express.Router();
const rateLimiter = require('../middleware/rateLimiter');

// Max character limit for validation
const MAX_CHARS = 3000;

/**
 * Mock AI function - Replace with real AI call in production
 * @param {string} text - Input text
 * @param {string} mode - Processing mode (proofread, translate, etc)
 * @returns {Promise<Object>} AI response
 */
async function callAIEngine(text, mode) {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Mock response based on mode
  const mockResponses = {
    proofread: {
      success: true,
      mode: 'proofread',
      original: text,
      corrected: text,
      suggestions: [
        {
          original: 'word1',
          corrected: 'word1',
          reason: 'Grammar correction',
          type: 'grammar',
        },
      ],
      processingTime: 0.5,
    },
    translate: {
      success: true,
      mode: 'translate',
      original: text,
      translated: `[Translated to Tamil]: ${text}`,
      confidence: 0.95,
      processingTime: 0.5,
    },
    analyze: {
      success: true,
      mode: 'analyze',
      original: text,
      analysis: {
        readability: 'Medium',
        complexity: 'Advanced',
        suggestions: ['Break into shorter sentences', 'Use simpler vocabulary'],
      },
      processingTime: 0.5,
    },
  };

  return mockResponses[mode] || mockResponses.proofread;
}

/**
 * POST /api/process
 * Process text with AI engine
 * Query parameters: none
 * Body: { text: string, mode?: string }
 * Response: { success: boolean, data?: object, error?: string }
 */
router.post('/', rateLimiter(3, 60), async (req, res) => {
  try {
    const { text, mode = 'proofread' } = req.body;

    // Validation: text is required
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text is required and must be a string.',
      });
    }

    // Validation: text length
    if (text.length > MAX_CHARS) {
      return res.status(400).json({
        success: false,
        error: `Text exceeds ${MAX_CHARS}-character limit. Current length: ${text.length}.`,
      });
    }

    // Validation: mode is valid
    const validModes = ['proofread', 'translate', 'analyze'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid mode. Valid modes: ${validModes.join(', ')}`,
      });
    }

    // Call AI engine
    const result = await callAIEngine(text, mode);

    // Attach rate limit info to response headers
    res.set({
      'X-RateLimit-Limit': req.rateLimit.limit,
      'X-RateLimit-Remaining': req.rateLimit.remaining,
      'X-RateLimit-Reset': new Date(req.rateLimit.resetTime).toISOString(),
    });

    res.status(200).json({
      success: true,
      data: result,
      metadata: {
        rateLimit: {
          remaining: req.rateLimit.remaining,
          limit: req.rateLimit.limit,
          resetAt: new Date(req.rateLimit.resetTime).toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[PROCESS] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again later.',
    });
  }
});

module.exports = router;
