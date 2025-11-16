'use client';

const virama = '்';

type VowelPattern = {
  pattern: string;
  independent: string;
  dependent: string;
};

type ConsonantPattern = {
  pattern: string;
  options: string[];
};

const vowelPatterns: VowelPattern[] = [
  { pattern: 'au', independent: 'ஔ', dependent: 'ௌ' },
  { pattern: 'aa', independent: 'ஆ', dependent: 'ா' },
  { pattern: 'ai', independent: 'ஐ', dependent: 'ை' },
  { pattern: 'ee', independent: 'ஏ', dependent: 'ே' },
  { pattern: 'ii', independent: 'ஈ', dependent: 'ீ' },
  { pattern: 'oo', independent: 'ஓ', dependent: 'ோ' },
  { pattern: 'uu', independent: 'ஊ', dependent: 'ூ' },
  { pattern: 'ei', independent: 'ஏ', dependent: 'ே' },
  { pattern: 'ou', independent: 'ஓ', dependent: 'ோ' },
  { pattern: 'e', independent: 'எ', dependent: 'ெ' },
  { pattern: 'i', independent: 'இ', dependent: 'ி' },
  { pattern: 'o', independent: 'ஒ', dependent: 'ொ' },
  { pattern: 'u', independent: 'உ', dependent: 'ு' },
  { pattern: 'a', independent: 'அ', dependent: '' },
];

const consonantPatterns: ConsonantPattern[] = [
  { pattern: 'ng', options: ['ங'] },
  { pattern: 'nj', options: ['ஞ'] },
  { pattern: 'nh', options: ['ந்'] },
  { pattern: 'zh', options: ['ழ'] },
  { pattern: 'rr', options: ['ற', 'ர'] },
  { pattern: 'll', options: ['ள', 'ல'] },
  { pattern: 'nn', options: ['ண', 'ன', 'ந'] },
  { pattern: 'gn', options: ['ஞ'] },
  { pattern: 'ch', options: ['ச'] },
  { pattern: 'sh', options: ['ஷ', 'ச'] },
  { pattern: 'kh', options: ['க'] },
  { pattern: 'gh', options: ['க'] },
  { pattern: 'th', options: ['த', 'ட'] },
  { pattern: 'dh', options: ['த', 'ட'] },
  { pattern: 'ph', options: ['ப'] },
  { pattern: 'bh', options: ['ப'] },
  { pattern: 'jh', options: ['ஜ'] },
  { pattern: 'wh', options: ['வ'] },
  { pattern: 'ts', options: ['ட்ச'] },
  { pattern: 'ks', options: ['க்ஸ'] },
  { pattern: 'k', options: ['க'] },
  { pattern: 'g', options: ['க'] },
  { pattern: 'x', options: ['க்ஸ'] },
  { pattern: 'c', options: ['ச'] },
  { pattern: 'j', options: ['ஜ', 'ச'] },
  { pattern: 't', options: ['ட', 'த'] },
  { pattern: 'd', options: ['ட', 'த'] },
  { pattern: 'p', options: ['ப'] },
  { pattern: 'b', options: ['ப'] },
  { pattern: 'm', options: ['ம'] },
  { pattern: 'n', options: ['ந', 'ன', 'ண'] },
  { pattern: 'y', options: ['ய'] },
  { pattern: 'r', options: ['ர', 'ற'] },
  { pattern: 'l', options: ['ல', 'ள', 'ழ'] },
  { pattern: 'v', options: ['வ'] },
  { pattern: 'w', options: ['வ'] },
  { pattern: 's', options: ['ச', 'ஸ'] },
  { pattern: 'h', options: ['ஹ'] },
  { pattern: 'f', options: ['ஃப'] },
  { pattern: 'q', options: ['க'] },
  { pattern: 'z', options: ['ஸ', 'ஜ'] },
];

