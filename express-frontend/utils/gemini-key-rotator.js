/**
 * Gemini API Key Rotator
 * 
 * Manages multiple API keys with automatic rotation and failover.
 * Helps distribute load across multiple free API keys to avoid rate limits.
 * 
 * Setup:
 * 1. Go to https://aistudio.google.com/apikey
 * 2. Create 2-3 API keys
 * 3. Add them to Vercel environment variables:
 *    - GEMINI_API_KEY_1
 *    - GEMINI_API_KEY_2
 *    - GEMINI_API_KEY_3
 */

class GeminiKeyRotator {
  constructor() {
    this.keys = this._loadKeys();
    this.currentIndex = 0;
    this.keyStatus = {}; // Track rate-limited keys with cooldown
    this.baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    
    if (this.keys.length > 0) {
      console.log(`[GEMINI] ✓ Loaded ${this.keys.length} API key(s) for rotation`);
      // Log which key variables are set (without showing the actual keys)
      for (let i = 1; i <= 10; i++) {
        if (process.env[`GEMINI_API_KEY_${i}`]) {
          console.log(`[GEMINI]   - GEMINI_API_KEY_${i}: configured ✓`);
        }
      }
    } else {
      console.warn('[GEMINI] ⚠ No API keys configured!');
      console.warn('[GEMINI]   Set GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc. in Vercel environment variables');
      console.warn('[GEMINI]   Or set AI_INTEGRATIONS_GEMINI_API_KEY for single key mode');
      // Log what variables we checked
      console.log('[GEMINI]   Checked: GEMINI_API_KEY_1 =', process.env.GEMINI_API_KEY_1 ? 'SET' : 'NOT SET');
      console.log('[GEMINI]   Checked: AI_INTEGRATIONS_GEMINI_API_KEY =', process.env.AI_INTEGRATIONS_GEMINI_API_KEY ? 'SET' : 'NOT SET');
      console.log('[GEMINI]   Checked: GOOGLE_GENAI_API_KEY =', process.env.GOOGLE_GENAI_API_KEY ? 'SET' : 'NOT SET');
    }
  }

  _loadKeys() {
    const keys = [];
    
    // Load numbered keys first (GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.)
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`GEMINI_API_KEY_${i}`];
      if (key && key.trim()) {
        keys.push(key.trim());
      }
    }
    
    // Fallback to legacy single key if no numbered keys
    if (keys.length === 0) {
      const legacyKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
      if (legacyKey && legacyKey.trim()) {
        keys.push(legacyKey.trim());
      }
    }
    
    return keys;
  }

  _isKeyAvailable(keyIndex) {
    const status = this.keyStatus[keyIndex];
    if (!status) return true;
    
    // Check if cooldown period has passed (60 seconds for rate limits)
    if (Date.now() > status.availableAt) {
      delete this.keyStatus[keyIndex];
      return true;
    }
    return false;
  }

  _markKeyRateLimited(keyIndex) {
    // Put key in cooldown for 60 seconds
    this.keyStatus[keyIndex] = {
      rateLimited: true,
      availableAt: Date.now() + 60000, // 60 second cooldown
    };
    console.log(`[GEMINI] Key ${keyIndex + 1} rate limited, cooldown for 60s`);
  }

  /**
   * Get the next available API key
   * @returns {{ key: string, index: number } | null}
   */
  getNextKey() {
    if (this.keys.length === 0) {
      return null;
    }

    // Try to find an available key using round-robin
    const startIndex = this.currentIndex;
    let attempts = 0;
    
    while (attempts < this.keys.length) {
      const idx = (startIndex + attempts) % this.keys.length;
      if (this._isKeyAvailable(idx)) {
        this.currentIndex = (idx + 1) % this.keys.length;
        return { key: this.keys[idx], index: idx };
      }
      attempts++;
    }

    // All keys rate limited - return the one with shortest cooldown
    let bestIdx = 0;
    let bestTime = Infinity;
    for (let i = 0; i < this.keys.length; i++) {
      const status = this.keyStatus[i];
      if (status && status.availableAt < bestTime) {
        bestTime = status.availableAt;
        bestIdx = i;
      }
    }
    
    console.warn('[GEMINI] All keys rate limited, using key with shortest cooldown');
    return { key: this.keys[bestIdx], index: bestIdx };
  }

  /**
   * Mark a key as rate limited
   * @param {number} keyIndex 
   */
  markRateLimited(keyIndex) {
    this._markKeyRateLimited(keyIndex);
  }

  /**
   * Get the total number of configured keys
   */
  getKeyCount() {
    return this.keys.length;
  }

  /**
   * Get the number of keys not currently rate limited
   */
  getAvailableKeyCount() {
    return this.keys.filter((_, idx) => this._isKeyAvailable(idx)).length;
  }

  /**
   * Get status information for health checks
   */
  getStatus() {
    const now = Date.now();
    const keyDetails = this.keys.map((_, idx) => {
      const status = this.keyStatus[idx];
      if (!status) {
        return { key: idx + 1, status: 'available' };
      }
      const secsRemaining = Math.max(0, Math.ceil((status.availableAt - now) / 1000));
      return { 
        key: idx + 1, 
        status: 'rate_limited', 
        availableIn: `${secsRemaining}s` 
      };
    });

    return {
      totalKeys: this.keys.length,
      availableKeys: this.getAvailableKeyCount(),
      rateLimitedKeys: this.keys.length - this.getAvailableKeyCount(),
      baseUrl: this.baseUrl,
      keys: keyDetails,
    };
  }

  /**
   * Get the seconds until the next key becomes available
   */
  getSecondsUntilAvailable() {
    if (this.getAvailableKeyCount() > 0) return 0;
    
    const now = Date.now();
    let minWait = Infinity;
    for (const status of Object.values(this.keyStatus)) {
      if (status && status.availableAt) {
        const wait = (status.availableAt - now) / 1000;
        if (wait < minWait) minWait = wait;
      }
    }
    return Math.max(0, Math.ceil(minWait));
  }
}

// Singleton instance
const keyRotator = new GeminiKeyRotator();

module.exports = {
  keyRotator,
  GeminiKeyRotator,
};
