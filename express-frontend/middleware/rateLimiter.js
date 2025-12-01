/**
 * Rate Limiter Middleware
 * - Max 3 requests per minute per IP address
 * - In-memory store with automatic 60-second reset
 * - Handles x-forwarded-for for reverse proxy environments
 */

const store = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of store.entries()) {
    if (now - data.resetTime > 60000) {
      store.delete(key);
    }
  }
}, 300000);

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
