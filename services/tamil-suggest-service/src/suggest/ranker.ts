import { CorpusItem, Suggestion } from "./types.js";

export type RankInputs = {
  phoneticScore: number; // 0..1
  freq: number; // raw frequency
  bigramBoost?: number; // raw bigram freq
};

/**
 * Deterministic ranker.
 * Returns a score in a convenient 0..100-ish range for UI readability.
 */
export function scoreCandidate(x: RankInputs): number {
  const phon = clamp01(x.phoneticScore);
  const f = Math.max(0, x.freq || 0);
  const b = Math.max(0, x.bigramBoost || 0);

  // log-scaled freq contributions
  const freqScore = Math.log1p(f);
  const bigramScore = b > 0 ? Math.log1p(b) : 0;

  // weights (tune later)
  const score = 60 * phon + 25 * freqScore + 15 * bigramScore;
  return Math.round(score * 100) / 100;
}

export function toSuggestion(item: CorpusItem, score: number, meta?: Record<string, unknown>): Suggestion {
  return { text: item.text, score, meta };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}


