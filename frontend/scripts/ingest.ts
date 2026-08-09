/**
 * RAG ingestion for the ProofTamil chatbot.
 *
 *   npm run ingest              # incremental — only re-embeds changed pages
 *   npm run ingest -- --force   # re-embed everything (after a model change)
 *   npm run ingest -- --dry-run # fetch + chunk + report, no writes, no Gemini
 *   npm run ingest -- --url=https://www.prooftamil.com/pricing
 *   npm run ingest -- --limit=5
 *
 * Re-runnable by design: pages are keyed by URL and skipped when their content
 * hash is unchanged, so a nightly cron costs almost nothing.
 *
 * Runs under `node --conditions=react-server` (see package.json) so that the
 * `server-only` guards in gemini.ts / vectorStore.ts resolve to their no-op
 * build instead of throwing outside a React Server context.
 */

import { config as loadEnv } from 'dotenv';
import * as cheerio from 'cheerio';

// @ts-expect-error — plain .mjs helper, also imported by next.config.mjs.
import { loadRootEnv } from '../load-root-env.mjs';

// frontend/.env.local first so it wins over .env, matching Next's precedence…
loadEnv({ path: '.env.local', override: false, quiet: true });
loadEnv({ path: '.env', override: false, quiet: true });
// …then fall back to the repo-root files, which already hold
// GOOGLE_GENAI_API_KEY, SUPABASE_URL and the SendGrid key.
loadRootEnv();

import {
  CHUNK_MIN_CHARS,
  CHUNK_OVERLAP_RATIO,
  CHUNK_TARGET_TOKENS,
  EMBEDDING_MODEL_ID,
  SITEMAP_URL,
} from '../lib/chatbot/config';
import { closePool } from '../lib/chatbot/db';
import { chunkText, extractContent } from '../lib/chatbot/extract';
import { embedBatch } from '../lib/chatbot/gemini';
import { pruneDocuments, upsertDocumentWithChunks } from '../lib/chatbot/vectorStore';

/* -------------------------------------------------------------------- args */

interface Args {
  force: boolean;
  dryRun: boolean;
  url: string | null;
  limit: number | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;

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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
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

function requireEnv(dryRun: boolean): void {
  if (dryRun) return;

  const hasDsn = process.env.CHATBOT_DATABASE_URL || process.env.DATABASE_URL;
  const missing = [
    process.env.GOOGLE_GENAI_API_KEY ? null : 'GOOGLE_GENAI_API_KEY',
    hasDsn ? null : 'CHATBOT_DATABASE_URL',
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(`\nMissing required env vars: ${missing.join(', ')}`);
    console.error(
      'Both are normally inherited from the repo-root .env. Set\n' +
        'CHATBOT_DATABASE_URL in frontend/.env.local to point the chatbot at a\n' +
        'specific database — the repo has more than one DATABASE_URL.\n',
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  requireEnv(args.dryRun);

  console.log(`\nProofTamil RAG ingestion`);
  console.log(`  embedding model : ${EMBEDDING_MODEL_ID}`);
  console.log(
    `  chunk target    : ${CHUNK_TARGET_TOKENS} tokens / ${CHUNK_OVERLAP_RATIO * 100}% overlap`,
  );
  if (args.dryRun) console.log(`  MODE            : dry run (no writes, no embeddings)`);
  if (args.force) console.log(`  MODE            : force (re-embedding everything)`);

  let urls: string[];
  if (args.url) {
    urls = [args.url];
  } else {
    console.log(`\nFetching sitemap: ${SITEMAP_URL}`);
    urls = await fetchSitemapUrls(SITEMAP_URL);
    console.log(`  found ${urls.length} URLs`);
  }

  if (args.limit) urls = urls.slice(0, args.limit);

  const stats = { inserted: 0, updated: 0, skipped: 0, failed: 0, chunks: 0 };
  const seen: string[] = [];

  for (const [index, url] of urls.entries()) {
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
        console.log(
          `${position} ${url} — ${chunks.length} chunks, ${content.length} chars — "${title}"`,
        );
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
        `${position} ${url} — ${result.status}${
          result.status === 'skipped' ? ' (unchanged)' : ` (${result.chunkCount} chunks)`
        }`,
      );
    } catch (error) {
      stats.failed++;
      console.error(`${position} ${url} — FAILED: ${(error as Error).message}`);
    }
  }

  // Only prune on a complete, clean run. A --url or --limit run has not seen the
  // whole corpus, and pruning against a partial list would delete the rest;
  // a run with failures has an incomplete `seen` list for the same reason.
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
    console.error(`\nIngestion failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  // Without this the pg pool keeps the event loop alive and the script hangs
  // after printing its summary.
  .finally(() => closePool());
