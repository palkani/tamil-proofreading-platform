/**
 * Shared Express app factory.
 * Both app.js (Vercel serverless) and server.js (local / Docker) import this.
 * Each entry point only handles its own deployment concern:
 *   - app.js   → export a Vercel handler
 *   - server.js → load .env then call app.listen()
 */

// Silence Node's DEP0169 (`url.parse()` deprecation). The warning comes from
// Express 4's internal request handler, not our code. Harmless for us — the
// CVE language is about people building security checks on top of url.parse(),
// not Express's internal use. All other warnings stay visible.
// Remove this when we migrate to Express 5 (which uses the WHATWG URL API).
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.code === 'DEP0169') return;
  const code = w.code ? `[${w.code}] ` : '';
  console.warn(`(node:${process.pid}) ${code}${w.name}: ${w.message}`);
});

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const querystring = require('querystring');
const compression = require('compression');
const { getSeoData } = require('./config/seo');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');
const processRouter = require('./routes/process');
const workspaceRouter = require('./routes/workspace');
const adminRouter = require('./routes/admin');
const chatbotRouter = require('./routes/chatbot');

// JS files that must never be served from cache
const NO_CACHE_JS = [
  '/js/workspace.js',
  '/js/home-editor.js',
  '/js/transliterator-runner.js',
];

// ---------------------------------------------------------------------------
// Secrets initialisation (singleton — shared between app.js and server.js via
// Node's module cache, so the promise is created only once per process).
// ---------------------------------------------------------------------------
let initPromise = null;

async function initializeAppSecrets() {
  try {
    const { loadAllSecrets } = require('./utils/secrets');
    await loadAllSecrets();
    console.log(`[Init] GOOGLE_CLIENT_ID available: ${!!process.env.GOOGLE_CLIENT_ID}`);
  } catch (error) {
    console.warn('[Init] Secrets module error (non-fatal):', error.message);
  }
}

function ensureAppReady() {
  if (!initPromise) {
    initPromise = (async () => {
      console.log('[Init] Starting Express app bootstrap');
      await initializeAppSecrets();
      console.log('[Init] Express app bootstrap complete');
    })().catch((error) => {
      console.warn('[Init] Bootstrap encountered an error (non-fatal):', error.message);
      initPromise = null;
    });
  }
  return initPromise;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
function createApp() {
  const app = express();

  // Payment feature flag — set PAYMENTS_ENABLED=true in .env to enable payment UI
  app.locals.paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';

  app.set('trust proxy', true);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Always allow the canonical production domain regardless of FRONTEND_URL config.
  const PRODUCTION_ORIGINS = ['https://prooftamil.com', 'https://www.prooftamil.com'];

  // Wait for secrets before serving most routes; skip OAuth callbacks and
  // workspace so they are never blocked by an initialisation delay.
  const ensureReadyMiddleware = (req, res, next) => {
    const p = req.path || '';
    if (
      p.startsWith('/api/v1/auth/google/callback') ||
      p.startsWith('/v1/auth/google/callback') ||
      p.startsWith('/auth/google/callback') ||
      p === '/auth/callback' ||
      p.startsWith('/workspace')
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

  app.use(ensureReadyMiddleware);

  app.use(compression({ level: 6, threshold: 1024 }));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (PRODUCTION_ORIGINS.includes(origin)) return callback(null, true);
        // Allow all Vercel preview deployments (*.vercel.app)
        if (origin.endsWith('.vercel.app')) return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  // 50mb allows /api/corrections to accept competitor-style docJson with 200k+ words
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());
  // attachUser must run for /workspace so requireAuth works and draft links don't loop.
  app.use((req, res, next) => attachUser(req, res, next));

  // Serve frequently-updated JS files with no-cache headers before the
  // general static middleware so the headers are applied correctly.
  NO_CACHE_JS.forEach((file) => {
    app.get(file, (req, res, next) => {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, private',
        Pragma: 'no-cache',
        Expires: '0',
        'Last-Modified': new Date().toUTCString(),
        ETag: false,
        'X-Content-Type-Options': 'nosniff',
      });
      res.removeHeader('ETag');
      next();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/js/*.js', (req, res, next) => {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      });
      next();
    });
  }

  app.use(
    express.static(path.join(__dirname, 'public'), {
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0',
      etag: true,
      setHeaders: (res, filePath) => {
        if (process.env.NODE_ENV !== 'production') return;
        const isJs = filePath.endsWith('.js');
        const isCss = filePath.endsWith('.css');
        const isImage = /\.(png|jpg|jpeg|webp|gif|svg|ico)$/.test(filePath);
        const isFont = /\.(woff2|woff|ttf|otf)$/.test(filePath);
        if (isJs) {
          const isNoCacheFile = NO_CACHE_JS.some((f) => filePath.endsWith(f.replace('/js/', path.sep + 'js' + path.sep)));
          res.setHeader(
            'Cache-Control',
            isNoCacheFile
              ? 'public, max-age=0, must-revalidate'
              : 'public, max-age=604800, stale-while-revalidate=86400'
          );
        } else if (isCss) {
          res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
        } else if (isImage || isFont) {
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
      },
    })
  );

  // Firebase Hosting reserved paths — respond 200 so domain verification passes.
  app.use('/__/hosting/', (req, res) => res.sendStatus(200));

  // Normalise legacy OAuth callback paths to the canonical backend path.
  app.get(['/v1/auth/google/callback', '/auth/google/callback'], (req, res) => {
    const qs = querystring.stringify(req.query);
    const target = `/api/v1/auth/google/callback${qs ? `?${qs}` : ''}`;
    return res.redirect(target);
  });

  // Routes
  app.use('/auth', authRoutes);
  app.use('/admin', adminRouter);
  app.use('/workspace', workspaceRouter);
  app.use('/', indexRouter);
  // Before apiRouter so /api/chat and /api/leads resolve here rather than
  // falling through to whatever apiRouter does with unmatched paths.
  app.use('/api', chatbotRouter);
  app.use('/api', apiRouter);
  app.use('/api/process', processRouter);

  // 404 handler
  app.use((req, res) => {
    const seo = getSeoData('notFound');
    res.status(404).render('pages/404', { title: seo.title, seo });
  });

  // Error handler
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err.stack);
    // API routes must always return JSON — never HTML.
    // HTML error pages cause JSON.parse failures in the browser client.
    const isApiRequest = req.path.startsWith('/api/');
    if (isApiRequest) {
      const status = err.status || err.statusCode || 500;
      return res.status(status).json({
        error: err.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });
    }
    const seo = getSeoData('error');
    res.status(500).render('pages/error', {
      title: seo.title,
      seo,
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  });

  return app;
}

module.exports = { createApp, ensureAppReady };
