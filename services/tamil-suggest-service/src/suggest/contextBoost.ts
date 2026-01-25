/**
 * Context Boost Module
 * 
 * Provides context-aware scoring boosts based on:
 * - Bigram frequency (previous word context)
 * - User acceptance history
 * - Common phrase patterns
 */

export type ContextBoostInput = {
  candidate: string;
  prevWord?: string;
  bigramFreq?: number;
  acceptanceCount?: number;
};

export type ContextBoostResult = {
  bigramBonus: number;      // 0-10 points
  acceptanceBonus: number;  // 0-5 points
  totalBonus: number;       // sum of bonuses
};

/**
 * Calculate context-aware scoring bonuses
 * 
 * @param input - Candidate with context information
 * @param bigramMap - Map of prev_word -> next_word -> frequency
 * @param acceptanceMap - Map of input -> selected -> count
 * @returns Context boost scores
 */
export function calculateContextBoost(
  input: ContextBoostInput,
  bigramMap?: Map<string, Map<string, number>>,
  acceptanceMap?: Map<string, Map<string, number>>
): ContextBoostResult {
  let bigramBonus = 0;
  let acceptanceBonus = 0;

  // 1. Bigram context bonus (0-10 points)
  if (input.prevWord && bigramMap) {
    const nextWordMap = bigramMap.get(input.prevWord);
    if (nextWordMap) {
      const freq = nextWordMap.get(input.candidate) || 0;
      if (freq > 0) {
        // Logarithmic scaling for bigram frequency
        // High-frequency bigrams (1000+) get max 10 points
        // Medium frequency (100) gets ~7 points
        // Low frequency (10) gets ~3 points
        bigramBonus = Math.min(10, Math.log1p(freq) * 1.4);
      }
    }
  }

  // 2. User acceptance bonus (0-5 points)
  if (input.acceptanceCount && input.acceptanceCount > 0) {
    // Users who repeatedly select this suggestion get a boost
    // 10+ selections = max 5 points
    // 5 selections = ~3 points
    // 2 selections = ~1 point
    acceptanceBonus = Math.min(5, Math.log1p(input.acceptanceCount) * 2);
  }

  return {
    bigramBonus: Math.round(bigramBonus * 100) / 100,
    acceptanceBonus: Math.round(acceptanceBonus * 100) / 100,
    totalBonus: Math.round((bigramBonus + acceptanceBonus) * 100) / 100,
  };
}

/**
 * Get bigram boost for a candidate given previous word
 * 
 * @param candidate - Tamil text candidate
 * @param prevWord - Previous Tamil word
 * @param bigramMap - Bigram frequency map
 * @returns Bigram frequency score (0-10)
 */
export function getBigramBoost(
  candidate: string,
  prevWord: string | undefined,
  bigramMap: Map<string, Map<string, number>>
): number {
  if (!prevWord) return 0;
  
  const nextWordMap = bigramMap.get(prevWord);
  if (!nextWordMap) return 0;
  
  const freq = nextWordMap.get(candidate) || 0;
  if (freq === 0) return 0;
  
  // Logarithmic scaling: log1p(1000) ≈ 6.9 → *1.4 → 9.7 ≈ 10
  return Math.min(10, Math.log1p(freq) * 1.4);
}

/**
 * Get acceptance boost for a candidate based on user history
 * 
 * @param candidate - Tamil text candidate
 * @param input - Original Tanglish input
 * @param acceptanceMap - Acceptance history map
 * @returns Acceptance frequency score (0-5)
 */
export function getAcceptanceBoost(
  candidate: string,
  input: string,
  acceptanceMap: Map<string, Map<string, number>>
): number {
  const selectedMap = acceptanceMap.get(input);
  if (!selectedMap) return 0;
  
  const count = selectedMap.get(candidate) || 0;
  if (count === 0) return 0;
  
  // Logarithmic scaling: log1p(10) ≈ 2.4 → *2 → 4.8 ≈ 5
  return Math.min(5, Math.log1p(count) * 2);
}

/**
 * Build acceptance frequency map from database rows
 * 
 * @param rows - Array of {input, selected, count}
 * @returns Map of input -> selected -> count
 */
export function buildAcceptanceMap(
  rows: Array<{ input: string; selected: string; count: number }>
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  
  for (const row of rows) {
    let selectedMap = map.get(row.input);
    if (!selectedMap) {
      selectedMap = new Map();
      map.set(row.input, selectedMap);
    }
    
    const existingCount = selectedMap.get(row.selected) || 0;
    if (row.count > existingCount) {
      selectedMap.set(row.selected, row.count);
    }
  }
  
  return map;
}

/**
 * Check if a candidate is a common phrase (multi-word)
 * 
 * @param text - Tamil text
 * @returns true if contains space (multi-word phrase)
 */
export function isPhrase(text: string): boolean {
  return text.includes(" ");
}

/**
 * Calculate phrase bonus
 * 
 * @param text - Tamil text
 * @param kind - Type of corpus item
 * @returns Phrase bonus (0-15 points)
 */
export function getPhraseBonus(text: string, kind: "word" | "phrase"): number {
  // Explicit phrases from corpus get full bonus
  if (kind === "phrase") return 15;
  
  // Multi-word suggestions get partial bonus
  if (isPhrase(text)) return 10;
  
  // Single words get no phrase bonus
  return 0;
}
