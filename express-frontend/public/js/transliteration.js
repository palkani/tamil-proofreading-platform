// English to Tamil Transliteration
// Based on standard Tamil romanization (ISO 15919 and common typing systems)

const tamilConsonants = {
  'k': 'க', 'ng': 'ங', 'ch': 'ச', 'nj': 'ஞ', 'ñ': 'ஞ',
  't': 'ட', 'N': 'ண', 'th': 'த', 'n': 'ந', 'p': 'ப',
  'm': 'ம', 'y': 'ய', 'r': 'ர', 'l': 'ல', 'v': 'வ',
  'zh': 'ழ', 'L': 'ள', 'R': 'ற', 'n': 'ன'
};

const tamilVowels = {
  'a': 'அ', 'aa': 'ஆ', 'A': 'ஆ',
  'i': 'இ', 'ii': 'ஈ', 'I': 'ஈ',
  'u': 'உ', 'uu': 'ஊ', 'U': 'ஊ',
  'e': 'எ', 'ee': 'ஏ', 'E': 'ஏ',
  'ai': 'ஐ',
  'o': 'ஒ', 'oo': 'ஓ', 'O': 'ஓ',
  'au': 'ஔ'
};

const tamilVowelSigns = {
  'a': '', // inherent vowel
  'aa': 'ா', 'A': 'ா',
  'i': 'ி', 'ii': 'ீ', 'I': 'ீ',
  'u': 'ு', 'uu': 'ூ', 'U': 'ூ',
  'e': 'ெ', 'ee': 'ே', 'E': 'ே',
  'ai': 'ை',
  'o': 'ொ', 'oo': 'ோ', 'O': 'ோ',
  'au': 'ௌ'
};

// Common word mappings for better accuracy
const commonWordMap = {
  'vanakkam': 'வணக்கம்',
  'nandri': 'நன்றி',
  'eppadi': 'எப்படி',
  'eppozhuthu': 'எப்போது',
  'engae': 'எங்கே',
  'enna': 'என்ன',
  'yaaru': 'யார்',
  'naan': 'நான்',
  'nee': 'நீ',
  'avan': 'அவன்',
  'aval': 'அவள்',
  'avar': 'அவர்',
  'indru': 'இன்று',
  'netru': 'நேற்று',
  'naalai': 'நாளை',
  'ippothu': 'இப்போது',
  'piragu': 'பிறகு',
  'tamil': 'தமிழ்',
  'thamizh': 'தமிழ்',
  'nalla': 'நல்ல',
  'periya': 'பெரிய',
  'siriya': 'சிறிய',
  'puthu': 'புதிய',
  'pazhaya': 'பழைய'
};

/**
 * Simple English to Tamil transliteration
 * @param {string} englishText - English text to transliterate
 * @returns {string} - Tamil text
 */
function transliterateToTamil(englishText) {
  const lower = englishText.toLowerCase();
  
  // Check common word mappings first
  if (commonWordMap[lower]) {
    return commonWordMap[lower];
  }
  
  // Simple character-by-character transliteration
  let result = '';
  let i = 0;
  
  while (i < lower.length) {
    let matched = false;
    
    // Try to match longer sequences first (2-3 chars)
    for (let len = 3; len >= 1; len--) {
      const substr = lower.substring(i, i + len);
      
      // Check for consonant combinations
      if (tamilConsonants[substr]) {
        result += tamilConsonants[substr];
        i += len;
        matched = true;
        break;
      }
      
      // Check for vowels
      if (tamilVowels[substr]) {
        result += tamilVowels[substr];
        i += len;
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // No match, skip this character
      i++;
    }
  }
  
  return result || englishText;
}

/**
 * Get Tamil word suggestions based on English input
 * @param {string} englishInput - English input text
 * @param {Array} tamilWords - Array of Tamil words to search
 * @returns {Array} - Array of matching Tamil words
 */
function getTamilSuggestionsFromEnglish(englishInput, tamilWords) {
  if (!englishInput || englishInput.length < 2) return [];
  
  const lower = englishInput.toLowerCase();
  const suggestions = [];
  
  // First, check direct common word matches
  if (commonWordMap[lower]) {
    suggestions.push(commonWordMap[lower]);
  }
  
  // Try transliteration
  const transliterated = transliterateToTamil(lower);
  
  // Find Tamil words that start with the transliterated text
  if (transliterated && transliterated !== lower) {
    const matches = tamilWords.filter(word => 
      word.startsWith(transliterated)
    );
    suggestions.push(...matches);
  }
  
  // Also search for Tamil words that could match the English phonetics
  // For example, searching for "van" should suggest words starting with "வ"
  const partialTranslit = transliterateToTamil(lower.substring(0, Math.min(3, lower.length)));
  if (partialTranslit && partialTranslit !== lower.substring(0, Math.min(3, lower.length))) {
    const partialMatches = tamilWords.filter(word => 
      word.startsWith(partialTranslit) && !suggestions.includes(word)
    );
    suggestions.push(...partialMatches.slice(0, 5));
  }
  
  // Limit to top 8 suggestions
  return [...new Set(suggestions)].slice(0, 8);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { transliterateToTamil, getTamilSuggestionsFromEnglish };
}
