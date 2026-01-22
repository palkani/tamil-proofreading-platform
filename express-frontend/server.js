const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
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
      console.warn('[Init] Bootstrap encountered an error (non-fatal):', error.message);
      initPromise = null;
    });
  }
  return initPromise;
};

const appReady = ensureAppReady();

const ensureAppReadyMiddleware = (req, res, next) => {
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

// Performance: compress HTML/JSON/CSS/JS responses
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

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders: (res, filePath) => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    if (filePath.endsWith('/js/workspace.js') || filePath.endsWith('/js/home-editor.js') || filePath.endsWith('/js/transliterator-runner.js')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return;
    }
    if (filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
      return;
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
      return;
    }
    if (/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2|woff|ttf|otf)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
  }
}));

app.use('/auth', authRoutes);
app.use('/', indexRouter);
app.use('/api', apiRouter);
app.use('/process', processRouter);
app.use('/workspace', workspaceRouter);

app.use((req, res, next) => {
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

const PORT = process.env.PORT || 3000;

appReady
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Express server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[SERVER] Express app failed to initialize:', error.message);
    process.exit(1);
  });

module.exports = app;
