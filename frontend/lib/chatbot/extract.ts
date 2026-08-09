/**
 * HTML extraction and chunking for RAG ingestion.
 *
 * Pure functions, no side effects and no secrets — kept separate from
 * scripts/ingest.ts so they can be imported and tested without triggering a
 * full ingestion run.
 *
 * NOTE: this module pulls in `cheerio`, which is a devDependency. It is
 * imported only by the ingest script, never by the Next.js app, so it must stay
 * out of anything under app/ or components/.
 */

import * as cheerio from 'cheerio';

import { CHUNK_MIN_CHARS, CHUNK_OVERLAP_RATIO, CHUNK_TARGET_TOKENS } from './config';

export interface Extracted {
  title: string;
  content: string;
}

/* --------------------------------------------------------------- extraction */

export function extractContent(html: string, url: string): Extracted {
  const $ = cheerio.load(html);

  // Chrome, nav and boilerplate carry no answers but do carry the same words as
  // every other page, which is exactly what poisons a small corpus.
  $(
    'script, style, noscript, svg, iframe, form, nav, header, footer, aside, ' +
      '[role="navigation"], [role="banner"], [role="contentinfo"], .nav, .navbar, ' +
      '.header, .footer, .sidebar, .cookie, .breadcrumb',
  ).remove();

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    url;

  const root = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body');

  const blocks = collectBlocks($, root);

  const body =
    blocks.length > 0
      ? dedupeConsecutive(blocks).join('\n\n')
      : root.text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // The meta description is often the crispest statement of what a page offers,
  // and sometimes the only place the value proposition is spelled out.
  const description = $('meta[name="description"]').attr('content')?.trim();

  return {
    title,
    content: [description, body].filter(Boolean).join('\n\n'),
  };
}

/**
 * Tags that establish their own block. Anything else (span, strong, a, em…) is
 * inline and belongs to its parent's text run.
 */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hgroup', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

function tagOf(node: unknown): string {
  return (node as { tagName?: string }).tagName?.toLowerCase() ?? '';
}

/**
 * Emit one text block per *leaf* container — an element with no block-level
 * element children.
 *
 * A fixed selector list (p, li, h1…) misses text that sits in bare spans inside
 * layout divs, which is precisely how pricing cards are built: the headline
 * `$12.00` on ProofTamil's pricing page lives in a `<span>` inside a `<div>` and
 * was silently dropped. Emitting leaves instead catches those, and keeps a
 * price and its `/mo` unit together in one block rather than splitting them.
 */
function collectBlocks<T>($: cheerio.CheerioAPI, root: cheerio.Cheerio<T>): string[] {
  const blocks: string[] = [];

  function visit(node: unknown): void {
    const $node = $(node as never);
    const blockChildren = $node.children().filter((_, child) => BLOCK_TAGS.has(tagOf(child)));

    if (blockChildren.length === 0) {
      const text = $node.text().replace(/\s+/g, ' ').trim();
      if (text) {
        // Prefix headings so a chunk starting mid-page still carries its topic.
        blocks.push(/^h[1-6]$/.test(tagOf(node)) ? `## ${text}` : text);
      }
      return;
    }

    // Text sitting directly on a container, alongside block children, would be
    // lost by recursing straight past it.
    const ownText = $node
      .contents()
      .filter((_, child) => (child as { type?: string }).type === 'text')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (ownText) blocks.push(ownText);

    blockChildren.each((_, child) => visit(child));
  }

  root.each((_, node) => visit(node));
  return blocks;
}

/** Repeated nav-ish lines sometimes survive removal; collapse the obvious ones. */
function dedupeConsecutive(blocks: string[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (out[out.length - 1] !== block) out.push(block);
  }
  return out;
}

/* ----------------------------------------------------------------- chunking */

/**
 * Approximate token count.
 *
 * Gemini tokenises Tamil far more densely than English — a Tamil character
 * averages roughly 0.5 tokens against roughly 0.25 for Latin. Using a single
 * chars/4 ratio for both would make Tamil chunks about double their intended
 * size and silently blow the context budget, so the scripts are counted apart.
 */
export function estimateTokens(text: string): number {
  const tamilChars = (text.match(/[஀-௿]/g) ?? []).length;
  const otherChars = text.length - tamilChars;
  return Math.ceil(tamilChars / 2 + otherChars / 4);
}

function splitOversizedBlock(block: string, targetTokens: number): string[] {
  // Tamil uses the same full stop as English, so one splitter serves both. The
  // danda (।) is included for the occasional transliterated quotation.
  const sentences = block.match(/[^.!?।\n]+[.!?।]*\s*/g) ?? [block];
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && estimateTokens(current + sentence) > targetTokens) {
      parts.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());

  return parts;
}

export function chunkText(content: string, targetTokens = CHUNK_TARGET_TOKENS): string[] {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) =>
      estimateTokens(block) > targetTokens ? splitOversizedBlock(block, targetTokens) : [block],
    );

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const block of blocks) {
    const blockTokens = estimateTokens(block);

    if (currentTokens > 0 && currentTokens + blockTokens > targetTokens) {
      chunks.push(current.join('\n\n'));

      // Carry the tail across the boundary so a fact split between two chunks is
      // still retrievable from at least one of them.
      const overlapBudget = targetTokens * CHUNK_OVERLAP_RATIO;
      const carried: string[] = [];
      let carriedTokens = 0;

      for (let i = current.length - 1; i >= 0; i--) {
        const tokens = estimateTokens(current[i]);
        if (carriedTokens + tokens > overlapBudget) break;
        carried.unshift(current[i]);
        carriedTokens += tokens;
      }

      current = carried;
      currentTokens = carriedTokens;
    }

    current.push(block);
    currentTokens += blockTokens;
  }

  if (current.length > 0) chunks.push(current.join('\n\n'));

  // A trailing scrap shorter than this carries no retrievable meaning and only
  // adds noise to the top-K.
  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length >= CHUNK_MIN_CHARS);
}
