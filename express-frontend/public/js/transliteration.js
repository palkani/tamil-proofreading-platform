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

// Common word mappings for better accuracy (100+ words)
const commonWordMap = {
  // Greetings & Common Phrases
  'vanakkam': 'வணக்கம்',
  'nandri': 'நன்றி',
  'thanks': 'நன்றி',
  'welcome': 'வரவேற்கிறோம்',
  'varaverpom': 'வரவேற்போம்',
  'sorry': 'மன்னிக்கவும்',
  'mannikavum': 'மன்னிக்கவும்',
  'please': 'தயவுசெய்து',
  'dayavuseythu': 'தயவுசெய்து',
  
  // Question Words
  'eppadi': 'எப்படி',
  'how': 'எப்படி',
  'eppozhuthu': 'எப்போது',
  'eppothu': 'எப்போது',
  'when': 'எப்போது',
  'engae': 'எங்கே',
  'where': 'எங்கே',
  'enna': 'என்ன',
  'what': 'என்ன',
  'yaaru': 'யார்',
  'who': 'யார்',
  'yean': 'ஏன்',
  'why': 'ஏன்',
  'evvalavu': 'எவ்வளவு',
  'howmuch': 'எவ்வளவு',
  
  // Pronouns
  'naan': 'நான்',
  'i': 'நான்',
  'nee': 'நீ',
  'you': 'நீ',
  'avan': 'அவன்',
  'he': 'அவன்',
  'aval': 'அவள்',
  'she': 'அவள்',
  'avar': 'அவர்',
  'they': 'அவர்கள்',
  'avargal': 'அவர்கள்',
  'naangal': 'நாங்கள்',
  'we': 'நாங்கள்',
  'naam': 'நாம்',
  'idhu': 'இது',
  'this': 'இது',
  'adhu': 'அது',
  'that': 'அது',
  
  // Time Words
  'indru': 'இன்று',
  'today': 'இன்று',
  'netru': 'நேற்று',
  'yesterday': 'நேற்று',
  'naalai': 'நாளை',
  'tomorrow': 'நாளை',
  'ippothu': 'இப்போது',
  'now': 'இப்போது',
  'piragu': 'பிறகு',
  'later': 'பிறகு',
  'munbu': 'முன்பு',
  'before': 'முன்பு',
  'kaalai': 'காலை',
  'morning': 'காலை',
  'maalai': 'மாலை',
  'evening': 'மாலை',
  'iravu': 'இரவு',
  'night': 'இரவு',
  
  // Adjectives
  'nalla': 'நல்ல',
  'good': 'நல்ல',
  'periya': 'பெரிய',
  'big': 'பெரிய',
  'siriya': 'சிறிய',
  'small': 'சிறிய',
  'puthu': 'புதிய',
  'new': 'புதிய',
  'pazhaya': 'பழைய',
  'old': 'பழைய',
  'azhagu': 'அழகு',
  'beautiful': 'அழகு',
  'azhaana': 'அழகான',
  'vegu': 'வெகு',
  'very': 'மிகவும்',
  'migavum': 'மிகவும்',
  'romba': 'ரொம்ப',
  'kuraiya': 'குறைய',
  'less': 'குறைய',
  'athigam': 'அதிகம்',
  'more': 'அதிகம்',
  
  // Verbs (Common)
  'vaa': 'வா',
  'come': 'வா',
  'po': 'போ',
  'go': 'போ',
  'paar': 'பார்',
  'see': 'பார்',
  'kael': 'கேள்',
  'hear': 'கேள்',
  'sollu': 'சொல்',
  'say': 'சொல்',
  'seyya': 'செய்ய',
  'do': 'செய்ய',
  'sapidu': 'சாப்பிடு',
  'eat': 'சாப்பிடு',
  'kudu': 'குடி',
  'drink': 'குடி',
  'padikka': 'படிக்க',
  'read': 'படிக்க',
  'ezhudhu': 'எழுது',
  'write': 'எழுது',
  'odu': 'ஓடு',
  'run': 'ஓடு',
  'nadakkа': 'நடக்க',
  'walk': 'நடக்க',
  
  // Nouns (Common)
  'tamil': 'தமிழ்',
  'thamizh': 'தமிழ்',
  'language': 'மொழி',
  'mozhi': 'மொழி',
  'veedu': 'வீடு',
  'house': 'வீடு',
  'oor': 'ஊர்',
  'town': 'ஊர்',
  'naadu': 'நாடு',
  'country': 'நாடு',
  'palli': 'பள்ளி',
  'school': 'பள்ளி',
  'kalloori': 'கல்லூரி',
  'college': 'கல்லூரி',
  'veli': 'வேலை',
  'work': 'வேலை',
  'amma': 'அம்மா',
  'mother': 'அம்மா',
  'appa': 'அப்பா',
  'father': 'அப்பா',
  'kulanthai': 'குழந்தை',
  'child': 'குழந்தை',
  'nanban': 'நண்பன்',
  'friend': 'நண்பன்',
  'unavu': 'உணவு',
  'food': 'உணவு',
  'neer': 'நீர்',
  'water': 'நீர்',
  'thanneer': 'தண்ணீர்',
  'paal': 'பால்',
  'milk': 'பால்',
  'saadham': 'சாதம்',
  'rice': 'சாதம்',
  
  // Numbers
  'ondru': 'ஒன்று',
  'one': 'ஒன்று',
  'irandu': 'இரண்டு',
  'two': 'இரண்டு',
  'moondru': 'மூன்று',
  'three': 'மூன்று',
  'naangu': 'நான்கு',
  'four': 'நான்கு',
  'ainthu': 'ஐந்து',
  'five': 'ஐந்து',
  'aaru': 'ஆறு',
  'six': 'ஆறு',
  'ezhu': 'ஏழு',
  'seven': 'ஏழு',
  'ettu': 'எட்டு',
  'eight': 'எட்டு',
  'onpathu': 'ஒன்பது',
  'nine': 'ஒன்பது',
  'paththu': 'பத்து',
  'ten': 'பத்து'
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
