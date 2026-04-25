// File-based blog loader for SEO-seed posts.
// Reads markdown files from express-frontend/data/blog/*.md, parses YAML frontmatter,
// renders markdown body to HTML via `marked`, and exposes the same shape as
// backend-DB blog posts so views can render them interchangeably.
//
// Posts are loaded once at module init (serverless cold-start) and cached.

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const BLOG_DIR = path.join(__dirname, '..', 'data', 'blog');

// Minimal YAML frontmatter parser for the limited shape we use.
// Supports: scalar strings (quoted/unquoted), numbers, booleans, null. No arrays/maps.
function parseFrontmatter(raw) {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/m.exec(raw);
  if (!m) return { data: {}, body: raw };
  const block = m[1];
  const body = m[2];
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (val === 'null' || val === '') val = null;
    else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
    data[key] = val;
  }
  return { data, body };
}

marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });

function loadPosts() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
      const { data, body } = parseFrontmatter(raw);
      if (!data.slug || !data.title) continue;
      const html = marked.parse(body);
      const text = body.replace(/[#*`>_\-]+/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      const publishedAt = data.date ? new Date(`${data.date}T00:00:00Z`).toISOString() : new Date().toISOString();
      posts.push({
        slug: String(data.slug),
        title: String(data.title),
        excerpt: data.excerpt ? String(data.excerpt) : '',
        meta_description: data.meta_description ? String(data.meta_description) : '',
        keywords: data.keywords ? String(data.keywords) : '',
        language: data.language ? String(data.language) : 'tamil',
        content_html: html,
        content_text: text,
        published_at: publishedAt,
        created_at: publishedAt,
        updated_at: publishedAt,
        _source: 'file',
      });
    } catch (e) {
      console.error(`[fileBlog] Failed to load ${file}:`, e.message);
    }
  }
  posts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return posts;
}

let _cache = null;
function getAllPosts() {
  if (_cache === null) _cache = loadPosts();
  return _cache;
}
function getPostBySlug(slug) {
  return getAllPosts().find((p) => p.slug === slug) || null;
}

module.exports = { getAllPosts, getPostBySlug };