const sortedVowels = [...vowelPatterns].sort((a, b) => b.pattern.length - a.pattern.length);
const sortedConsonants = [...consonantPatterns].sort((a, b) => b.pattern.length - a.pattern.length);

const transliterationCache = new Map<string, string[]>();

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function transliterateRomanToTamil(roman: string, limit = 6): string[] {
  const key = roman.toLowerCase();
  if (transliterationCache.has(key)) {
    return transliterationCache.get(key)!;
  }

  const normalized = key;
  const results = new Set<string>();
  const maxGenerated = limit * 6;

  function dfs(index: number, output: string, depth: number) {
    if (results.size >= maxGenerated || depth > normalized.length + 5) {
      return;
    }

    if (index >= normalized.length) {
      if (output) {
        results.add(output);
      }
      return;
    }

    let matched = false;

    for (const vowel of sortedVowels) {
      if (normalized.startsWith(vowel.pattern, index)) {
        matched = true;
        dfs(index + vowel.pattern.length, output + vowel.independent, depth + 1);
      }
    }

    for (const consonant of sortedConsonants) {
      if (normalized.startsWith(consonant.pattern, index)) {
        matched = true;
        const nextIndex = index + consonant.pattern.length;
        let vowelMatched = false;

        for (const vowel of sortedVowels) {
          if (normalized.startsWith(vowel.pattern, nextIndex)) {
            vowelMatched = true;
            for (const option of consonant.options) {
              const letter = option + vowel.dependent;
              dfs(nextIndex + vowel.pattern.length, output + letter, depth + 1);
            }
          }
        }

        if (!vowelMatched) {
          for (const option of consonant.options) {
            dfs(nextIndex, output + option + virama, depth + 1);
          }
        }
      }
    }

    if (!matched) {
      const char = normalized[index];
      dfs(index + 1, output + char, depth + 1);
    }
  }

  dfs(0, '', 0);

  let suggestions = Array.from(results)
    .map((word) => word.replace(/([\p{sc=Tamil}])்(?=\s|$)/gu, '$1்'))
    .filter((word) => /[\p{sc=Tamil}]/u.test(word))
    .slice(0, limit);

  // If no Tamil transliteration found, try to create a basic phonetic conversion
  if (suggestions.length === 0 && normalized.length > 0) {
    // Fallback: create a simple phonetic transliteration
    let fallback = '';
    let i = 0;
    while (i < normalized.length) {
      let matched = false;
      
      // Try consonant-vowel patterns first
      for (const consonant of sortedConsonants) {
        if (normalized.startsWith(consonant.pattern, i)) {
          const nextIdx = i + consonant.pattern.length;
          let vowelMatched = false;
          
          for (const vowel of sortedVowels) {
            if (normalized.startsWith(vowel.pattern, nextIdx)) {
              fallback += consonant.options[0] + vowel.dependent;
              i = nextIdx + vowel.pattern.length;
              matched = true;
              vowelMatched = true;
              break;
            }
          }
          
          if (!vowelMatched) {
            fallback += consonant.options[0] + virama;
            i = nextIdx;
            matched = true;
          }
          break;
        }
      }
      
      // Try vowels
      if (!matched) {
        for (const vowel of sortedVowels) {
          if (normalized.startsWith(vowel.pattern, i)) {
            fallback += vowel.independent;
            i += vowel.pattern.length;
            matched = true;
            break;
          }
        }
      }
      
      // If no match, skip the character
      if (!matched) {
        i++;
      }
    }
    
    if (fallback && /[\u0B80-\u0BFF]/.test(fallback)) {
      suggestions = [fallback];
    }
  }

  transliterationCache.set(key, suggestions);
  return suggestions;
}

