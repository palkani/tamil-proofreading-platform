// Analytics middleware for tracking page views
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080/api/v1';

// List of routes to skip analytics (admin, api, static assets)
const SKIP_ROUTES = [
  '/api/',
  '/assets/',
  '/css/',
  '/js/',
  '/images/',
  '/favicon',
  '/manifest',
  '/robots.txt',
];

// List of bot user agents to skip
const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /headless/i,
  /phantom/i,
  /selenium/i,
];

function detectDeviceType(userAgent) {
  if (/mobile|android|iphone|ipad|ipod/i.test(userAgent)) {
    if (/ipad|tablet/i.test(userAgent)) {
      return 'tablet';
    }
    return 'mobile';
  }
  return 'desktop';
}

function isBot(userAgent) {
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

function shouldSkipRoute(path) {
  return SKIP_ROUTES.some(skipRoute => path.startsWith(skipRoute));
}

// Analytics tracking middleware
function trackPageView(req, res, next) {
  // Call next() immediately - don't block request
  next();
  
  // Track analytics asynchronously after response
  setImmediate(() => {
    // Skip certain routes and bots
    if (shouldSkipRoute(req.path)) {
      return;
    }

    const userAgent = req.get('user-agent') || '';
    
    if (isBot(userAgent)) {
      return;
    }

    // Get user ID from session if logged in
    const userId = req.session?.user?.id || null;

    // Fire and forget - don't wait for analytics to complete
    const visitData = {
      route: req.path,
      referrer: req.get('referer') || req.get('referrer') || '',
      user_agent: userAgent,
      device_type: detectDeviceType(userAgent),
      user_id: userId, // Include user ID if authenticated
    };

    // Log visit asynchronously with timeout
    axios.post(`${BACKEND_URL}/events/visit`, visitData, {
      timeout: 2000, // 2 second timeout
    }).catch(err => {
      // Silently fail - analytics shouldn't break the app
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Analytics logging failed:', err.message);
      }
    });
  });
}

// Helper function to log activity events from other parts of the app
async function logActivity(eventType, metadata = {}) {
  try {
    await axios.post(`${BACKEND_URL}/events/activity`, {
      event_type: eventType,
      metadata: metadata,
    }, {
      timeout: 2000,
    });
  } catch (err) {
    console.error('Activity logging failed:', err.message);
  }
}

module.exports = {
  trackPageView,
  logActivity,
};
