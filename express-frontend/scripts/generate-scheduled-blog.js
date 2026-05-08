#!/usr/bin/env node
/**
 * Scheduled blog generator — picks the next topic from data/blog-queue.yaml,
 * calls the AI Content Writer, runs an SEO quality gate, and posts the result
 * as a draft via /api/blog/publish.
 *
 * Usage:
 *   ADMIN_TOKEN=<jwt> node scripts/generate-scheduled-blog.js [--dry-run]
 *
 * Environment:
 *   ADMIN_TOKEN  — JWT access token cookie value (required unless --dry-run)
 *   BASE_URL     — frontend URL (default: https://www.prooftamil.com)
 *
 * Flags:
 *   --dry-run        Generate + validate, but do NOT post the draft
 *   --topic-index N  Skip queue selection, use the Nth topic (0-indexed) — for testing
 *
 * Exit codes:
 *   0 — success (draft posted, or dry-run completed cleanly)
 *   1 — quality gate failed after retries
 *   2 — no queued topics left
 *   3 — config / IO error
 *   4 — AI generation error
 *   5 — publish error
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { runQualityGate } = require('./lib/seo-quality-gate');

const BASE_URL = process.env.BASE_URL || 'https://www.prooftamil.com';
const TOKEN = process.env.ADMIN_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCED_INDEX = (() => {
  const i = process.argv.indexOf('--topic-index');
  if (i === -1) return null;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
})();

const QUEUE_PATH = path.join(__dirname, '..', '..', 'data', 'blog-queue.yaml');
const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'blog-queue-state.json');

// ── Minimal YAML parser ────────────────────────────────────────────────
// Supports the subset our queue uses: top-level lists of objects whose
// values are scalar strings/numbers/booleans or string arrays. Indentation-
// aware so nested list bullets (suggested_internal_links) aren't mistaken
// for new top-level items. Preserves comments by not rewriting the file
// (generated state lives in a separate JSON).
function parseQueueYaml(raw) {
  const lines = raw.split(/\r?\n/);
  const queue = [];
  let current = null;
  let itemIndent = -1; // indent of the active "- " bullet for a queue item
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

    // New top-level queue item: "- " at the queue's item indent (or first time).
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

    // Nested list bullet (e.g., under suggested_internal_links) — deeper indent.
    if (dashMatch && indent > itemIndent) {
      current._currentList = current._currentList || [];
      current._currentList.push(parseScalar(dashMatch[2].trim()));
      continue;
    }

    // key: value within the current item (deeper indent than item, but not a bullet).
    const kvMatch = line.match(/^ +([a-z_]+):\s*(.*)$/i);
    if (kvMatch) {
      // Closing the previous list — attach _currentList to its named key.
      if (current._currentList && current._pendingListKey) {
        current[current._pendingListKey] = current._currentList;
        delete current._currentList;
        delete current._pendingListKey;
      }
      const key = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        // Start of a nested list (next lines will be "  - foo")
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
  // Clean leftover scratch fields from any item that had a pending list at end.
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

// ── State (JSON; tracks which topics have been generated) ─────────────
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

// ── HTTP helpers ───────────────────────────────────────────────────────
function httpRequest(method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const data = body == null ? null : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (data != null) headers['Content-Length'] = Buffer.byteLength(data);
    if (TOKEN) headers.Cookie = `access_token=${TOKEN}`;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (data != null) req.write(data);
    req.end();
  });
}

// ── AI generation ──────────────────────────────────────────────────────
function buildPrompt(topic) {
  const langName = topic.language === 'tamil' ? 'Tamil' : 'English';
  const linksList = (topic.suggested_internal_links || [])
    .map((s) => `https://www.prooftamil.com/blog/${s}`)
    .join('\n  - ');
  // The wrapping content-writer service injects "content should use paragraphs
  // separated by blank lines" — which would skip headings. We override that
  // explicitly: the body MUST be markdown with H2/H3 headings, because our
  // SEO quality gate checks for them.
  return [
    `Write a high-quality blog post for ProofTamil (https://www.prooftamil.com), an AI-powered Tamil writing platform.`,
    ``,
    `TOPIC: ${topic.topic}`,
    `PRIMARY KEYWORD: ${topic.keyword}`,
    `LANGUAGE: ${langName}`,
    ``,
    `THE BODY ("content" FIELD) MUST BE MARKDOWN, NOT PLAIN PARAGRAPHS:`,
    `- The primary keyword "${topic.keyword}" must appear in the title, the opening paragraph, and at least 2 H2 headings.`,
    `- Use at least 5 H2 (## Heading) headings AND at least 2 H3 (### Subheading) subheadings.`,
    `- Open with a 3-4 sentence TL;DR/summary paragraph.`,
    `- End with a "## Conclusion" section that includes a markdown link to https://www.prooftamil.com/`,
    `- Reference real, verifiable facts. Do not invent statistics or quotes.`,
    `- Avoid filler phrases ("In today's world...", "It is no secret that...", "delve into", "unlock the potential", "game-changer", "in this comprehensive guide").`,
    `- Embed at least 2 of these internal links naturally in body text using markdown link syntax [text](url):`,
    `  - ${linksList}`,
    `- Add 1-2 outbound links to authoritative sources (Wikipedia, university sites, .gov/.edu) where they support a claim.`,
    `- No emojis. Use bullet lists only where they genuinely help scanning.`,
    ``,
    `Override any wrapper instruction about "plain paragraphs" — markdown headings are MANDATORY.`,
    `The "meta_description" field MUST be 140-160 characters and include the primary keyword.`,
  ].join('\n');
}

async function generateContent(topic) {
  // Use the existing AI Content Writer endpoint. Wraps the configured
  // Gemini key on the backend, so the script doesn't need API keys directly.
  // Mount path is /api (not /api/v1) — apiRouter is mounted at /api in create-app.js.
  // The service expects snake_case params (camelCase is silently ignored, which
  // is why the first dry-run defaulted to word_count=500 and include_meta=false).
  const res = await httpRequest('POST', '/api/ai-content-writer/generate-content', {
    prompt: buildPrompt(topic),
    language: topic.language,
    content_type: 'blog',
    word_count: 2500, // service caps at 3000; ask for 2500 so the 1500 floor is comfortable
    tone: 'professional',
    include_title: true,
    include_meta: true,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`AI generation failed: ${res.status} — ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  // Service returns { success, content: {title, meta_description, keywords, content}, metadata }.
  const data = res.body || {};
  const wrapped = data.content || data.result || data;
  const md = wrapped.content_markdown || wrapped.content || wrapped.body || wrapped.markdown || '';
  if (!md || md.length < 500) {
    throw new Error(`AI generation returned empty/short content (${md.length} chars). Response keys: ${Object.keys(data).join(', ')}`);
  }
  return {
    title: wrapped.title || topic.topic,
    slug: wrapped.slug || slugifyAscii(topic.keyword),
    meta_description: wrapped.meta_description || wrapped.metaDescription || '',
    excerpt: wrapped.excerpt || '',
    keywords: wrapped.keywords || topic.keyword,
    content_markdown: md,
  };
}

function slugifyAscii(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\x00-\x7F]/g, '') // drop non-ASCII (Tamil, etc.)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `blog-${Date.now()}`;
}

// Markdown → very simple HTML conversion. Preserves headings, paragraphs,
// links, bullet lists. Good enough for draft preview; admin can polish.
function markdownToHtml(md) {
  let html = String(md);
  // Headings
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Bullet lists (very basic)
  html = html.replace(/^(?:- (.+)(?:\n|$))+/gm, (block) => {
    const items = block.trim().split(/\n/).map((l) => l.replace(/^- /, '').trim());
    return '<ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
  });
  // Paragraphs (any line that isn't already a block element)
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

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.error(`❌ Queue file not found: ${QUEUE_PATH}`);
    process.exit(3);
  }
  const queue = parseQueueYaml(fs.readFileSync(QUEUE_PATH, 'utf8'));
  if (!queue.length) {
    console.error('❌ Queue is empty — nothing to generate.');
    process.exit(2);
  }

  const state = loadState();
  const generatedTopics = new Set((state.generated || []).map((g) => g.topic));

  let topic;
  if (FORCED_INDEX != null) {
    topic = queue[FORCED_INDEX];
    if (!topic) {
      console.error(`❌ --topic-index ${FORCED_INDEX} out of range (queue has ${queue.length} topics)`);
      process.exit(3);
    }
  } else {
    topic = queue.find((t) => t.status === 'queued' && !generatedTopics.has(t.topic));
  }

  if (!topic) {
    console.log('✅ No queued topics remaining. Add new ones to data/blog-queue.yaml.');
    process.exit(2);
  }

  console.log(`📝 Topic: ${topic.topic}`);
  console.log(`🔑 Keyword: ${topic.keyword}`);
  console.log(`🌐 Language: ${topic.language}`);
  console.log(`📏 Min words: ${topic.min_words || 1500}`);
  console.log('');

  if (!TOKEN && !DRY_RUN) {
    console.error('❌ ADMIN_TOKEN env var is required (unless --dry-run).');
    process.exit(3);
  }

  console.log('🤖 Calling AI Content Writer...');
  let generated;
  try {
    generated = await generateContent(topic);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(4);
  }
  console.log(`✅ Generated ${generated.content_markdown.length} chars of markdown`);
  console.log('');

  console.log('🛡️  Running SEO quality gate...');
  const gateResult = runQualityGate({
    title: generated.title,
    keyword: topic.keyword,
    metaDescription: generated.meta_description,
    contentMarkdown: generated.content_markdown,
    suggestedInternalLinks: topic.suggested_internal_links || [],
    minWords: topic.min_words || 1500,
  });
  console.log(gateResult.report);

  if (!gateResult.passed) {
    console.error(`❌ Quality gate failed (${gateResult.failures.length} issue(s)). Refine the prompt or topic.`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('');
    console.log('✅ Dry run complete — would have posted as draft. Run without --dry-run to publish.');
    process.exit(0);
  }

  console.log('');
  console.log('📤 Posting as draft to /api/blog/publish...');
  const contentHtml = markdownToHtml(generated.content_markdown);
  const contentText = markdownToPlainText(generated.content_markdown);

  const publishRes = await httpRequest('POST', '/api/blog/publish', {
    title: generated.title,
    slug: generated.slug,
    language: topic.language,
    status: 'draft', // CRITICAL: never publish directly — human must approve
    meta_description: generated.meta_description,
    keywords: generated.keywords,
    excerpt: generated.excerpt,
    content_html: contentHtml,
    content_text: contentText,
  });

  if (publishRes.status < 200 || publishRes.status >= 300) {
    console.error(`❌ Publish failed: ${publishRes.status}`);
    console.error(JSON.stringify(publishRes.body, null, 2).slice(0, 500));
    process.exit(5);
  }

  const draftId = publishRes.body?.post?.id || publishRes.body?.id || 'unknown';
  const reviewUrl = `${BASE_URL}/my-blogs`;

  appendStateEntry({
    topic: topic.topic,
    slug: generated.slug,
    draft_id: draftId,
    generated_at: new Date().toISOString(),
    review_url: reviewUrl,
  });

  console.log('');
  console.log('✅ Draft created.');
  console.log(`   Draft ID: ${draftId}`);
  console.log(`   Review:   ${reviewUrl}`);
  console.log('   Status:   draft (will NOT auto-publish — open the admin UI to review and publish)');
}

main().catch((e) => {
  console.error('❌ Unhandled error:', e.message || e);
  process.exit(3);
});
