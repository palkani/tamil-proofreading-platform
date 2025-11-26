const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { trackPageView } = require('./middleware/analytics');
const { loadAllSecrets } = require('./utils/secrets');

const app = express();
const PORT = 5000; // Express frontend always runs on 5000

async function initializeApp() {
  await loadAllSecrets();
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
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Analytics tracking middleware (track all page views)
app.use(trackPageView);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const indexRouter = require('./routes/index');
const workspaceRouter = require('./routes/workspace');
const apiRouter = require('./routes/api');

app.use('/', indexRouter);
app.use('/workspace', workspaceRouter);
app.use('/api', apiRouter);

// Error handling
app.use((req, res, next) => {
  res.status(404).render('pages/404', { title: 'Page Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('pages/error', { 
    title: 'Server Error',
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
