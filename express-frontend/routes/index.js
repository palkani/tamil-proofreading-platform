const express = require('express');
const router = express.Router();
const axios = require('axios');
const http = require('http');
const https = require('https');
const { redirectIfAuth, getCurrentUser, requireAuth } = require('../middleware/auth');

// HTTP Agent pooling for high concurrency (shared with other routes)
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 25,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 25,
  timeout: 30000,
});

const axiosWithPool = axios.create({
  httpAgent: httpAgent,
  httpsAgent: httpsAgent,
  timeout: 30000,
});
const { getSeoData } = require('../config/seo');
const { getRegionalBackendUrl } = require('../utils/regional-backend');
const fileBlog = require('../utils/fileBlog');

// Stamp the regional backend URL once per request.
router.use((req, res, next) => {
  req._backendUrl = getRegionalBackendUrl(req);
  next();
});

// Module-level fallback for the sitemap route (called from an async callback
// that may not have req in scope at the point of the BACKEND_URL reference).
function getBackendApiUrl() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  if (baseUrl.endsWith('/api/v1')) return baseUrl;
  return baseUrl.replace(/\/$/, '') + '/api/v1';
}
const BACKEND_URL = getBackendApiUrl(); // fallback — handlers use req._backendUrl

// Retry GET on backend 503 (Cloud Run cold start) or 502 (instance restarting).
//
// Previous version only retried when the response body was JSON containing
// `{status: "starting"}` — but Cloud Run's native cold-start 503 returns a
// ~108-byte HTML/text page with no JSON, so the retry never fired in
// practice. Now we retry on ANY 5xx that might be transient (502/503/504).
//
// Backoff is exponential: 2s → 4s → 8s. Total worst case ≈ 14s + 3 request
// timeouts. Cloud Run cold starts of this Go binary land in 5–15s, so 4
// attempts is enough to wait through one cold start.
async function getWithColdStartRetry(url, options = {}, maxRetries = 4) {
  const TRANSIENT_STATUSES = new Set([502, 503, 504]);
  let lastRes = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await axiosWithPool.get(url, { ...options, validateStatus: () => true });
    lastRes = res;
    if (!TRANSIENT_STATUSES.has(res.status)) return res;
    if (attempt < maxRetries) {
      const delayMs = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[backend-retry] ${res.status} on ${url} — retry ${attempt}/${maxRetries - 1} in ${delayMs}ms`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return lastRes;
}

// Demo banner should only show in development / explicit demo deployments.
// NOTE: keep false by default in production.
function isDemoModeEnabled() {
  const v = String(process.env.DEMO_MODE || '').toLowerCase().trim();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() === 'production') return false;
  // Default: enabled in non-production environments.
  return process.env.NODE_ENV !== 'production';
}

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
  // File posts only — synchronous, no backend dependency, keeps homepage fast
  // and reliable. Authority links from the homepage to these posts help them
  // get crawled and indexed.
  const latestPosts = fileBlog.getAllPosts().slice(0, 6);
  res.render('pages/home', {
    title: seo.title,
    seo: seo,
    user: user,
    latestPosts,
  });
});

// Legacy /home URL: permanently redirect to canonical homepage for SEO
router.get('/home', (req, res) => {
  return res.redirect(301, '/');
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

// OCR is temporarily under maintenance. Both /tools/ocr (printed) and
// /tools/handwriting-ocr render the shared ocr-maintenance view so a
// visitor who lands on either URL directly (bookmark, search result,
// "related reading" link from a blog post) sees a clean maintenance
// message instead of a half-working tool that errors on PDF upload
// with "OCR server not set up".
//
// SEO note: we still return 200 OK for both URLs so Google keeps the
// flagship landing pages indexed. The maintenance view is short-lived
// and reverting is trivial. If maintenance stretches beyond a few
// weeks, add <meta name="robots" content="noindex, follow"> to the
// maintenance view and revisit.
//
// To restore OCR:
//   1. Change res.render targets below back to 'pages/ocr-tool' and
//      'pages/handwriting-ocr-tool'.
//   2. Comment out both router.use() gates in routes/api.js (search
//      for `ocrMaintenanceHandler`) so the real API endpoints handle
//      requests again.
//   3. Revert commit 38855f5 to re-enable the sitewide OCR CTAs.
router.get('/tools/ocr', (req, res) => {
  const user = getCurrentUser(req);
  // noIndex=true so the maintenance view drops out of Google's index —
  // pairs with the removal of both URLs from sitemap.xml above.
  const seo = { ...(getSeoData('ocrTool') || {}), noIndex: true };
  res.render('pages/ocr-maintenance', {
    title: 'Tamil OCR — Under Maintenance | ProofTamil',
    seo: seo,
    user: user
  });
});

// /tools/handwriting-ocr — split by OCR v2 beta feature flag:
//   - Beta users (email on OCR_V2_BETA_EMAILS or admin allowlist) →
//     render the new OCR v2 UI, which POSTs to /api/ocr-v2/pipeline.
//   - Everyone else → maintenance page as before.
// When we open the beta to all Pro users, expand OCR_V2_BETA_EMAILS.
// When we open to all users, revert this to always-render the OCR v2 UI.
router.get('/tools/handwriting-ocr', (req, res) => {
  const user = getCurrentUser(req);
  const { isOcrV2BetaUser } = require('../middleware/ocrV2Beta');
  const inBeta = isOcrV2BetaUser(req);

  if (inBeta) {
    const seo = { ...(getSeoData('handwritingOcrTool') || {}), noIndex: true };
    return res.render('pages/handwriting-ocr-v2', {
      title: 'Handwriting OCR (Beta) | ProofTamil',
      seo: seo,
      user: user,
    });
  }
  const seo = { ...(getSeoData('handwritingOcrTool') || {}), noIndex: true };
  res.render('pages/ocr-maintenance', {
    title: 'Tamil Handwriting OCR — Under Maintenance | ProofTamil',
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

// AI Content Writer drafts list - requires login
router.get('/tools/ai-content-writer/drafts', requireAuth, (req, res) => {
  const user = getCurrentUser(req) || null;
  const seo = getSeoData('aiContentWriterTool') || getSeoData('home');
  res.render('pages/ai-content-drafts', {
    title: 'My AI Content drafts | ProofTamil',
    seo: seo,
    user: user
  });
});

// Blog (public) - hosted posts
router.get('/blog', async (req, res) => {
  const user = getCurrentUser(req);
  const page = Number(req.query.page || 1) || 1;
  // Free-text search — backs the WebSite SearchAction JSON-LD (/blog?q={term}).
  const q = String(req.query.q || '').trim().toLowerCase();
  const applyQ = (posts) => !q ? posts : posts.filter((p) =>
    (p.title || '').toLowerCase().includes(q) ||
    (p.excerpt || '').toLowerCase().includes(q) ||
    (p.keywords || '').toLowerCase().includes(q));
  const seoBase = getSeoData('blog') || getSeoData('home');
  const seo = {
    ...seoBase,
    canonical: `https://www.prooftamil.com/blog${page > 1 ? `?page=${page}` : ''}`,
    pageType: 'blogIndex',
  };
  try {
    const blogUrl = `${req._backendUrl}/blog/posts`;
    console.log(`[BLOG] Fetching posts from: ${blogUrl}`);
    
    const backendRes = await getWithColdStartRetry(blogUrl, {
      params: { page, limit: 12 },
      timeout: 10000,
    });
    
    console.log(`[BLOG] Backend response: status=${backendRes.status}, posts=${backendRes.data?.posts?.length || 0}`);
    
    const filePosts = fileBlog.getAllPosts();
    if (backendRes.status < 200 || backendRes.status >= 300) {
      const msg = backendRes.data?.error || `HTTP ${backendRes.status}`;
      console.error(`[BLOG] Backend error: ${msg}`, backendRes.data);
      return res.render('pages/blog-index', {
        title: 'Blog | ProofTamil',
        seo,
        user,
        posts: applyQ(filePosts),
        error: filePosts.length ? null : msg,
        page,
        limit: 12,
      });
    }
    const dbPosts = backendRes.data?.posts || [];
    const fileSlugs = new Set(filePosts.map((p) => p.slug));
    const merged = [...filePosts, ...dbPosts.filter((p) => !fileSlugs.has(p.slug))]
      .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
    console.log(`[BLOG] Rendering ${merged.length} posts (${filePosts.length} file, ${dbPosts.length} db)`);
    return res.render('pages/blog-index', {
      title: 'Blog | ProofTamil',
      seo,
      user,
      posts: applyQ(merged),
      error: null,
      page,
      limit: 12,
    });
  } catch (e) {
    console.error(`[BLOG] Error fetching posts:`, e.message);
    const filePosts = fileBlog.getAllPosts();
    return res.render('pages/blog-index', {
      title: 'Blog | ProofTamil',
      seo,
      user,
      posts: filePosts,
      error: filePosts.length ? null : (e.message || 'Failed to load posts'),
      page,
      limit: 12,
    });
  }
});