export function transliterateTamilVariants(roman: string, limit = 6): string[] {
  if (!roman) return [];

  const normalized = roman.toLowerCase();
  const poolSize = Math.max(limit * 3, limit);
  const rawVariants = transliterateRomanToTamil(normalized, poolSize);
  if (rawVariants.length <= limit) {
    return rawVariants;
  }

  const baseTamil = transliterateRomanToTamil(normalized, 1)[0] ?? '';
  const uniqueVariants = Array.from(new Set(rawVariants));

  const scored = uniqueVariants.map((word, index) => {
    const tamilLength = word.replace(/\s+/g, '').length;
    const baseLength = baseTamil ? baseTamil.length : tamilLength;
    const lengthPenalty = Math.abs(tamilLength - baseLength) * 0.6;
    const distance = baseTamil ? levenshteinDistance(baseTamil, word.slice(0, baseTamil.length)) : 0;
    const trailingViramaPenalty = /்$/u.test(word) ? 0.75 : 0;
    const asciiPenalty = /[\u0B80-\u0BFF]/u.test(word) ? 0 : 3;

    return {
      word,
      score: distance * 2 + lengthPenalty + trailingViramaPenalty + asciiPenalty + index * 0.01,
    };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((item) => item.word);
}

// Check if text contains Tamil characters
function hasTamilCharacters(text: string): boolean {
  return /[\u0B80-\u0BFF]/.test(text);
}

// Check if text is primarily English (not Tamil)
function isEnglishText(text: string): boolean {
  if (!text.trim()) return false;
  
  // If it has Tamil characters, it's not English
  if (hasTamilCharacters(text)) return false;
  
  // Check if it contains English letters
  const englishPattern = /[a-zA-Z]/;
  return englishPattern.test(text);
}

// Convert a single word to Tamil transliteration (picks first variant)
function wordToTamil(word: string): string {
  if (!word) return word;
  
  // Extract the core alphabetic part, preserving surrounding punctuation
  // This handles words like "don't", "it's", "well-known", etc.
  const wordPattern = /([a-zA-Z]+(?:'[a-zA-Z]+)?(?:-[a-zA-Z]+)*)/g;
  const matches = Array.from(word.matchAll(wordPattern));
  
  if (matches.length === 0) {
    // No letters found, return as-is
    return word;
  }
  
  let result = word;
  // Process matches in reverse to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const letters = match[0];
    const startIdx = match.index!;
    const endIdx = startIdx + letters.length;
    
    // Get transliteration variants
    const variants = transliterateRomanToTamil(letters.toLowerCase(), 1);
    let tamilWord = letters; // fallback to original
    
    if (variants.length > 0 && variants[0]) {
      const transliterated = variants[0];
      // Only use if it actually contains Tamil characters
      if (/[\u0B80-\u0BFF]/.test(transliterated)) {
        tamilWord = transliterated;
      }
    }
    
    // Replace the matched portion
    result = result.slice(0, startIdx) + tamilWord + result.slice(endIdx);
  }
  
  return result;
}

// Convert English paragraph to Tamil transliteration
export function convertEnglishToTamil(text: string): string {
  if (!text || !isEnglishText(text)) {
    return text;
  }
  
  // Split by lines to preserve line breaks
  const lines = text.split('\n');
  const convertedLines = lines.map((line) => {
    if (!line.trim()) return line;
    
    // Better word boundary detection - match words (letters, apostrophes, hyphens)
    // and non-word characters separately
    const wordRegex = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?(?:-[a-zA-Z]+)*\b/g;
    
    return line.replace(wordRegex, (word) => {
      // Convert each word
      const converted = wordToTamil(word);
      // Only return converted if it actually changed and contains Tamil
      if (converted !== word && /[\u0B80-\u0BFF]/.test(converted)) {
        return converted;
      }
      // If conversion failed, try direct transliteration of the word
      const directVariants = transliterateRomanToTamil(word.toLowerCase(), 1);
      if (directVariants.length > 0 && /[\u0B80-\u0BFF]/.test(directVariants[0])) {
        return directVariants[0];
      }
      // Fallback: return original word
      return word;
    });
  });
  
  return convertedLines.join('\n');
}
