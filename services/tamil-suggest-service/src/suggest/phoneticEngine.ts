import { PhoneticCandidate } from "./types.js";

/**
 * Data-driven phonetic rules.
 * NOTE: This is a starter set. Quality comes from expanding these rules and the corpus.
 */
type Rule = {
  pat: string; // roman pattern
  outs: Array<{ ta: string; w: number }>; // output + weight
};

// Ordered longest-first matching
const RULES: Rule[] = [
  // Common digraphs
  { pat: "ng", outs: [{ ta: "ங", w: 0.9 }] },
  { pat: "zh", outs: [{ ta: "ழ", w: 1.0 }] },
  { pat: "th", outs: [{ ta: "த", w: 0.8 }, { ta: "த்", w: 0.75 }] },
  { pat: "dh", outs: [{ ta: "த", w: 0.75 }] },
  { pat: "sh", outs: [{ ta: "ஷ", w: 0.85 }, { ta: "ச", w: 0.6 }] },
  { pat: "ch", outs: [{ ta: "ச", w: 0.85 }] },

  // Vowels (independent vowels as prefixes; actual Tamil orthography needs combining signs)
  { pat: "aa", outs: [{ ta: "ஆ", w: 0.9 }] },
  { pat: "ii", outs: [{ ta: "ஈ", w: 0.85 }] },
  { pat: "uu", outs: [{ ta: "ஊ", w: 0.85 }] },
  { pat: "ee", outs: [{ ta: "ஏ", w: 0.8 }] },
  { pat: "oo", outs: [{ ta: "ஓ", w: 0.8 }] },
  { pat: "ai", outs: [{ ta: "ஐ", w: 0.8 }] },
  { pat: "au", outs: [{ ta: "ஔ", w: 0.75 }] },

  // Single vowels
  { pat: "a", outs: [{ ta: "அ", w: 0.55 }] },
  { pat: "i", outs: [{ ta: "இ", w: 0.55 }] },
  { pat: "u", outs: [{ ta: "உ", w: 0.55 }] },
  { pat: "e", outs: [{ ta: "எ", w: 0.55 }] },
  { pat: "o", outs: [{ ta: "ஒ", w: 0.55 }] },

  // Consonants (base consonants)
  { pat: "k", outs: [{ ta: "க", w: 0.7 }] },
  { pat: "g", outs: [{ ta: "க", w: 0.65 }] },
  { pat: "c", outs: [{ ta: "ச", w: 0.6 }] },
  { pat: "j", outs: [{ ta: "ஜ", w: 0.6 }] },
  { pat: "t", outs: [{ ta: "த", w: 0.6 }] },
  { pat: "d", outs: [{ ta: "த", w: 0.55 }] },
  { pat: "n", outs: [{ ta: "ந", w: 0.55 }, { ta: "ன", w: 0.5 }, { ta: "ண", w: 0.45 }] },
  { pat: "p", outs: [{ ta: "ப", w: 0.6 }] },
  { pat: "b", outs: [{ ta: "ப", w: 0.55 }] },
  { pat: "m", outs: [{ ta: "ம", w: 0.65 }] },
  { pat: "y", outs: [{ ta: "ய", w: 0.55 }] },
  { pat: "r", outs: [{ ta: "ர", w: 0.55 }] },
  { pat: "l", outs: [{ ta: "ல", w: 0.55 }] },
  { pat: "v", outs: [{ ta: "வ", w: 0.7 }] },
  { pat: "w", outs: [{ ta: "வ", w: 0.65 }] },
  { pat: "h", outs: [{ ta: "ஹ", w: 0.5 }] },
  { pat: "f", outs: [{ ta: "ஃப", w: 0.5 }, { ta: "ப", w: 0.35 }] },
];

const RULES_SORTED = [...RULES].sort((a, b) => b.pat.length - a.pat.length);

type BeamNode = {
  i: number;
  out: string;
  score: number;
};

/**
 * Beam-search expansion from roman -> Tamil prefix candidates.
 *
 * This is intentionally bounded so we can keep latency low. It is not a full IME
 * orthography engine; the prefix corpus lookup is expected to map prefixes to real words.
 */
export function expandPhonetic(q: string, opts?: { maxCandidates?: number; beamWidth?: number }): PhoneticCandidate[] {
  const maxCandidates = Math.max(1, Math.min(opts?.maxCandidates ?? 20, 80));
  const beamWidth = Math.max(2, Math.min(opts?.beamWidth ?? 24, 80));

  const s = (q || "").trim().toLowerCase();
  if (!s) return [];

  let beam: BeamNode[] = [{ i: 0, out: "", score: 1.0 }];

  for (let step = 0; step < s.length && beam.length; step++) {
    const next: BeamNode[] = [];
    for (const node of beam) {
      if (node.i >= s.length) {
        next.push(node);
        continue;
      }
      const rest = s.slice(node.i);
      let matched = false;
      for (const r of RULES_SORTED) {
        if (!rest.startsWith(r.pat)) continue;
        matched = true;
        for (const o of r.outs) {
          next.push({
            i: node.i + r.pat.length,
            out: node.out + o.ta,
            score: node.score * o.w,
          });
        }
      }
      // If no rule matched, skip one char (typo tolerance) with penalty
      if (!matched) {
        next.push({ i: node.i + 1, out: node.out, score: node.score * 0.7 });
      }
    }

    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, beamWidth);
  }

  const finals = beam
    .filter((b) => b.out.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map((b) => ({ tamilPrefix: b.out, phoneticScore: clamp01(b.score) }));

  // Dedupe by prefix
  const seen = new Set<string>();
  const out: PhoneticCandidate[] = [];
  for (const c of finals) {
    if (seen.has(c.tamilPrefix)) continue;
    seen.add(c.tamilPrefix);
    out.push(c);
  }
  return out;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}