// RSS feed for blog (public) — must be before /blog/:slug so "rss.xml" is not treated as a slug
router.get('/blog/rss.xml', async (req, res) => {
  const baseUrl = 'https://www.prooftamil.com';
  try {
    const backendRes = await getWithColdStartRetry(`${req._backendUrl}/blog/posts`, {
      params: { page: 1, limit: 50 },
      timeout: 10000,
    });
    const dbPosts = backendRes.status >= 200 && backendRes.status < 300 ? (backendRes.data?.posts || []) : [];
    const filePosts = fileBlog.getAllPosts();
    const fileSlugs = new Set(filePosts.map((p) => p.slug));
    const posts = [...filePosts, ...dbPosts.filter((p) => !fileSlugs.has(p.slug))]
      .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));

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
        const link = `${baseUrl}/blog/${p.slug}`;
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

// Build the full SEO/JSON-LD object for a single blog post. Shared by the
// file-seed and backend-fetched render paths so both produce identical
// titles, meta descriptions, OG tags, and BlogPosting schema.
function buildPostSeo(post, slug, seoBase) {
  const canonical = `https://www.prooftamil.com/blog/${post.slug || slug}`;
  const desc =
    (post.meta_description && String(post.meta_description).trim()) ||
    (post.excerpt && String(post.excerpt).trim()) ||
    String(post.content_text || '').trim().slice(0, 160);
  const keywords = [post.keywords, seoBase.keywords].filter(Boolean).join(', ');
  const publishedIso = post.published_at ? new Date(post.published_at).toISOString() : null;
  const modifiedIso = post.updated_at ? new Date(post.updated_at).toISOString() : (post.created_at ? new Date(post.created_at).toISOString() : null);
  const isTamil = (post.language || 'tamil') === 'tamil';
  const langCode = isTamil ? 'ta' : 'en';
  const ogLocale = isTamil ? 'ta_IN' : 'en_US';

  const jsonLdObj = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": canonical + "#article",
    "headline": post.title,
    "description": desc,
    "inLanguage": langCode,
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "url": canonical,
    "datePublished": publishedIso || undefined,
    "dateModified": modifiedIso || undefined,
    "image": {
      "@type": "ImageObject",
      "url": "https://www.prooftamil.com/images/favicon-512x512.png",
      "width": 512,
      "height": 512
    },
    "author": {
      "@type": "Organization",
      "name": "ProofTamil",
      "url": "https://www.prooftamil.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "ProofTamil",
      "url": "https://www.prooftamil.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://www.prooftamil.com/images/favicon-512x512.png",
        "width": 512,
        "height": 512
      }
    },
    "isPartOf": {
      "@type": "Blog",
      "@id": "https://www.prooftamil.com/blog#blog",
      "name": "ProofTamil Blog",
      "publisher": { "@type": "Organization", "name": "ProofTamil" }
    }
  };

  return {
    ...seoBase,
    title: `${post.title} | ProofTamil`,
    ogTitle: post.title,
    description: desc,
    ogDescription: desc,
    keywords,
    canonical,
    pageType: 'blogPost',
    htmlLang: langCode,
    ogLocale,
    hreflang: langCode,
    article: {
      publishedTime: publishedIso,
      modifiedTime: modifiedIso,
      section: 'Blog',
    },
    jsonLd: JSON.stringify(jsonLdObj),
  };
}

