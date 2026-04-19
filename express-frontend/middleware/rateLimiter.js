/**
 * Rate Limiter Middleware
 * - Max 3 requests per minute per IP address
 * - In-memory store with automatic 60-second reset
 * - Handles x-forwarded-for for reverse proxy environments
 */

const store = new Map();

// Lazy probabilistic cleanup: on ~1% of requests, evict entries older than 2 windows.
// Works correctly in serverless (Vercel) where setInterval is unreliable across invocations.
function maybePurgeStore(windowSeconds) {
  if (Math.random() > 0.01) return;
  const cutoff = Date.now() - windowSeconds * 2000;
  for (const [key, data] of store) {
    if (data.resetTime < cutoff) store.delete(key);
  }
}

/**
 * Get client IP address, considering x-forwarded-for header
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() || req.socket.remoteAddress;
}

/**
 * Rate limiter middleware
 * @param {number} maxRequests - Max requests allowed (default: 3)
 * @param {number} windowSeconds - Time window in seconds (default: 60)
 * @returns {Function} Express middleware
 */
function rateLimiter(maxRequests = 3, windowSeconds = 60) {
  return (req, res, next) => {
    maybePurgeStore(windowSeconds);
    const clientIP = getClientIP(req);
    const now = Date.now();

    // Get or create rate limit data for this IP
    if (!store.has(clientIP)) {
      store.set(clientIP, {
        count: 0,
        resetTime: now,
      });
    }

    const data = store.get(clientIP);

    // Check if reset window has expired
    if (now - data.resetTime >= windowSeconds * 1000) {
      data.count = 0;
      data.resetTime = now;
    }

    // Increment request count
    data.count++;

    // Attach rate limit info to request
    req.rateLimit = {
      current: data.count,
      limit: maxRequests,
      resetTime: data.resetTime + windowSeconds * 1000,
      remaining: Math.max(0, maxRequests - data.count),
    };

    // Check if limit exceeded
    if (data.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again after 1 minute.',
        rateLimit: {
          limit: maxRequests,
          current: data.count,
          resetIn: Math.ceil((data.resetTime + windowSeconds * 1000 - now) / 1000),
        },
      });
    }

    next();
  };
}

module.exports = rateLimiter;
