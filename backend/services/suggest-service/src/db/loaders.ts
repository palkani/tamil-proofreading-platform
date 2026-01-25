import fs from "node:fs";
import path from "node:path";
import type { PgClient } from "./pg.js";
import { BigramRow, CorpusItem } from "../suggest/types.js";

export type LoadedCorpus = {
  words: CorpusItem[];
  phrases: CorpusItem[];
  bigrams: BigramRow[];
  source: string;
};

const DEFAULT_TOP_K = 50_000;

export async function loadCorpus(opts: { pg: PgClient | null }): Promise<LoadedCorpus> {
  const topK = clampInt(process.env.SUGGEST_TOP_K, DEFAULT_TOP_K, 1_000, 500_000);

  if (opts.pg) {
    const words = await loadWordsFromPg(opts.pg, topK);
    const phrases = await loadPhrasesFromPg(opts.pg, topK);
    const bigrams = await loadBigramsFromPg(opts.pg, Math.min(topK, 200_000));
    return { words, phrases, bigrams, source: "postgres" };
  }

  const dataDir = process.env.DATA_DIR;
  if (dataDir) {
    const words = loadTsv2(path.join(dataDir, "seed_words.tsv"), "word");
    const phrases = loadTsv2(path.join(dataDir, "seed_phrases.tsv"), "phrase");
    const bigrams = loadTsv3(path.join(dataDir, "seed_bigrams.tsv"));
    return { words, phrases, bigrams, source: `tsv:${dataDir}` };
  }

  // Empty corpus (service still runs, but returns phonetic candidates only)
  return { words: [], phrases: [], bigrams: [], source: "empty" };
}

async function loadWordsFromPg(pg: PgClient, topK: number): Promise<CorpusItem[]> {
  const q = `
    -- Existing backend schema stores Tamil tokens in tamil_words.tamil_text
    SELECT tamil_text AS text, frequency
    FROM tamil_words
    ORDER BY frequency DESC
    LIMIT $1
  `;
  const res = await pg.query(q, [topK]);
  return res.rows.map((r) => ({ text: String(r.text), frequency: Number(r.frequency || 0), kind: "word" as const }));
}

async function loadPhrasesFromPg(pg: PgClient, topK: number): Promise<CorpusItem[]> {
  const q = `
    SELECT phrase AS text, frequency
    FROM tamil_phrases
    ORDER BY frequency DESC
    LIMIT $1
  `;
  const res = await pg.query(q, [topK]);
  return res.rows.map((r) => ({ text: String(r.text), frequency: Number(r.frequency || 0), kind: "phrase" as const }));
}

async function loadBigramsFromPg(pg: PgClient, topK: number): Promise<BigramRow[]> {
  const q = `
    SELECT word, next_word, frequency
    FROM tamil_bigrams
    ORDER BY frequency DESC
    LIMIT $1
  `;
  const res = await pg.query(q, [topK]);
  return res.rows.map((r) => ({
    word: String(r.word),
    next_word: String(r.next_word),
    frequency: Number(r.frequency || 0),
  }));
}

function loadTsv2(file: string, kind: "word" | "phrase"): CorpusItem[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
  const out: CorpusItem[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [text, freq] = line.split("\t");
    if (!text) continue;
    out.push({ text: text.trim(), frequency: Number(freq || 0), kind });
  }
  out.sort((a, b) => b.frequency - a.frequency);
  return out;
}

function loadTsv3(file: string): BigramRow[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
  const out: BigramRow[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [word, next_word, freq] = line.split("\t");
    if (!word || !next_word) continue;
    out.push({ word: word.trim(), next_word: next_word.trim(), frequency: Number(freq || 0) });
  }
  out.sort((a, b) => b.frequency - a.frequency);
  return out;
}

function clampInt(v: string | undefined, dflt: number, min: number, max: number): number {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}