// Pick up to 4 sibling posts to show in a "Related posts" block at the bottom
// of each blog page. Boosts internal link graph density (every blog post now
// links to 4 others), which is the single biggest unblocker for "Discovered -
// currently not indexed" pages in Search Console.
//
// Ranking: same language (+10) > keyword/title token overlap (+2 per shared
// meaningful word). File posts always considered; backend posts fetched with
// a 3s timeout and gracefully skipped on failure (the page still renders
// with file-only related posts even if the backend is cold-starting).
async function getRelatedPosts(currentPost, backendUrl) {
  const filePosts = fileBlog.getAllPosts();
  let backendPosts = [];
  try {
    const res = await getWithColdStartRetry(`${backendUrl}/blog/posts`, {
      params: { page: 1, limit: 12 },
      timeout: 3000,
    });
    if (res && res.status >= 200 && res.status < 300) {
      backendPosts = res.data?.posts || [];
    }
  } catch (e) {
    // Best-effort — file posts alone are still a useful related set.
  }

  const fileSlugs = new Set(filePosts.map((p) => p.slug));
  const candidates = [
    ...filePosts,
    ...backendPosts.filter((p) => p && p.slug && !fileSlugs.has(p.slug)),
  ].filter((p) => p && p.slug && p.slug !== currentPost.slug && p.title);

  if (!candidates.length) return [];

  // Stop-words: domain-specific noise that would over-weight every post.
  const STOP = new Set([
    'tamil', 'english', 'prooftamil', 'com', 'www', 'https', 'http',
    'with', 'that', 'from', 'have', 'this', 'they', 'will', 'what',
    'your', 'into', 'using', 'guide', 'online', 'free', 'best',
    'how', 'the', 'and', 'for', 'are', 'you',
  ]);
  const tokens = (s) =>
    String(s || '')
      .toLowerCase()
      .split(/[^a-z஀-௿]+/)
      .filter((t) => t.length > 3 && !STOP.has(t));

  const currentTokens = new Set([
    ...tokens(currentPost.title),
    ...tokens(currentPost.keywords),
    ...tokens(currentPost.meta_description),
  ]);
  const currentLang = currentPost.language || 'tamil';

  const scored = candidates.map((p) => {
    let score = 0;
    if ((p.language || 'tamil') === currentLang) score += 10;
    const otherTokens = new Set([
      ...tokens(p.title),
      ...tokens(p.keywords),
      ...tokens(p.meta_description),
    ]);
    let overlap = 0;
    for (const t of currentTokens) if (otherTokens.has(t)) overlap++;
    score += overlap * 2;
    return { post: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map((s) => s.post);
}

router.get('/blog/:slug', async (req, res) => {
  const user = getCurrentUser(req);
  const seoBase = getSeoData('blogPost') || getSeoData('home');
  const slug = String(req.params.slug || '').trim();

  // File-based seeds take precedence on slug collision (hand-curated SEO content).
  // Short-circuit so file posts never depend on the backend being reachable.
  const filePost = fileBlog.getPostBySlug(slug);
  if (filePost) {
    const relatedPosts = await getRelatedPosts(filePost, req._backendUrl);
    return res.render('pages/blog-post', {
      title: `${filePost.title} | ProofTamil`,
      seo: buildPostSeo(filePost, slug, seoBase),
      user,
      post: filePost,
      relatedPosts,
      error: null,
    });
  }

  try {
    const backendRes = await getWithColdStartRetry(
      `${req._backendUrl}/blog/posts/${encodeURIComponent(slug)}`,
      { timeout: 10000 }
    );
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
        seo: seoBase,
        user,
        post: null,
        relatedPosts: [],
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
        relatedPosts: [],
        error: 'Invalid backend response',
      });
    }

    console.log('[BLOG-POST] Fetched post:', post.slug,
      'content_html length:', post.content_html?.length || 0,
      'content_text length:', post.content_text?.length || 0);

    const relatedPosts = await getRelatedPosts(post, req._backendUrl);

    return res.render('pages/blog-post', {
      title: `${post.title} | ProofTamil`,
      seo: buildPostSeo(post, slug, seoBase),
      user,
      post,
      relatedPosts,
      error: null,
    });
  } catch (e) {
    return res.render('pages/blog-post', {
      title: 'Blog | ProofTamil',
      seo: seoBase,
      user,
      post: null,
      relatedPosts: [],
      error: e.message || 'Failed to load post',
    });
  }
});

