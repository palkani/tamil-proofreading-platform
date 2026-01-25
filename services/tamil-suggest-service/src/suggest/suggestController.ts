import type { FastifyInstance } from "fastify";
import { normalizeRoman } from "./normalizer.js";
import { expandPhonetic } from "./phoneticEngine.js";
import { PrefixIndex } from "./prefixSearch.js";
import { scoreCandidate, toSuggestion } from "./ranker.js";
import { BigramRow, CorpusItem, Suggestion } from "./types.js";
import { getBigramBoost, getPhraseBonus } from "./contextBoost.js";

export type SuggestEngine = {
  index: PrefixIndex;
  bigramMap: Map<string, Map<string, number>>; // prev -> next -> freq
  acceptanceMap?: Map<string, Map<string, number>>; // input -> selected -> count
  ready: boolean;
  source: string;
};

export function registerSuggestRoutes(app: FastifyInstance, engine: SuggestEngine) {
  app.get("/api/suggest", async (req, reply) => {
    const t0 = performance.now();
    const qRaw = String((req.query as any)?.q ?? "");
    const prev = String((req.query as any)?.prev ?? "");
    const limit = clampInt((req.query as any)?.limit, 5, 1, 10); // default 5, max 10

    const q = normalizeRoman(qRaw);
    if (!q) {
      return reply.status(200).send({ 
        suggestions: [], 
        meta: { 
          q: qRaw, 
          limit, 
          took_ms: 0, 
          source: engine.source,
          usedLLM: false
        } 
      });
    }

    // Phonetic expansion with beam search
    const phonetics = expandPhonetic(q, { maxCandidates: 20, beamWidth: 24 });

    // Prefix lookup and aggregate candidates
    const pool: Array<{ item: CorpusItem; phoneticScore: number }> = [];
    const seen = new Set<string>();

    // Early cap per phonetic branch keeps latency stable
    const perBranchCap = 50;
    for (const p of phonetics) {
      const items = engine.index.lookupPrefix(p.tamilPrefix, perBranchCap);
      for (const it of items) {
        const k = it.text;
        if (seen.has(k)) continue;
        seen.add(k);
        pool.push({ item: it, phoneticScore: p.phoneticScore });
        if (pool.length >= 400) break;
      }
      if (pool.length >= 400) break;
    }

    // Enhanced ranking with 5-factor scoring
    const ranked: Suggestion[] = pool
      .map(({ item, phoneticScore }) => {
        // Calculate all scoring factors
        const bigramBoost = prev ? getBigramBoost(item.text, prev, engine.bigramMap) : 0;
        const phraseBonus = getPhraseBonus(item.text, item.kind);
        const acceptanceBonus = 0; // TODO: Load from acceptanceMap if available
        
        // Apply production ranking formula
        const score = scoreCandidate({ 
          phoneticScore, 
          freq: item.frequency, 
          bigramBoost,
          phraseBonus,
          acceptanceBonus
        });
        
        return toSuggestion(item, score, { 
          kind: item.kind,
          bigramBoost,
          phraseBonus,
          acceptanceBonus
        });
      })
      .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, "ta"));

    // Fallback: if corpus empty, return phonetic prefixes (diagnostic mode)
    const out =
      ranked.slice(0, limit).length > 0
        ? ranked.slice(0, limit)
        : phonetics.slice(0, limit).map((p, idx) => ({ 
            text: p.tamilPrefix, 
            score: Math.round((p.phoneticScore * 100 - idx) * 100) / 100 
          }));

    const took = performance.now() - t0;
    return reply.status(200).send({
      suggestions: out,
      meta: {
        q,
        q_raw: qRaw,
        prev: prev || undefined,
        limit,
        branches: phonetics.length,
        candidates: pool.length,
        source: engine.source,
        took_ms: Math.round(took * 100) / 100,
        usedLLM: false // LLM disabled by default
      },
    });
  });
}

export function buildIndex(items: CorpusItem[]): PrefixIndex {
  const idx = new PrefixIndex({ maxTopPerNode: 80 });
  for (const it of items) idx.insert(it);
  return idx;
}

export function buildBigramMap(rows: BigramRow[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let inner = m.get(r.word);
    if (!inner) {
      inner = new Map();
      m.set(r.word, inner);
    }
    const prev = inner.get(r.next_word) || 0;
    if (r.frequency > prev) inner.set(r.next_word, r.frequency);
  }
  return m;
}

function clampInt(v: any, dflt: number, min: number, max: number): number {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}


