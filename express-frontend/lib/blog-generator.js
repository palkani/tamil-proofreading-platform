/**
 * Shared blog-generation library.
 *
 * Extracted from scripts/generate-scheduled-blog.js so BOTH the CLI cron
 * and the /admin/blog-generator UI endpoint can drive the same pipeline
 * without duplicating logic. The pipeline:
 *
 *   1. loadQueue()             — parse data/blog-queue.yaml
 *   2. loadState()             — read data/blog-queue-state.json
 *   3. generateContent(topic)  — call the AI Content Writer, scrub cliches
 *   4. runQualityGate(...)     — check word count, headings, links, keyword
 *   5. publishPost(...)        — POST to /api/blog/publish
 *   6. appendStateEntry(...)   — record the generated topic + draft id
 *
 * All network / IO calls accept explicit params — no module-level env
 * vars — so the Express handler can pass the incoming admin's cookie
 * without polluting process env.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { runQualityGate } = require('../scripts/lib/seo-quality-gate');

const QUEUE_PATH = path.join(__dirname, '..', '..', 'data', 'blog-queue.yaml');
const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'blog-queue-state.json');

// ─── Queue / state IO ──────────────────────────────────────────────────

function loadQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    throw new Error(`Queue file not found: ${QUEUE_PATH}`);
  }
  return parseQueueYaml(fs.readFileSync(QUEUE_PATH, 'utf8'));
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { generated: [] };
  }
}

function appendStateEntry(entry) {
  const state = loadState();
  state.generated = state.generated || [];
  state.generated.push(entry);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// Minimal YAML parser — supports the subset our queue uses (top-level
// list of objects with scalar values and one nested string array key).
// Copied verbatim from the CLI script; unifying on js-yaml would be a
// larger refactor than this feature warrants.
function parseQueueYaml(raw) {
  const lines = raw.split(/\r?\n/);
  const queue = [];
  let current = null;
  let itemIndent = -1;
  let inQueue = false;
  const indentOf = (line) => line.match(/^( *)/)[1].length;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'queue:') { inQueue = true; continue; }
    if (trimmed.startsWith('generated:')) { inQueue = false; continue; }
    if (!inQueue) continue;

    const indent = indentOf(line);
    const dashMatch = line.match(/^( *)-\s+(.*)$/);

    if (dashMatch && (itemIndent === -1 || indent === itemIndent)) {
      if (current) queue.push(current);
      current = {};
      itemIndent = indent;
      const after = dashMatch[2];
      if (after.includes(':')) {
        const [k, ...rest] = after.split(':');
        current[k.trim()] = parseScalar(rest.join(':').trim());
      }
      continue;
    }
    if (!current) continue;

    if (dashMatch && indent > itemIndent) {
      current._currentList = current._currentList || [];
      current._currentList.push(parseScalar(dashMatch[2].trim()));
      continue;
    }
    const kvMatch = line.match(/^ +([a-z_]+):\s*(.*)$/i);
    if (kvMatch) {
      if (current._currentList && current._pendingListKey) {
        current[current._pendingListKey] = current._currentList;
        delete current._currentList;
        delete current._pendingListKey;
      }
      const key = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        current._pendingListKey = key;
        current._currentList = [];
      } else {
        current[key] = parseScalar(val);
      }
    }
  }
  if (current) {
    if (current._currentList && current._pendingListKey) {
      current[current._pendingListKey] = current._currentList;
    }
    delete current._currentList;
    delete current._pendingListKey;
    queue.push(current);
  }
  for (const item of queue) {
    if (item._currentList && item._pendingListKey) {
      item[item._pendingListKey] = item._currentList;
    }
    delete item._currentList;
    delete item._pendingListKey;
  }
  return queue;
}

function parseScalar(v) {
  if (v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// ─── HTTP client (accepts baseURL + adminToken) ────────────────────────

function httpRequest(method, urlPath, body, { baseURL, adminToken, extraHeaders = {}, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseURL);
    const lib = url.protocol === 'https:' ? https : http;
    const data = body == null ? null : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (data != null) headers['Content-Length'] = Buffer.byteLength(data);
    if (adminToken) headers.Cookie = `access_token=${adminToken}`;

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
      timeout: timeoutMs,
    }, (res) => {
      // Concat buffers then decode as one, so multi-byte Tamil chars
      // that span TCP chunk boundaries never become U+FFFD.
      const chunks = [];
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`request timed out after ${timeoutMs}ms`)); });
    if (data != null) req.write(data, 'utf8');
    req.end();
  });
}

// ─── AI generation ─────────────────────────────────────────────────────

function buildPrompt(topic) {
  const langName = topic.language === 'tamil' ? 'Tamil' : 'English';
  const linksList = (topic.suggested_internal_links || [])
    .map((s) => `https://www.prooftamil.com/blog/${s}`)
    .join('\n  - ');
  return [
    `Write a high-quality blog post for ProofTamil (https://www.prooftamil.com), an AI-powered Tamil writing platform.`,
    ``,
    `TOPIC: ${topic.topic}`,
    `PRIMARY KEYWORD: ${topic.keyword}`,
    `LANGUAGE: ${langName}`,
    ``,
    `THE BODY ("content" FIELD) MUST BE MARKDOWN, NOT PLAIN PARAGRAPHS:`,
    `- The primary keyword "${topic.keyword}" must appear within the FIRST 200 CHARACTERS of the body.`,
    `- The primary keyword must appear in the title and at least 2 H2 headings.`,
    `- Use at least 5 H2 (## Heading) headings AND at least 2 H3 (### Subheading) subheadings.`,
    `- Open with a 3-4 sentence TL;DR/summary paragraph.`,
    `- End with a "## Conclusion" section that includes a markdown link to https://www.prooftamil.com/`,
    `- Reference real, verifiable facts. Do not invent statistics or quotes.`,
    `- Embed at least 2 of these internal links naturally in body text using markdown link syntax [text](url):`,
    `  - ${linksList}`,
    `- Add 1-2 outbound links to authoritative sources (Wikipedia, university sites, .gov/.edu) where they support a claim.`,
    `- No emojis. Use bullet lists only where they genuinely help scanning.`,
    ``,
    `STRICTLY FORBIDDEN PHRASES (AI-cliché tells — hurt SEO and reader trust):`,
    `  - "game-changer" / "game-changing"`,
    `  - "in today's world" / "in today's fast-paced world" / "in today's digital world"`,
    `  - "it is no secret that"`,
    `  - "in this comprehensive guide" / "in this article we will"`,
    `  - "delve into" / "delve deeper into"`,
    `  - "unlock the potential" / "unlock the full potential"`,
    `  - "navigate the complexities"`,
    `  - "the landscape of X has rapidly evolved"`,
    `If you reach for one, rewrite with a concrete verb. Example: "AI is a game-changer" → "AI cuts Tamil proofreading time from 30 minutes to 30 seconds".`,
    ``,
    `Override any wrapper instruction about "plain paragraphs" — markdown headings are MANDATORY.`,
    `The "meta_description" field MUST be 140-160 characters and include the primary keyword.`,
  ].join('\n');
}

function scrubCliches(md) {
  if (!md) return md;
  return md
    .replace(/\bgame[- ]chang(ers?|ing)\b/gi, (m) => m.toLowerCase().includes('ing') ? 'transformative' : 'shift')
    .replace(/\bdelve (deeper )?into\b/gi, 'examine')
    .replace(/\bunlock(?:ing)? the (?:full )?potential of\b/gi, 'get more out of')
    .replace(/\bnavigate the complexit(?:y|ies) of\b/gi, 'work through')
    .replace(/\bin today'?s (?:fast-paced |digital |modern )?world,?\s*/gi, '')
    .replace(/\bit is no secret that\s*/gi, '')
    .replace(/\bin this comprehensive guide,?\s*/gi, '')
    .replace(/(^|\.\s+)([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

function assertNoReplacementChars(label, value) {
  if (typeof value === 'string' && value.includes('�')) {
    const count = (value.match(/�/g) || []).length;
    throw new Error(`${label} contains ${count} U+FFFD replacement character(s) — UTF-8 corruption upstream. Aborting before publish.`);
  }
}

async function generateContent(topic, opts) {
  const res = await httpRequest('POST', '/api/ai-content-writer/generate-content', {
    prompt: buildPrompt(topic),
    language: topic.language,
    content_type: 'blog',
    word_count: 2500,
    tone: 'professional',
    include_title: true,
    include_meta: true,
  }, opts);

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`AI generation failed: ${res.status} — ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  const data = res.body || {};
  const wrapped = data.content || data.result || data;
  const md = wrapped.content_markdown || wrapped.content || wrapped.body || wrapped.markdown || '';
  if (!md || md.length < 500) {
    throw new Error(`AI generation returned empty/short content (${md.length} chars). Response keys: ${Object.keys(data).join(', ')}`);
  }
  assertNoReplacementChars('content_markdown', md);
  assertNoReplacementChars('title', wrapped.title || '');
  assertNoReplacementChars('meta_description', wrapped.meta_description || '');
  const cleanMd = scrubCliches(md);

  return {
    title: wrapped.title || topic.topic,
    slug: wrapped.slug || slugifyAscii(topic.keyword),
    meta_description: scrubCliches(wrapped.meta_description || wrapped.metaDescription || ''),
    excerpt: scrubCliches(wrapped.excerpt || ''),
    keywords: wrapped.keywords || topic.keyword,
    content_markdown: cleanMd,
  };
}

// ─── Slug + markdown helpers ───────────────────────────────────────────

function slugifyAscii(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `blog-${Date.now()}`;
}

function markdownToHtml(md) {
  let html = String(md);
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^(?:- (.+)(?:\n|$))+/gm, (block) => {
    const items = block.trim().split(/\n/).map((l) => l.replace(/^- /, '').trim());
    return '<ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
  });
  html = html
    .split(/\n{2,}/)
    .map((para) => {
      const t = para.trim();
      if (!t) return '';
      if (/^<(h[1-6]|ul|ol|p|blockquote|pre|table)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, ' ')}</p>`;
    })
    .filter(Boolean)
    .join('\n\n');
  return html;
}

function markdownToPlainText(md) {
  return String(md)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Orchestration ─────────────────────────────────────────────────────

/**
 * Full pipeline: generate → quality-gate → publish → record state.
 *
 * @param {object} topic  — a queue entry ({ topic, keyword, language, min_words, suggested_internal_links, ... })
 * @param {object} opts
 * @param {string} opts.baseURL       — e.g. "https://www.prooftamil.com"
 * @param {string} opts.adminToken    — JWT access_token for admin session
 * @param {'published'|'draft'} [opts.status='published']  — publish status
 * @param {boolean} [opts.skipQualityGate=false]  — bypass the SEO gate (admins use for one-off overrides)
 * @param {boolean} [opts.dryRun=false]           — generate but do not publish
 * @returns {Promise<{ok, status, title, slug, draft_id, view_url, review_url, quality, error}>}
 */
async function generateAndPublish(topic, opts) {
  if (!topic) throw new Error('topic is required');
  if (!opts?.baseURL) throw new Error('opts.baseURL is required');

  const status = opts.status === 'draft' ? 'draft' : 'published';
  const skipQualityGate = !!opts.skipQualityGate;
  const dryRun = !!opts.dryRun;

  // 1. Generate
  const generated = await generateContent(topic, opts);

  // 2. Quality gate
  const gate = runQualityGate({
    title: generated.title,
    keyword: topic.keyword,
    metaDescription: generated.meta_description,
    contentMarkdown: generated.content_markdown,
    suggestedInternalLinks: topic.suggested_internal_links || [],
    minWords: topic.min_words || 1500,
  });

  if (!gate.passed && !skipQualityGate) {
    return {
      ok: false,
      error: `Quality gate failed: ${gate.failures.join('; ')}`,
      quality: gate,
      title: generated.title,
      slug: generated.slug,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      status: 'dry_run',
      title: generated.title,
      slug: generated.slug,
      quality: gate,
    };
  }

  // 3. Publish
  const contentHtml = markdownToHtml(generated.content_markdown);
  const contentText = markdownToPlainText(generated.content_markdown);

  const publishRes = await httpRequest('POST', '/api/blog/publish', {
    title: generated.title,
    slug: generated.slug,
    language: topic.language,
    status,
    meta_description: generated.meta_description,
    keywords: generated.keywords,
    excerpt: generated.excerpt,
    content_html: contentHtml,
    content_text: contentText,
  }, opts);

  if (publishRes.status < 200 || publishRes.status >= 300) {
    return {
      ok: false,
      error: `Publish failed (HTTP ${publishRes.status}): ${JSON.stringify(publishRes.body).slice(0, 300)}`,
      quality: gate,
      title: generated.title,
      slug: generated.slug,
    };
  }

  const draftId = publishRes.body?.post?.id || publishRes.body?.id || null;
  const viewUrl = `${opts.baseURL}/blog/${generated.slug}`;
  const reviewUrl = `${opts.baseURL}/my-blogs`;

  // 4. Record state so /admin/blog-generator marks the topic as generated
  //    and future runs skip it. Non-fatal on failure — publish already
  //    succeeded, worst case is a duplicate-slug error next time.
  try {
    appendStateEntry({
      topic: topic.topic,
      slug: generated.slug,
      draft_id: draftId,
      generated_at: new Date().toISOString(),
      status,
      review_url: reviewUrl,
      view_url: viewUrl,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[blog-generator] Failed to update state.json:', e.message);
  }

  return {
    ok: true,
    status,
    title: generated.title,
    slug: generated.slug,
    draft_id: draftId,
    view_url: viewUrl,
    review_url: reviewUrl,
    quality: gate,
  };
}

module.exports = {
  loadQueue,
  loadState,
  appendStateEntry,
  generateContent,
  generateAndPublish,
  runQualityGate,
  markdownToHtml,
  markdownToPlainText,
  slugifyAscii,
  scrubCliches,
};