// My Blogs (protected) - list current user's posts (draft + published)
router.get('/my-blogs', requireAuth, async (req, res) => {
  const user = getCurrentUser(req);
  // Restrict My Blogs to admin-only as requested.
  // Only allow the specified admin email (and prooftamil@gmail.com as a safe fallback).
  const allowed = ['palkani.r@gmail.com', 'prooftamil@gmail.com', 'banu.palkani@gmail.com', 'contact@prooftamil.com'];
  if (!user || !user.email || !allowed.includes(String(user.email).toLowerCase())) {
    return res.redirect(302, '/drafts');
  }
  const seo = getSeoData('myBlogs') || getSeoData('home');
  try {
    const headers = {};
    if (req.headers.cookie) headers.cookie = req.headers.cookie;
    if (req.headers.authorization) headers.authorization = req.headers.authorization;

    const backendRes = await axiosWithPool.get(`${req._backendUrl}/blog/me/posts`, {
      params: { limit: 200 },
      headers,
      withCredentials: true,
      timeout: 10000,
      validateStatus: () => true,
    });

    if (backendRes.status < 200 || backendRes.status >= 300) {
      const msg = backendRes.data?.error || `HTTP ${backendRes.status}`;
      return res.render('pages/my-blogs', {
        title: seo.title,
        seo,
        user,
        posts: [],
        error: msg,
      });
    }

    const posts = backendRes.data?.posts || [];
    return res.render('pages/my-blogs', {
      title: seo.title,
      seo,
      user,
      posts,
      error: null,
    });
  } catch (e) {
    return res.render('pages/my-blogs', {
      title: seo.title,
      seo,
      user,
      posts: [],
      error: e.message || 'Failed to load your posts',
    });
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
  // Belt-and-braces: if the user just logged out (?logout=1), do NOT bounce them
  // back to /drafts even if a stale access_token cookie is still attached. Also
  // re-issue Set-Cookie deletions so the next request lands without auth.
  const justLoggedOut = req.query.logout === '1';
  if (justLoggedOut) {
    const variants = [
      { path: '/', secure: true, sameSite: 'lax' },
      { path: '/', secure: true, sameSite: 'lax', domain: '.prooftamil.com' },
      { path: '/', secure: true, sameSite: 'none' },
      { path: '/', secure: true, sameSite: 'none', domain: '.prooftamil.com' },
    ];
    ['access_token', 'proof_refresh_token', 'refresh_token'].forEach((name) => {
      variants.forEach((opts) => res.clearCookie(name, opts));
    });
    req.user = null;
  }

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
  const rawError = req.query.error || null;
  const errorMessage = rawError === 'backend_starting'
    ? 'Backend is starting. Please try again in 30 seconds.'
    : rawError;
  res.render('pages/login', {
    title: seo.title,
    seo: seo,
    error: errorMessage,
    googleClientId: GOOGLE_CLIENT_ID,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    redirectTo: req.query.redirect || '/drafts',
    demoMode: isDemoModeEnabled(),
  });
});

// Resolve Google Client ID once. Must be xxx.apps.googleusercontent.com (never a domain like prooftamil.com).
const _rawGoogleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_ID = (_rawGoogleClientId && _rawGoogleClientId.includes('.apps.googleusercontent.com'))
  ? _rawGoogleClientId.trim()
  : '991187041222-dp582s8kvqqktpq3t0bihl43e4iv8m5i.apps.googleusercontent.com';
// Supabase (for Google sign-in via Supabase)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

// Auth callback: Supabase OAuth redirect lands here with hash (#access_token=...). Exchange for app session and redirect.
router.get('/auth/callback', (req, res) => {
  const redirectTo = (typeof req.query.redirect === 'string' && req.query.redirect.startsWith('/'))
    ? req.query.redirect
    : '/drafts';
  res.render('pages/auth-callback', {
    title: 'Signing you in',
    redirectTo,
    supabaseUsed: !!(SUPABASE_URL && SUPABASE_ANON_KEY),
    // Auth handoff page must never be indexed — leaks no content, just a transient redirect.
    seo: { title: 'Signing you in', description: 'Authentication callback', noIndex: true },
  });
});

// Forgot password page - render form to request a reset link
router.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/drafts');
  const seo = getSeoData('login') || getSeoData('home');
  res.render('pages/forgot-password', {
    title: 'Forgot Password | ProofTamil',
    seo,
    user: null,
  });
});

