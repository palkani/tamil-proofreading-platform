const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const querystring = require('querystring');
const { trackPageView } = require('./middleware/analytics');
const { getSeoData } = require('./config/seo');
const authRoutes = require('./routes/auth');
const { attachUser } = require('./middleware/auth');

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');
const processRouter = require('./routes/process');
const workspaceRouter = require('./routes/workspace');

const app = express();

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

async function initializeAppSecrets() {
  try {
    const { loadAllSecrets } = require('./utils/secrets');
    await loadAllSecrets();
    console.log(`[Init] GOOGLE_CLIENT_ID available: ${!!process.env.GOOGLE_CLIENT_ID}`);
  } catch (error) {
    console.warn('[Init] Secrets module error (non-fatal):', error.message);
    // Non-fatal: allow app to continue even if secrets failed to load
  }
}

let initPromise = null;
const ensureAppReady = () => {
  if (!initPromise) {
    initPromise = (async () => {
      console.log('[Init] Starting Express app bootstrap');
      await initializeAppSecrets();
      console.log('[Init] Express app bootstrap complete');
    })().catch((error) => {
      // Do not fail requests; log and allow retry on next request
      console.warn('[Init] Bootstrap encountered an error (non-fatal):', error.message);
      initPromise = null;
    });
  }
  return initPromise;
};

const appReady = ensureAppReady();

const ensureAppReadyMiddleware = (req, res, next) => {
  // Allow OAuth callbacks and workspace to proceed without waiting on appReady
  const path = req.path || '';
  if (
    path.startsWith('/api/v1/auth/google/callback') ||
    path.startsWith('/v1/auth/google/callback') ||
    path.startsWith('/auth/google/callback') ||
    path.startsWith('/workspace')
  ) {
    return next();
  }

  ensureAppReady()
    .then(() => next())
    .catch((error) => {
      console.error('[Init] Express app failed to initialize', error);
      next(error);
    });
};

app.use(ensureAppReadyMiddleware);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Skip attachUser for /workspace because Cloud Run handles auth/rendering there
app.use((req, res, next) => {
  if (req.path.startsWith('/workspace')) return next();
  attachUser(req, res, next);
});
app.use(trackPageView);

// Special handling for workspace.js - no cache to ensure latest version
app.get('/js/workspace.js', (req, res, next) => {
  // Force no caching - multiple headers for maximum compatibility
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Last-Modified': new Date().toUTCString(),
    'ETag': false,
    'X-Content-Type-Options': 'nosniff',
  });
  // Remove any existing cache headers
  res.removeHeader('ETag');
  next();
});

// Also add no-cache for all JS files in development
if (process.env.NODE_ENV !== 'production') {
  app.get('/js/*.js', (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    next();
  });
}

// Static files with cache control
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0', // Shorter cache in production
    etag: true,
    setHeaders: (res, path) => {
      // No cache for JS files to ensure latest version
      if (path.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      // Short cache for CSS
      if (path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
      }
    }
  })
);

// Guard: normalize legacy OAuth callback paths to the correct backend path
app.get(['/v1/auth/google/callback', '/auth/google/callback'], (req, res) => {
  const qs = querystring.stringify(req.query);
  const target = `/api/v1/auth/google/callback${qs ? `?${qs}` : ''}`;
  return res.redirect(target);
});

app.get('/sitemap.xml', (req, res) => {
  const baseUrl = 'https://prooftamil.com';
  const currentDate = new Date().toISOString().split('T')[0];

  const pages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/how-to-use', priority: '0.9', changefreq: 'weekly' },
    { url: '/contact', priority: '0.7', changefreq: 'monthly' },
    { url: '/login', priority: '0.6', changefreq: 'monthly' },
    { url: '/register', priority: '0.6', changefreq: 'monthly' },
    { url: '/privacy', priority: '0.4', changefreq: 'yearly' },
    { url: '/terms', priority: '0.4', changefreq: 'yearly' },
  ];

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  sitemap += '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
  sitemap += '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n';
  sitemap += '        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n';

  pages.forEach((page) => {
    sitemap += '  <url>\n';
    sitemap += `    <loc>${baseUrl}${page.url}</loc>\n`;
    sitemap += `    <lastmod>${currentDate}</lastmod>\n`;
    sitemap += `    <changefreq>${page.changefreq}</changefreq>\n`;
    sitemap += `    <priority>${page.priority}</priority>\n`;
    sitemap += '  </url>\n';
  });

  sitemap += '</urlset>';

  res.header('Content-Type', 'application/xml');
  res.send(sitemap);
});

app.use('/auth', authRoutes);
app.use('/workspace', workspaceRouter);
app.use('/', indexRouter);
app.use('/api', apiRouter);
app.use('/api/process', processRouter);

app.use((req, res) => {
  const seo = getSeoData('notFound');
  res.status(404).render('pages/404', {
    title: seo.title,
    seo: seo,
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const seo = getSeoData('error');
  res.status(500).render('pages/error', {
    title: seo.title,
    seo: seo,
    error: process.env.NODE_ENV === 'development' ? err : {},
  });
});

// Vercel Serverless Function export: wrap express app as a handler (no app.listen)
module.exports = async (req, res) => {
  try {
    await appReady;
  } catch (err) {
    console.error('[Init] appReady failed (non-fatal):', err?.message);
  }
  return app(req, res);
};
