#!/usr/bin/env node
/**
 * RAG ingestion for the ProofTamil chatbot.
 *
 *   npm run ingest:chatbot                # incremental — only changed pages
 *   npm run ingest:chatbot -- --force     # re-embed everything
 *   npm run ingest:chatbot -- --dry-run   # fetch + chunk only, no Gemini/DB
 *   npm run ingest:chatbot -- --url=https://www.prooftamil.com/pricing
 *   npm run ingest:chatbot -- --limit=5
 *
 * Re-runnable by design: pages are keyed by URL and skipped when their content
 * hash is unchanged, so a nightly cron costs almost nothing.
 */

const path = require('path');
const fs = require('fs');

const dotenv = require('dotenv');
const cheerio = require('cheerio');

// express-frontend/.env first, then the repo root — so the Gemini keys and
// DATABASE_URL are inherited from the credentials the rest of the monorepo
// already uses. `override: false` means the nearer file always wins.
[
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env.local'),
  path.join(__dirname, '..', '..', '.env'),
].forEach((file) => {
  if (fs.existsSync(file)) dotenv.config({ path: file, override: false, quiet: true });
});

const {
  CHUNK_MIN_CHARS,
  CHUNK_OVERLAP_RATIO,
  CHUNK_TARGET_TOKENS,
  EMBEDDING_MODEL_ID,
  SITEMAP_URL,
} = require('../lib/chatbot/config');
const { closePool } = require('../lib/chatbot/db');
const { chunkText, extractContent } = require('../lib/chatbot/extract');
const { embedBatch } = require('../lib/chatbot/gemini');
const { pruneDocuments, upsertDocumentWithChunks } = require('../lib/chatbot/vectorStore');

/* -------------------------------------------------------------------- args */

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (name) => {
    const found = argv.find((arg) => arg.indexOf(`--${name}=`) === 0);
    return found ? found.slice(name.length + 3) : null;
  };
  const limit = get('limit');
  return {
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    url: get('url'),
    limit: limit ? Number(limit) : null,
  };
}

/* ----------------------------------------------------------------- fetching */

const USER_AGENT = 'ProofTamilBot/1.0 (+https://www.prooftamil.com; RAG ingestion)';

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchSitemapUrls(sitemapUrl) {
  const xml = await fetchText(sitemapUrl);
  const $ = cheerio.load(xml, { xmlMode: true });

  // A sitemap index points at child sitemaps rather than pages — recurse.
  const children = $('sitemapindex > sitemap > loc')
    .map((_, el) => $(el).text().trim())
    .get();

  if (children.length > 0) {
    const nested = await Promise.all(children.map((child) => fetchSitemapUrls(child)));
    return [...new Set(nested.flat())];
  }

  return [
    ...new Set(
      $('urlset > url > loc')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean),
    ),
  ];
}

/* --------------------------------------------------------------------- run */

function requireEnv(dryRun) {
  if (dryRun) return;

  const missing = [];

  // Any of the rotator's key variables will do — the chatbot uses the same
  // pool as the rest of the site (utils/gemini-key-rotator.js).
  const hasGeminiKey =
    Array.from({ length: 10 }, (_, i) => process.env[`GEMINI_API_KEY_${i + 1}`]).some(Boolean) ||
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (!hasGeminiKey) missing.push('GEMINI_API_KEY_1 (or GOOGLE_GENAI_API_KEY)');
  if (!process.env.CHATBOT_DATABASE_URL && !process.env.DATABASE_URL) {
    missing.push('CHATBOT_DATABASE_URL');
  }

  if (missing.length) {
    console.error(`\nMissing required env vars: ${missing.join(', ')}`);
    console.error(
      'Both are normally inherited from the repo-root .env. Set\n' +
        'CHATBOT_DATABASE_URL to pin the chatbot to a specific database —\n' +
        'this repo has more than one DATABASE_URL.\n',
    );
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs();
  requireEnv(args.dryRun);

  console.log('\nProofTamil RAG ingestion');
  console.log(`  embedding model : ${EMBEDDING_MODEL_ID}`);
  console.log(
    `  chunk target    : ${CHUNK_TARGET_TOKENS} tokens / ${CHUNK_OVERLAP_RATIO * 100}% overlap`,
  );
  if (args.dryRun) console.log('  MODE            : dry run (no writes, no embeddings)');
  if (args.force) console.log('  MODE            : force (re-embedding everything)');

  let urls;
  if (args.url) {
    urls = [args.url];
  } else {
    console.log(`\nFetching sitemap: ${SITEMAP_URL}`);
    urls = await fetchSitemapUrls(SITEMAP_URL);
    console.log(`  found ${urls.length} URLs`);
  }

  if (args.limit) urls = urls.slice(0, args.limit);

  const stats = { inserted: 0, updated: 0, skipped: 0, failed: 0, chunks: 0 };
  const seen = [];

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    const position = `[${index + 1}/${urls.length}]`;

    try {
      const html = await fetchText(url);
      const { title, content } = extractContent(html, url);

      if (content.length < CHUNK_MIN_CHARS) {
        console.log(`${position} ${url} — too little text (${content.length} chars), skipping`);
        stats.skipped++;
        continue;
      }

      const chunks = chunkText(content);
      seen.push(url);

      if (args.dryRun) {
        console.log(`${position} ${url} — ${chunks.length} chunks, ${content.length} chars — "${title}"`);
        stats.chunks += chunks.length;
        continue;
      }

      const result = await upsertDocumentWithChunks({
        url,
        title,
        content,
        chunks,
        force: args.force,
        embed: (texts) => embedBatch(texts, 'RETRIEVAL_DOCUMENT'),
      });

      stats[result.status]++;
      stats.chunks += result.chunkCount;
      console.log(
        `${position} ${url} — ${result.status}` +
          (result.status === 'skipped' ? ' (unchanged)' : ` (${result.chunkCount} chunks)`),
      );
    } catch (error) {
      stats.failed++;
      console.error(`${position} ${url} — FAILED: ${error.message}`);
    }
  }

  // Only prune on a complete, clean run. A --url or --limit run has not seen the
  // whole corpus, and pruning against a partial list would delete the rest; a
  // run with failures has an incomplete `seen` list for the same reason.
  if (!args.dryRun && !args.url && !args.limit && stats.failed === 0) {
    const pruned = await pruneDocuments(seen);
    if (pruned > 0) console.log(`\nPruned ${pruned} document(s) no longer in the sitemap.`);
  }

  console.log(
    `\nDone. inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} ` +
      `failed=${stats.failed} chunks=${stats.chunks}\n`,
  );

  if (stats.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`\nIngestion failed: ${error.message}\n`);
    process.exitCode = 1;
  })
  // Without this the pg pool keeps the event loop alive and the script hangs
  // after printing its summary.
  .finally(() => closePool());