// Reset password page - render form to set new password (token comes from query string)
router.get('/reset-password', (req, res) => {
  const token = String(req.query.token || '').slice(0, 200);
  if (!token) return res.redirect('/forgot-password');
  const seo = getSeoData('login') || getSeoData('home');
  res.render('pages/reset-password', {
    title: 'Reset Password | ProofTamil',
    seo,
    user: null,
    token,
  });
});

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

  // Set ref_code cookie server-side when ?ref= is in URL (handles direct register links).
  // Hardened: HttpOnly (only read server-side on /register POST), Secure in prod.
  if (req.query.ref) {
    const refCode = String(req.query.ref).replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    if (refCode) {
      res.cookie('ref_code', refCode, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    }
  }

  const seo = getSeoData('register');
  res.render('pages/register', {
    title: seo.title,
    seo: seo,
    googleClientId: GOOGLE_CLIENT_ID,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    redirectTo: req.query.redirect || '/drafts',
    demoMode: isDemoModeEnabled(),
  });
});

// /signup is a legacy alias for /register
router.get('/signup', (req, res) => {
  return res.redirect(301, '/register');
});

// Note: Login and registration form submissions are handled client-side via /auth/login and /auth/register
// These routes are handled by routes/auth.js which proxies to the backend

// Provide Google Client ID to frontend
router.get('/api/config/google-client-id', (req, res) => {
  res.json({ 
    clientId: GOOGLE_CLIENT_ID 
  });
});

// Dashboard removed: redirect to Drafts
router.get('/dashboard', (req, res) => {
  return res.redirect(302, '/drafts');
});

