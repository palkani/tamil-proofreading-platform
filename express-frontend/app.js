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
const workspaceRouter = require('./routes/workspace');
const apiRouter = require('./routes/api');
const processRouter = require('./routes/process');

const app = express();
const PORT = process.env.PORT || 5000;

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
    console.log('[Init] Secrets module error (non-fatal):', error.message);
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
      // Reset so a subsequent request can retry initialization
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
};

const appReady = ensureAppReady();

const ensureAppReadyMiddleware = (req, res, next) => {
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
app.use(attachUser);
app.use(trackPageView);
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: true,
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
app.use('/', indexRouter);
app.use('/workspace', workspaceRouter);
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

module.exports = {
  app,
  appReady,
  PORT,
};
