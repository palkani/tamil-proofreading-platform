// Conservative Roman input normalizer for IME typing.
// Goal: reduce common typos without being "too smart".

/**
 * Normalize English/Tanglish input for phonetic matching
 * 
 * Transformations:
 * 1. Lowercase
 * 2. Vowel collapsing: "vaaannakk" → "vanakk"
 * 3. Consonant collapsing (safe): "kkk" → "kk"
 * 4. Remove non-alphabetic chars
 * 5. Normalize common Tanglish variants
 * 
 * @param q - Raw user input
 * @returns Normalized string ready for phonetic expansion
 */
export function normalizeRoman(q: string): string {
  const s = String(q || "").toLowerCase().trim();
  if (!s) return "";

  // Step 1: Remove non a-z + apostrophe (keep IME-friendly)
  let out = s.replace(/[^a-z']/g, "");

  // Step 2: Collapse repeated vowels (3+ → 2)
  // "vaaaan" → "vaan", "iiiiii" → "ii"
  out = collapseVowels(out);

  // Step 3: Collapse 3+ repeated consonants to 2
  // "kkkk" → "kk", "tttt" → "tt"
  // But preserve doubles like "kk", "tt" which are meaningful
  out = out.replace(/([bcdfghjklmnpqrstvwxyz])\1{2,}/g, "$1$1");

  // Step 4: Normalize common Tanglish variants
  out = normalizeVariants(out);

  return out;
}

/**
 * Collapse repeated vowels intelligently
 * 
 * Rules:
 * - 3+ same vowels → 2 (meaningful in Tamil)
 * - Keeps double vowels (aa, ee, oo) which map to long vowels
 * 
 * Examples:
 * - "vaaaan" → "vaan" (3+ a's → 2)
 * - "vaan" → "vaan" (already 2, keep)
 * - "van" → "van" (single, keep)
 */
function collapseVowels(s: string): string {
  // Collapse 3+ repeated vowels to 2
  return s.replace(/([aeiou])\1{2,}/g, "$1$1");
}

/**
 * Normalize common Tanglish spelling variants to canonical form
 * 
 * This helps with common misspellings and regional variations:
 * - "thamizh/tamizh" → "tamil"
 * - "naanum" → "nanum"
 * - "yaarukku" → "yarukku"
 */
function normalizeVariants(s: string): string {
  // Common variant patterns
  const variants: Record<string, string> = {
    // Tamil/Tamizh variants
    thamizh: "tamil",
    tamizh: "tamil",
    thamiz: "tamil",
    tamiz: "tamil",
    
    // Common double-vowel patterns
    naanum: "nanum",
    yaarukku: "yarukku",
    
    // zh/zha variants (some type "zha" for ழ)
    // Keep as-is since "zh" is standard
  };

  // Apply direct replacements
  if (variants[s]) {
    return variants[s];
  }

  // Pattern-based normalization
  // (Add more patterns as needed based on user data)
  
  return s;
}

/**
 * Advanced: Remove common typo patterns
 * (Currently not used, but useful for future enhancement)
 */
export function removeTypos(s: string): string {
  // Example: "vanakkamm" → "vanakkam" (trailing repeated char)
  // Only apply if very confident it's a typo
  return s;
}