// Account page - client-side auth only
router.get('/account', requireAuth, (req, res) => {
  const seo = getSeoData('account');
  res.render('pages/account', {
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Subscription page - shows plan status or upgrade CTA
router.get('/subscription', (req, res) => {
  res.render('pages/subscription', {
    title: 'Pro Access — ProofTamil',
    seo: { title: 'Pro Access — ProofTamil', description: 'Manage your ProofTamil Pro access.', noIndex: true },
    user: req.user
  });
});


// Pricing page — gated by PAYMENTS_ENABLED env var
router.get('/pricing', async (req, res) => {
  const paymentsEnabled = req.app.locals.paymentsEnabled;
  const user = getCurrentUser(req);
  const seo = getSeoData('pricing');

  if (!paymentsEnabled) {
    return res.render('pages/pricing', {
      title: seo.title,
      seo,
      user,
      paymentsEnabled: false,
      monthly: null,
      yearly: null,
      countryCode: 'US',
      error: false
    });
  }

  // Geo-detect country from CDN/proxy headers. `?country=XX` is a preview override
  // for testing regional views (e.g. /pricing?country=IN) — DISPLAY ONLY; the actual
  // charge is recomputed server-side by the customer's real geo at checkout, so this
  // can't be used to pay another region's price.
  const countryCode = (
    req.query.country ||
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    'US'
  ).toUpperCase().slice(0, 2);

  // Normalize pricing from API response and add display_price
  const normalizePricing = (data) => {
    const p = data?.pricing || data;
    if (!p || p.final_price_cents == null) return null;
    const cents = p.final_price_cents;
    const currency = p.currency || 'USD';
    const displayPrice = currency === 'INR'
      ? String(Math.round(cents / 100))
      : (cents / 100).toFixed(2);
    return { ...p, display_price: displayPrice, currency };
  };

  // Fallback pricing when API fails (based on plan defaults)
  const fallbackPricing = (countryCode) => {
    const isIndia = countryCode === 'IN';
    return {
      monthly: isIndia
        ? { display_price: '1000', currency: 'INR' }
        : { display_price: '12.00', currency: 'USD' },
      yearly: isIndia
        ? { display_price: '9599', currency: 'INR' }
        : { display_price: '115.20', currency: 'USD' }
    };
  };

  try {
    const backendUrl = (process.env.BACKEND_URL_PRIMARY || process.env.BACKEND_URL || 'http://localhost:8080').replace(/\/$/, '');
    const [monthlyRes, yearlyRes] = await Promise.all([
      axiosWithPool.get(`${backendUrl}/api/v1/billing/pricing?plan_code=PRO_MONTHLY&country_code=${countryCode}`, { validateStatus: () => true }),
      axiosWithPool.get(`${backendUrl}/api/v1/billing/pricing?plan_code=PRO_YEARLY&country_code=${countryCode}`, { validateStatus: () => true })
    ]);
    let monthly = normalizePricing(monthlyRes.status === 200 ? monthlyRes.data : null);
    let yearly = normalizePricing(yearlyRes.status === 200 ? yearlyRes.data : null);
    const apiFailed = !monthly && !yearly;
    if (apiFailed) {
      const fallback = fallbackPricing(countryCode);
      monthly = fallback.monthly;
      yearly = fallback.yearly;
    }
    res.render('pages/pricing', {
      title: seo.title,
      seo,
      user,
      paymentsEnabled: true,
      countryCode,
      monthly,
      yearly,
      error: false,
      pricingFromCache: apiFailed
    });
  } catch (_err) {
    console.error('[PRICING] Failed to fetch pricing:', _err.message);
    const fallback = fallbackPricing(countryCode);
    res.render('pages/pricing', {
      title: seo.title,
      seo,
      user,
      paymentsEnabled: true,
      monthly: fallback.monthly,
      yearly: fallback.yearly,
      countryCode,
      error: false,
      pricingFromCache: true
    });
  }
});

// Billing return URL — Dodo (and legacy Stripe/Razorpay) redirect here
// AFTER the checkout flow, regardless of whether payment actually
// succeeded. Dodo puts the outcome in the `status` query param:
//   status=active   — payment confirmed
//   status=pending  — payment not confirmed (user closed tab / abandoned)
//   status=failed   — attempt was made and refused
//
// Previously this handler ignored the status and unconditionally
// rendered "Payment Successful!" — so a user who abandoned checkout
// and later hit the return URL saw a lie. Fix: read status +
// subscription_id and let the template render the correct state.
//
// The template also gets `verifiedByBackend` when possible: if the user
// is logged in, we call the backend to confirm their Pro flag actually
// flipped. Two-signal check reduces the class of "URL says active but
// DB says free" incidents (which would be an even sneakier version of
// today's bug).
// Interstitial before the Dodo Payments hosted checkout.
//
// Dodo's checkout.dodopayments.com page has no in-page "back to site"
// button — users who land there and change their mind had no path
// home except the browser back button. This route inserts a
// one-second bounce page between /pricing and Dodo:
//
//   /pricing → /checkout/redirecting?url=<dodo>&plan=<code>
//            → (1s + explicit Continue btn) → Dodo checkout
//
// From Dodo, browser-back returns to this page (with a persistent
// "Back to pricing" button) instead of the pricing page directly
// (which would re-trigger checkout on a misclick).
//
// The client-side JS validates the `url` param is on a real
// dodopayments.com host — never blind-redirects, so this route
// can't be abused as an open redirector for phishing.
router.get('/checkout/redirecting', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('checkoutRedirecting') || getSeoData('home') || {};
  res.render('pages/checkout-redirecting', {
    title: 'Redirecting to secure checkout · ProofTamil',
    seo: { ...seo, noIndex: true },   // interstitial — never index
    user,
  });
});

router.get('/billing/success', async (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('billingSuccess');

  const urlStatus = String(req.query.status || '').toLowerCase();
  const subscriptionId = String(req.query.subscription_id || '').slice(0, 200);
  const sessionId = String(req.query.session_id || '').slice(0, 200);

  const backendURL =
    (process.env.BACKEND_URL_US || process.env.BACKEND_URL || 'https://api.prooftamil.com')
      .replace(/\/$/, '');

  // Signal 1 — checkout_attempt freshness. Dodo's payment_link expires
  // after 15 min on their side (their timer). We enforce the same
  // window server-side so a user landing here AFTER Dodo's timer
  // expired (via bookmark, back button, or a delayed redirect) sees
  // the "session expired" state instead of any success/pending UI.
  let checkoutStatus = null; // 'active' | 'pending' | 'expired' | 'not_found'
  let secondsRemaining = 0;
  if (subscriptionId) {
    try {
      const resp = await axios.get(
        backendURL + '/api/v1/billing/checkout-status',
        { params: { subscription_id: subscriptionId }, timeout: 5000, validateStatus: () => true }
      );
      if (resp.status === 200 && resp.data) {
        checkoutStatus = resp.data.status;
        secondsRemaining = resp.data.seconds_remaining || 0;
      }
    } catch (err) {
      console.warn('[BILLING] checkout-status fetch failed:', err.message);
    }
  }

  // Signal 2 — backend Pro state for the logged-in user. Belt and
  // suspenders in case the checkout_attempt lookup missed (older
  // checkouts pre-CheckoutAttempts table, or a Dodo webhook that
  // arrived before we recorded the attempt for some reason).
  let verifiedByBackend = null;
  if (user && req.cookies && req.cookies.access_token) {
    try {
      const resp = await axios.get(backendURL + '/api/v1/billing/me', {
        headers: { Authorization: 'Bearer ' + req.cookies.access_token },
        timeout: 5000,
        validateStatus: () => true,
      });
      if (resp.status === 200 && resp.data && resp.data.billing) {
        verifiedByBackend = !!resp.data.billing.is_premium;
      }
    } catch (err) {
      console.warn('[BILLING] verify failed:', err.message);
    }
  }

  // Decide which state the page renders. Precedence:
  //   1. If our checkout_attempt says 'active' OR the user's DB row says
  //      Pro → success (the two source-of-truth signals we control).
  //   2. If checkout_attempt says 'expired' → expired state, regardless
  //      of what the URL says.
  //   3. Otherwise → pending state (fresh session, awaiting confirmation).
  const paymentConfirmed =
    checkoutStatus === 'active' || verifiedByBackend === true;
  const sessionExpired =
    !paymentConfirmed && checkoutStatus === 'expired';

  res.render('pages/billing-success', {
    title: paymentConfirmed
      ? seo.title
      : (sessionExpired ? 'Checkout session expired - ProofTamil' : 'Confirming your payment - ProofTamil'),
    seo,
    user,
    sessionId,
    subscriptionId,
    status: urlStatus,
    paymentConfirmed,
    sessionExpired,
    secondsRemaining,
    verifiedByBackend,
  });
});

// Billing cancel page — user cancelled checkout
router.get('/billing/cancel', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('billingCancel');
  res.render('pages/billing-cancel', {
    title: seo.title,
    seo,
    user,
    paymentsEnabled: req.app.locals.paymentsEnabled
  });
});


// Archive/Trash: redirect to Drafts Trash tab
router.get('/archive', (req, res) => {
  return res.redirect(302, '/drafts#trash');
});

// Drafts page - MUST be protected (never show drafts when logged out / expired)
router.get('/drafts', requireAuth, (req, res) => {
  try {
    // Prevent browser caching/back-button showing drafts after logout.
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const user = getCurrentUser(req) || null;
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

// Self-serve data page (GDPR Article 15/17): download a copy or request
// deletion. Requires auth so we know whose data to export/delete.
router.get('/account/data', requireAuth, (req, res) => {
  res.render('pages/account-data', {
    title: 'Your data | ProofTamil',
    seo: {
      title: 'Your data | ProofTamil',
      description: 'Export or delete your ProofTamil account data.',
      noIndex: true,
    },
    user: getCurrentUser(req),
  });
});

// Public security page — encryption posture, sub-processors, incident
// response, and vulnerability disclosure contact.
router.get('/security', (req, res) => {
  const user = getCurrentUser(req);
  res.render('pages/security', {
    title: 'Security | ProofTamil',
    seo: {
      title: 'Security | ProofTamil',
      description: 'How ProofTamil protects your account, drafts, and payments — encryption, sub-processors, incident response, and vulnerability disclosure.',
      canonical: 'https://www.prooftamil.com/security',
    },
    user: user,
  });
});

// Sitemap.xml - SEO optimisation
// Serves static pages immediately; best-effort includes published blog posts
// fetched from the backend (10-minute in-memory cache keeps it fast on serverless).
router.get('/sitemap.xml', (req, res) => {
  const BASE_URL = 'https://www.prooftamil.com';
  const currentDate = new Date().toISOString().split('T')[0];

  const pages = [
    { url: '/',                       priority: '1.0',  changefreq: 'weekly',  lastmod: currentDate },
    { url: '/free-tamil-editor',      priority: '0.95', changefreq: 'weekly',  lastmod: '2026-04-19' },
    // OCR URLs removed from sitemap while the feature is offline. The
    // pages still return 200 with a maintenance view (see /tools/ocr
    // and /tools/handwriting-ocr routes above) + <meta robots noindex>
    // so Google will drop them from the index within a few weeks. Add
    // both entries back when OCR is restored.
    { url: '/tools/ai-content-writer',priority: '0.80', changefreq: 'monthly', lastmod: '2026-02-01' },
    { url: '/how-to-use',             priority: '0.80', changefreq: 'monthly', lastmod: '2026-03-01' },
    { url: '/blog',                   priority: '0.80', changefreq: 'weekly',  lastmod: currentDate },
    { url: '/pricing',                priority: '0.75', changefreq: 'monthly', lastmod: '2026-03-01' },
    { url: '/contact',                priority: '0.60', changefreq: 'yearly',  lastmod: '2025-12-01' },
    { url: '/privacy',                priority: '0.30', changefreq: 'yearly',  lastmod: '2025-12-01' },
    { url: '/terms',                  priority: '0.30', changefreq: 'yearly',  lastmod: '2025-12-01' },
    { url: '/security',               priority: '0.40', changefreq: 'yearly',  lastmod: '2026-08-19' },
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
    sitemap += `    <loc>${escapeXml(BASE_URL + page.url)}</loc>\n`;
    sitemap += `    <lastmod>${page.lastmod || currentDate}</lastmod>\n`;
    sitemap += `    <changefreq>${page.changefreq}</changefreq>\n`;
    sitemap += `    <priority>${page.priority}</priority>\n`;
    sitemap += '  </url>\n';
  });

  // File-based seed blog posts — added unconditionally (not subject to backend cache).
  const fileBlogUrls = fileBlog.getAllPosts().map((p) => ({
    loc: `${BASE_URL}/blog/${p.slug}`,
    lastmod: (p.updated_at || p.published_at || '').slice(0, 10) || currentDate,
    changefreq: 'monthly',
    priority: '0.70',
  }));

  global.__sitemapBlogCache = global.__sitemapBlogCache || { ts: 0, urls: [] };

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

  const now = Date.now();
  const isCacheFresh = now - (global.__sitemapBlogCache.ts || 0) < 10 * 60 * 1000;
  const cached = Array.isArray(global.__sitemapBlogCache.urls) ? global.__sitemapBlogCache.urls : [];

  const sendSitemap = () => {
    sitemap += '</urlset>';
    res.header('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.send(sitemap);
  };

  // Always include file-based seed blog URLs first (slug-deduped against db cache).
  const fileSlugs = new Set(fileBlogUrls.map((u) => u.loc));
  addBlogUrls(fileBlogUrls);

  if (isCacheFresh && cached.length) {
    addBlogUrls(cached.filter((u) => !fileSlugs.has(u.loc)));
    return sendSitemap();
  }

  // The Go backend mishandles large `limit` values: limit=200 returns only ~10
  // posts, while limit=12 returns 12. Until that's fixed server-side, paginate
  // in pages of 12 and stop on the first short/empty page.
  // Backend cold start can add ~6s, so 8s timeout per page absorbs one retry.
  const PAGE_SIZE = 12;
  const MAX_PAGES = 20; // 240 posts max — safety bound, not expected ceiling
  const fetchAll = async () => {
    const out = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      const r = await getWithColdStartRetry(`${req._backendUrl}/blog/posts`, {
        params: { page: p, limit: PAGE_SIZE },
        timeout: 8000,
      });
      if (r.status < 200 || r.status >= 300) break;
      const posts = r.data?.posts || [];
      if (posts.length === 0) break;
      out.push(...posts);
      if (posts.length < PAGE_SIZE) break;
    }
    return out;
  };

  fetchAll()
    .then((posts) => {
      const blogUrls = posts
        .filter((p) => {
          const slug = String(p?.slug || p?.Slug || '').trim();
          // Drop test/placeholder posts (slugs like post-2, post-3) that
          // shouldn't be indexed.
          return slug && !/^post-\d+$/.test(slug);
        })
        .map((p) => {
          const slug = String(p.slug || p.Slug || '').trim();
          const updated = String(
            p.updated_at || p.updatedAt || p.UpdatedAt ||
            p.published_at || p.publishedAt || p.PublishedAt || ''
          ).slice(0, 10);
          return {
            loc: `${BASE_URL}/blog/${slug}`,
            lastmod: updated || currentDate,
            changefreq: 'monthly',
            priority: '0.65',
          };
        });
      // Update cache only on a non-empty fetch — preserves prior good data on
      // partial backend failure.
      if (blogUrls.length) {
        global.__sitemapBlogCache = { ts: Date.now(), urls: blogUrls.slice(0, 500) };
      }
      const toAdd = blogUrls.length ? blogUrls : cached;
      addBlogUrls(toAdd.filter((u) => !fileSlugs.has(u.loc)));
      return sendSitemap();
    })
    .catch(() => {
      // Backend unreachable — serve stale cache rather than dropping all posts.
      if (cached.length) addBlogUrls(cached.filter((u) => !fileSlugs.has(u.loc)));
      return sendSitemap();
    });
});

// ── AI-SEO machine-readable files ────────────────────────────────────────────
// /llms.txt — context file for AI assistants (llmstxt.org standard)
// /pricing.md — structured pricing for AI agents evaluating tools
// Served as text so LLMs can parse them without rendering HTML.
router.get('/llms.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile('llms.txt', { root: require('path').join(__dirname, '../public') });
});

router.get('/pricing.md', (req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile('pricing.md', { root: require('path').join(__dirname, '../public') });
});
// ─────────────────────────────────────────────────────────────────────────────

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
      url: `${req._backendUrl}/auth/logout`,
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
