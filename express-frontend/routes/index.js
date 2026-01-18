const express = require('express');
const router = express.Router();
const axios = require('axios');
const { redirectIfAuth, getCurrentUser } = require('../middleware/auth');
const { getSeoData } = require('../config/seo');
// Build backend API URL (matches api/auth proxy)
function getBackendApiUrl() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  if (baseUrl.endsWith('/api/v1')) {
    return baseUrl;
  }
  return baseUrl.replace(/\/$/, '') + '/api/v1';
}

const BACKEND_URL = getBackendApiUrl();

// Homepage - accessible to everyone
// IMPORTANT: This route should NEVER redirect - it's the landing page
router.get('/', (req, res) => {
  // Log for debugging redirect issues
  if (process.env.NODE_ENV === 'development') {
    console.log('[HOME] Rendering homepage', {
      path: req.path,
      query: req.query,
      user: req.user ? req.user.email : 'none'
    });
  }
  
  const user = getCurrentUser(req);
  const seo = getSeoData('home');
  res.render('pages/home', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// How to Use page - accessible to everyone
router.get('/how-to-use', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('howToUse');
  res.render('pages/how-to-use', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// OCR Tool page - accessible to everyone
router.get('/tools/ocr', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('ocrTool');
  res.render('pages/ocr-tool', { 
    title: 'Tamil OCR Tool - Extract Text from Images | ProofTamil',
    seo: seo,
    user: user
  });
});

// Document Converter Tool page - accessible to everyone
router.get('/tools/converter', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('converterTool');
  res.render('pages/document-converter', { 
    title: 'Document Converter - Convert PDF, DOCX, TXT, HTML | ProofTamil',
    seo: seo,
    user: user
  });
});

// AI Content Writer Tool page - accessible to everyone
router.get('/tools/ai-content-writer', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('aiContentWriterTool');
  res.render('pages/ai-content-writer', { 
    title: 'AI Content Writer - Generate Blogs & Articles in Tamil & English | ProofTamil',
    seo: seo,
    user: user
  });
});

// Event Name Suggester Tool page - accessible to everyone
router.get('/tools/event-name-suggester', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('eventNameSuggesterTool') || getSeoData('home');
  res.render('pages/event-name-suggester', {
    title: 'Event Name Suggester - Catchy Tamil & English Event Names | ProofTamil',
    seo: seo,
    user: user
  });
});

// Blog (public) - hosted posts
router.get('/blog', async (req, res) => {
  const user = getCurrentUser(req);
  const page = Number(req.query.page || 1) || 1;
  const seoBase = getSeoData('blog') || getSeoData('home');
  const seo = {
    ...seoBase,
    canonical: `https://prooftamil.com/blog${page > 1 ? `?page=${page}` : ''}`,
    pageType: 'blogIndex',
  };
  try {
    const backendRes = await axios.get(`${BACKEND_URL}/blog/posts`, {
      params: { page, limit: 12 },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (backendRes.status < 200 || backendRes.status >= 300) {
      const msg = backendRes.data?.error || `HTTP ${backendRes.status}`;
      return res.render('pages/blog-index', {
        title: 'Blog | ProofTamil',
        seo,
        user,
        posts: [],
        error: msg,
      });
    }
    const posts = backendRes.data?.posts || [];
    return res.render('pages/blog-index', {
      title: 'Blog | ProofTamil',
      seo,
      user,
      posts,
      error: null,
      page,
      limit: 12,
    });
  } catch (e) {
    return res.render('pages/blog-index', {
      title: 'Blog | ProofTamil',
      seo,
      user,
      posts: [],
      error: e.message || 'Failed to load posts',
      page,
      limit: 12,
    });
  }
});

router.get('/blog/:slug', async (req, res) => {
  const user = getCurrentUser(req);
  const seoBase = getSeoData('blogPost') || getSeoData('home');
  const slug = String(req.params.slug || '').trim();
  try {
    const backendRes = await axios.get(`${BACKEND_URL}/blog/posts/${encodeURIComponent(slug)}`, {
      timeout: 10000,
      validateStatus: () => true,
    });
    if (backendRes.status === 404) {
      const seoErr = getSeoData('error');
      return res.status(404).render('pages/error', {
        title: 'Not Found',
        seo: seoErr,
        message: 'Blog post not found.',
        user,
      });
    }
    if (backendRes.status < 200 || backendRes.status >= 300) {
      const msg = backendRes.data?.error || `HTTP ${backendRes.status}`;
      return res.render('pages/blog-post', {
        title: 'Blog | ProofTamil',
        seo,
        user,
        post: null,
        error: msg,
      });
    }
    const post = backendRes.data?.post;
    if (!post) {
      return res.render('pages/blog-post', {
        title: 'Blog | ProofTamil',
        seo: seoBase,
        user,
        post: null,
        error: 'Invalid backend response',
      });
    }

    const canonical = `https://prooftamil.com/blog/${encodeURIComponent(post.slug || slug)}`;
    const desc =
      (post.meta_description && String(post.meta_description).trim()) ||
      (post.excerpt && String(post.excerpt).trim()) ||
      String(post.content_text || '').trim().slice(0, 160);
    const keywords = [post.keywords, seoBase.keywords].filter(Boolean).join(', ');
    const publishedIso = post.published_at ? new Date(post.published_at).toISOString() : null;
    const modifiedIso = post.updated_at ? new Date(post.updated_at).toISOString() : (post.created_at ? new Date(post.created_at).toISOString() : null);

    const jsonLdObj = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": post.title,
      "description": desc,
      "inLanguage": (post.language || "tamil") === "tamil" ? "ta" : "en",
      "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
      "url": canonical,
      "datePublished": publishedIso || undefined,
      "dateModified": modifiedIso || undefined,
      "author": { "@type": "Organization", "name": "ProofTamil" },
      "publisher": { "@type": "Organization", "name": "ProofTamil", "logo": { "@type": "ImageObject", "url": "https://prooftamil.com/images/tamil-logo.svg" } },
    };

    const seo = {
      ...seoBase,
      title: `${post.title} | ProofTamil`,
      ogTitle: post.title,
      description: desc,
      ogDescription: desc,
      keywords,
      canonical,
      pageType: 'blogPost',
      article: {
        publishedTime: publishedIso,
        modifiedTime: modifiedIso,
        section: 'Blog',
      },
      jsonLd: JSON.stringify(jsonLdObj),
    };

    return res.render('pages/blog-post', {
      title: `${post.title} | ProofTamil`,
      seo,
      user,
      post,
      error: null,
    });
  } catch (e) {
    return res.render('pages/blog-post', {
      title: 'Blog | ProofTamil',
      seo: seoBase,
      user,
      post: null,
      error: e.message || 'Failed to load post',
    });
  }
});

// RSS feed for blog (public)
router.get('/blog/rss.xml', async (req, res) => {
  const baseUrl = 'https://prooftamil.com';
  try {
    const backendRes = await axios.get(`${BACKEND_URL}/blog/posts`, {
      params: { page: 1, limit: 50 },
      timeout: 10000,
      validateStatus: () => true,
    });
    const posts = backendRes.status >= 200 && backendRes.status < 300 ? (backendRes.data?.posts || []) : [];

    const escapeXml = (s) =>
      String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

    const items = posts
      .filter((p) => p && p.slug && p.title)
      .map((p) => {
        const link = `${baseUrl}/blog/${encodeURIComponent(p.slug)}`;
        const pub = p.published_at || p.created_at;
        const pubDate = pub ? new Date(pub).toUTCString() : new Date().toUTCString();
        const desc =
          (p.meta_description && String(p.meta_description).trim()) ||
          (p.excerpt && String(p.excerpt).trim()) ||
          String(p.content_text || '').trim().slice(0, 200);
        return `
          <item>
            <title>${escapeXml(p.title)}</title>
            <link>${escapeXml(link)}</link>
            <guid isPermaLink="true">${escapeXml(link)}</guid>
            <pubDate>${escapeXml(pubDate)}</pubDate>
            <description>${escapeXml(desc)}</description>
          </item>
        `.trim();
      })
      .join('\n');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>ProofTamil Blog</title>
    <link>${baseUrl}/blog</link>
    <description>Tamil writing tips, proofreading examples, and AI-assisted workflows.</description>
    <language>ta</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
    return res.send(rss);
  } catch (e) {
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ProofTamil Blog</title><link>${baseUrl}/blog</link><description>Blog feed temporarily unavailable</description></channel></rss>`);
  }
});

// Free Tamil Editor landing page - accessible to everyone (SEO)
router.get('/free-tamil-editor', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('freeTamilEditor');
  res.render('pages/free-tamil-editor', {
    title: seo.title,
    seo: seo,
    user: user
  });
});

// SEO-friendly aliases (redirect to canonical landing page)
router.get(['/tamil-typing', '/tamil-editor', '/tanglish-to-tamil'], (req, res) => {
  return res.redirect(301, '/free-tamil-editor');
});

// Login page - redirect authenticated users to drafts
router.get('/login', (req, res) => {
  if (req.user) {
    // If user is already authenticated and a redirect target is provided, honor it.
    // This prevents /workspace?draftId=... flows from bouncing back to /drafts after a 401-triggered /login.
    const rawRedirect = typeof req.query.redirect === 'string' ? req.query.redirect : '';
    const isSafeInternal =
      rawRedirect &&
      rawRedirect.startsWith('/') &&
      !rawRedirect.startsWith('//') &&
      !rawRedirect.includes('://');
    const target = isSafeInternal ? rawRedirect : '/drafts';
    console.log('[AUTH] user already authenticated, redirecting to', target);
    return res.redirect(target);
  }
  const seo = getSeoData('login');
  res.render('pages/login', { 
    title: seo.title,
    seo: seo,
    error: req.query.error || null,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    redirectTo: req.query.redirect || '/drafts'
  });
});

// Resolve Google Client ID once (prefer NEXT_PUBLIC_* so Vercel runtime matches frontend expectation)
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';

// Register page - redirect authenticated users to drafts
router.get('/register', (req, res) => {
  if (req.user) {
    const rawRedirect = typeof req.query.redirect === 'string' ? req.query.redirect : '';
    const isSafeInternal =
      rawRedirect &&
      rawRedirect.startsWith('/') &&
      !rawRedirect.startsWith('//') &&
      !rawRedirect.includes('://');
    const target = isSafeInternal ? rawRedirect : '/drafts';
    console.log('[AUTH] user already authenticated, redirecting to', target);
    return res.redirect(target);
  }
  const seo = getSeoData('register');
  res.render('pages/register', { 
    title: seo.title,
    seo: seo,
    googleClientId: GOOGLE_CLIENT_ID,
    redirectTo: req.query.redirect || '/drafts'
  });
});

// Note: Login and registration form submissions are handled client-side via /api/auth/login and /api/auth/register
// These routes are handled by routes/auth.js which proxies to the backend

// Provide Google Client ID to frontend
router.get('/api/config/google-client-id', (req, res) => {
  res.json({ 
    clientId: GOOGLE_CLIENT_ID 
  });
});

// Dashboard page - client-side auth only
router.get('/dashboard', (req, res) => {
  const seo = getSeoData('dashboard');
  res.render('pages/dashboard', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Account page - client-side auth only
router.get('/account', (req, res) => {
  const seo = getSeoData('account');
  res.render('pages/account', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Analytics dashboard - client-side auth only
router.get('/analytics', (req, res) => {
  // Check if user is admin (prooftamil@gmail.com)
  const user = req.user;
  if (user.email !== 'prooftamil@gmail.com' && user.role !== 'admin') {
    const seo = getSeoData('error');
    return res.status(403).render('pages/error', {
      title: 'Access Denied',
      seo: seo,
      message: 'You do not have permission to view this page.',
      user: user
    });
  }
  
  const seo = getSeoData('analytics');
  res.render('pages/analytics', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Archive page - client-side auth only
router.get('/archive', (req, res) => {
  const seo = getSeoData('archive');
  res.render('pages/archive', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Drafts page - client-side auth only
router.get('/drafts', (req, res) => {
  try {
    const user = getCurrentUser(req) || null; // Ensure user is null if not set, not undefined
    const seo = getSeoData('drafts');
    res.render('pages/drafts', { 
      title: seo.title || 'My Drafts',
      seo: seo,
      user: user // Pass null explicitly if user is not authenticated
    });
  } catch (error) {
    console.error('[DRAFTS] Error rendering drafts page:', error);
    res.status(500).render('pages/error', {
      title: 'Error - ProofTamil',
      seo: getSeoData('error'),
      user: getCurrentUser(req) || null,
      error: error.message || 'An unexpected error occurred'
    });
  }
});

// Contact page - accessible to everyone
router.get('/contact', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('contact');
  res.render('pages/contact', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Privacy Policy page - accessible to everyone
router.get('/privacy', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('privacy');
  res.render('pages/privacy', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Terms of Service page - accessible to everyone
router.get('/terms', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('terms');
  res.render('pages/terms', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    // CRITICAL: Check if this is a loop - if logout was called recently, just return 200 without redirect
    const logoutTimestamp = req.headers['x-logout-timestamp'];
    if (logoutTimestamp) {
      const timeSinceLogout = Date.now() - parseInt(logoutTimestamp, 10);
      if (timeSinceLogout < 5000) {
        console.warn('[AUTH-LOGOUT] Logout called too soon after previous logout - possible loop, returning 200 without redirect');
        return res.status(200).json({ message: 'Logout successful' });
      }
    }
    
    const backendRes = await axios({
      method: 'post',
      url: `${BACKEND_URL}/auth/logout`,
      headers: {
        cookie: req.headers.cookie,
        authorization: req.headers.authorization,
        host: undefined,
        origin: undefined,
      },
      withCredentials: true,
      validateStatus: () => true,
    });

    const setCookie = backendRes.headers['set-cookie'];
    if (setCookie) {
      res.setHeader('set-cookie', setCookie);
    }

    // CRITICAL: Don't redirect if we're already on homepage - just return 200
    // This prevents redirect loops
    const referer = req.headers.referer || '';
    if (referer.includes('/') && !referer.includes('/login') && !referer.includes('/register')) {
      console.log('[AUTH-LOGOUT] Already on homepage, returning 200 without redirect to prevent loop');
      return res.status(200).json({ message: 'Logout successful' });
    }

    res.redirect('/');
  } catch (err) {
    console.error('[AUTH-LOGOUT] Failed to revoke session:', err.message);
    // Don't redirect on error if we're already on homepage
    const referer = req.headers.referer || '';
    if (referer.includes('/') && !referer.includes('/login') && !referer.includes('/register')) {
      return res.status(200).json({ message: 'Logout completed' });
    }
    res.redirect('/');
  }
});

module.exports = router;
