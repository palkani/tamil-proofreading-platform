const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const querystring = require('querystring');
const axios = require('axios');
const compression = require('compression');
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

// Performance: compress HTML/JSON/CSS/JS responses (helps PageSpeed transfer size + LCP)
app.use(
  compression({
    level: 6,
    threshold: 1024,
  })
);

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
// IMPORTANT: attachUser must run for /workspace so requireAuth can work and Draft View/Edit links don't bounce back to /drafts.
app.use((req, res, next) => attachUser(req, res, next));
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
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0',
    etag: true,
    setHeaders: (res, path) => {
      // Long-lived caching for static assets (improves PageSpeed cache-lifetimes)
      // Keep workspace.js revalidated because it changes frequently.
      if (process.env.NODE_ENV === 'production') {
        const isJs = path.endsWith('.js');
        const isCss = path.endsWith('.css');
        const isImage = /\.(png|jpg|jpeg|webp|gif|svg|ico)$/.test(path);
        const isFont = /\.(woff2|woff|ttf|otf)$/.test(path);

        if (isJs) {
          if (path.endsWith('/js/workspace.js')) {
            // Allow caching but require revalidation
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
          }
        } else if (isCss) {
          res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
        } else if (isImage || isFont) {
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
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
  
  // Cache blog URLs in-memory to keep sitemap fast on serverless.
  // TTL: 10 minutes
  global.__sitemapBlogCache = global.__sitemapBlogCache || { ts: 0, urls: [] };

  function getBackendApiUrl() {
    const base = process.env.BACKEND_URL || 'http://localhost:8080';
    if (base.endsWith('/api/v1')) return base;
    return base.replace(/\/$/, '') + '/api/v1';
  }
  const BACKEND_API = getBackendApiUrl();

  const pages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/free-tamil-editor', priority: '0.95', changefreq: 'weekly' },
    { url: '/how-to-use', priority: '0.9', changefreq: 'weekly' },
    { url: '/blog', priority: '0.85', changefreq: 'weekly' },
    { url: '/tools/ocr', priority: '0.85', changefreq: 'weekly' },
    { url: '/tools/converter', priority: '0.85', changefreq: 'weekly' },
    { url: '/tools/ai-content-writer', priority: '0.8', changefreq: 'weekly' },
    { url: '/tools/event-name-suggester', priority: '0.75', changefreq: 'weekly' },
    { url: '/contact', priority: '0.7', changefreq: 'monthly' },
    { url: '/login', priority: '0.6', changefreq: 'monthly' },
    { url: '/register', priority: '0.6', changefreq: 'monthly' },
    { url: '/privacy', priority: '0.4', changefreq: 'yearly' },
    { url: '/terms', priority: '0.4', changefreq: 'yearly' },
  ];

  const escapeXml = (s) =>
    String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  sitemap += '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
  sitemap += '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n';
  sitemap += '        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n';

  pages.forEach((page) => {
    sitemap += '  <url>\n';
    sitemap += `    <loc>${escapeXml(baseUrl + page.url)}</loc>\n`;
    sitemap += `    <lastmod>${currentDate}</lastmod>\n`;
    sitemap += `    <changefreq>${page.changefreq}</changefreq>\n`;
    sitemap += `    <priority>${page.priority}</priority>\n`;
    sitemap += '  </url>\n';
  });

  // Add published blog post URLs (best-effort)
  const now = Date.now();
  const isCacheFresh = now - (global.__sitemapBlogCache.ts || 0) < 10 * 60 * 1000;
  const cached = Array.isArray(global.__sitemapBlogCache.urls) ? global.__sitemapBlogCache.urls : [];
  const addBlogUrls = (list) => {
    (list || []).forEach((u) => {
      if (!u || !u.loc) return;
      sitemap += '  <url>\n';
      sitemap += `    <loc>${escapeXml(u.loc)}</loc>\n`;
      sitemap += `    <lastmod>${escapeXml(u.lastmod || currentDate)}</lastmod>\n`;
      sitemap += `    <changefreq>${escapeXml(u.changefreq || 'monthly')}</changefreq>\n`;
      sitemap += `    <priority>${escapeXml(u.priority || '0.65')}</priority>\n`;
      sitemap += '  </url>\n';
    });
  };

  if (isCacheFresh && cached.length) {
    addBlogUrls(cached);
  } else {
    // Fetch up to 200 posts; keep timeout low so sitemap stays responsive.
    axios
      .get(`${BACKEND_API}/blog/posts`, {
        params: { page: 1, limit: 200 },
        timeout: 2500,
        validateStatus: () => true,
      })
      .then((r) => {
        const posts = r.data?.posts || [];
        const blogUrls = posts
          .filter((p) => p && (p.slug || p.Slug))
          .map((p) => {
            const slug = String(p.slug || p.Slug || '').trim();
            const updated = String(p.updated_at || p.updatedAt || p.UpdatedAt || p.published_at || p.publishedAt || p.PublishedAt || '')
              .slice(0, 10);
            return {
              loc: `${baseUrl}/blog/${encodeURIComponent(slug)}`,
              lastmod: updated || currentDate,
              changefreq: 'monthly',
              priority: '0.65',
            };
          });
        global.__sitemapBlogCache = { ts: Date.now(), urls: blogUrls };
        addBlogUrls(blogUrls);

        sitemap += '</urlset>';
        res.header('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
        return res.send(sitemap);
      })
      .catch(() => {
        // ignore - fall through to static pages only
        sitemap += '</urlset>';
        res.header('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
        return res.send(sitemap);
      });
    return;
  }

  sitemap += '</urlset>';

  res.header('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
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
