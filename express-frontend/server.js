const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { trackPageView } = require('./middleware/analytics');
const { getSeoData } = require('./config/seo');

const app = express();
const PORT = 5000; // Express frontend always runs on 5000

async function initializeApp() {
  try {
    const { loadAllSecrets } = require('./utils/secrets');
    await loadAllSecrets();
  } catch (error) {
    console.log('[Init] Secrets module error (non-fatal):', error.message);
  }
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'tamil-proofreading-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Analytics tracking middleware (track all page views)
app.use(trackPageView);

// Static files with cache headers for performance
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// XML Sitemap route
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
    { url: '/terms', priority: '0.4', changefreq: 'yearly' }
  ];

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  sitemap += '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
  sitemap += '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n';
  sitemap += '        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n';

  pages.forEach(page => {
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

// Routes
const indexRouter = require('./routes/index');
const workspaceRouter = require('./routes/workspace');
const apiRouter = require('./routes/api');

app.use('/', indexRouter);
app.use('/workspace', workspaceRouter);
app.use('/api', apiRouter);

// Error handling - 404
app.use((req, res, next) => {
  const seo = getSeoData('notFound');
  res.status(404).render('pages/404', { 
    title: seo.title,
    seo: seo
  });
});

// Error handling - 500
app.use((err, req, res, next) => {
  console.error(err.stack);
  const seo = getSeoData('error');
  res.status(500).render('pages/error', { 
    title: seo.title,
    seo: seo,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start server immediately, load secrets in background
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server running on http://0.0.0.0:${PORT}`);
  
  initializeApp().then(() => {
    console.log(`GOOGLE_CLIENT_ID available: ${!!process.env.GOOGLE_CLIENT_ID}`);
  }).catch(error => {
    console.log('Secrets loading error (non-fatal):', error.message);
  });
});

module.exports = app;
