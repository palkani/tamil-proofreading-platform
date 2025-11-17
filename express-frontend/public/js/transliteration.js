// English to Tamil Transliteration
// Based on standard Tamil romanization (ISO 15919 and common typing systems)
// Enhanced with multi-variant generation for Google Input Tools-style suggestions

// Consonant mappings with variants for ambiguous cases
const tamilConsonantMap = {
  'k': { primary: 'க', variants: ['க'] },
  'g': { primary: 'க', variants: ['க', 'ங'] },
  'ng': { primary: 'ங', variants: ['ங'] },
  'ch': { primary: 'ச', variants: ['ச'] },
  's': { primary: 'ச', variants: ['ச', 'ஸ'] },
  'j': { primary: 'ஜ', variants: ['ஜ', 'ச'] },
  'nj': { primary: 'ஞ', variants: ['ஞ'] },
  'ñ': { primary: 'ஞ', variants: ['ஞ'] },
  't': { primary: 'ட', variants: ['ட', 'த'] },
  'th': { primary: 'த', variants: ['த', 'ட'] },
  'd': { primary: 'ட', variants: ['ட', 'த'] },
  'N': { primary: 'ண', variants: ['ண'] },
  'n': { primary: 'ந', variants: ['ந', 'ன', 'ண'] },
  'p': { primary: 'ப', variants: ['ப'] },
  'b': { primary: 'ப', variants: ['ப'] },
  'm': { primary: 'ம', variants: ['ம'] },
  'y': { primary: 'ய', variants: ['ய'] },
  'r': { primary: 'ர', variants: ['ர', 'ற'] },
  'l': { primary: 'ல', variants: ['ல', 'ள'] },
  'v': { primary: 'வ', variants: ['வ'] },
  'w': { primary: 'வ', variants: ['வ'] },
  'zh': { primary: 'ழ', variants: ['ழ'] },
  'L': { primary: 'ள', variants: ['ள'] },
  'R': { primary: 'ற', variants: ['ற'] },
  'z': { primary: 'ழ', variants: ['ழ', 'ஜ'] },
  'h': { primary: 'ஹ', variants: ['ஹ', ''] },
  'f': { primary: 'ஃப', variants: ['ஃப'] },
  'sh': { primary: 'ஷ', variants: ['ஷ', 'ச'] }
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

// Legacy consonants for backward compatibility
const tamilConsonants = {
  'k': 'க', 'ng': 'ங', 'ch': 'ச', 'nj': 'ஞ', 'ñ': 'ஞ',
  't': 'ட', 'N': 'ண', 'th': 'த', 'n': 'ந', 'p': 'ப',
  'm': 'ம', 'y': 'ய', 'r': 'ர', 'l': 'ல', 'v': 'வ',
  'zh': 'ழ', 'L': 'ள', 'R': 'ற', 'n': 'ன'
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
  
  // Cultural & Nature Words
  'sangam': 'சங்கம்',
  'thenral': 'தென்றல்',
  'thendral': 'தென்றல்',
  'katru': 'காற்று',
  'wind': 'காற்று',
  'malar': 'மலர்',
  'flower': 'மலர்',
  'poo': 'பூ',
  'mazhai': 'மழை',
  'rain': 'மழை',
  'nila': 'நிலா',
  'moon': 'நிலா',
  'suryan': 'சூரியன்',
  'sun': 'சூரியன்',
  'kaadal': 'காதல்',
  'love': 'காதல்',
  'anbu': 'அன்பு',
  
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
  'ten': 'பத்து',
  'nooru': 'நூறு',
  'hundred': 'நூறு',
  'aayiram': 'ஆயிரம்',
  'thousand': 'ஆயிரம்',
  'latcham': 'லட்சம்',
  
  // More Family & Relationships
  'akka': 'அக்கா',
  'sister': 'அக்கா',
  'anna': 'அண்ணா',
  'brother': 'அண்ணா',
  'thangai': 'தங்கை',
  'thambi': 'தம்பி',
  'paati': 'பாட்டி',
  'grandmother': 'பாட்டி',
  'thaatha': 'தாத்தா',
  'grandfather': 'தாத்தா',
  'maama': 'மாமா',
  'uncle': 'மாமா',
  'athhai': 'அத்தை',
  'aunt': 'அத்தை',
  'magan': 'மகன்',
  'son': 'மகன்',
  'magal': 'மகள்',
  'daughter': 'மகள்',
  'kanavan': 'கணவன்',
  'husband': 'கணவன்',
  'manaivi': 'மனைவி',
  'wife': 'மனைவி',
  
  // Body Parts
  'thala': 'தலை',
  'head': 'தலை',
  'kai': 'கை',
  'hand': 'கை',
  'kaal': 'கால்',
  'leg': 'கால்',
  'kan': 'கண்',
  'eye': 'கண்',
  'kaathu': 'காது',
  'ear': 'காது',
  'mooku': 'மூக்கு',
  'nose': 'மூக்கு',
  'vaai': 'வாய்',
  'mouth': 'வாய்',
  'pal': 'பல்',
  'tooth': 'பல்',
  'naakku': 'நாக்கு',
  'tongue': 'நாக்கு',
  'udal': 'உடல்',
  'body': 'உடல்',
  'idhayam': 'இதயம்',
  'heart': 'இதயம்',
  
  // Common Verbs (Extended)
  'thoonggu': 'தூங்கு',
  'sleep': 'தூங்கு',
  'vizhi': 'விழி',
  'wake': 'விழி',
  'nadappu': 'நடப்பு',
  'sellu': 'செல்',
  'nilla': 'நில்',
  'stop': 'நில்',
  'utkaar': 'உட்கார்',
  'sit': 'உட்கார்',
  'ezhu': 'எழு',
  'rise': 'எழு',
  'vizhunthu': 'விழுந்து',
  'fall': 'விழு',
  'parakka': 'பறக்க',
  'fly': 'பறக்க',
  'neenda': 'நீண்ட',
  'long': 'நீண்ட',
  'siriya': 'சிறிய',
  'little': 'சிறிய',
  
  // Food & Drink
  'saappadu': 'சாப்பாடு',
  'meal': 'சாப்பாடு',
  'tiffin': 'டிஃபின்',
  'idli': 'இட்லி',
  'dosa': 'தோசை',
  'dosai': 'தோசை',
  'vada': 'வடை',
  'vadai': 'வடை',
  'sambar': 'சாம்பார்',
  'rasam': 'ரசம்',
  'curd': 'தயிர்',
  'thayir': 'தயிர்',
  'pazham': 'பழம்',
  'fruit': 'பழம்',
  'kari': 'கறி',
  'curry': 'கறி',
  'theeneer': 'தேநீர்',
  'tea': 'தேநீர்',
  'kaapi': 'காபி',
  'coffee': 'காபி',
  'juice': 'ஜூஸ்',
  'uppu': 'உப்பு',
  'salt': 'உப்பு',
  'sarkkarai': 'சர்க்கரை',
  'sugar': 'சர்க்கரை',
  
  // Emotions & States
  'santhosham': 'சந்தோஷம்',
  'happy': 'சந்தோஷம்',
  'kovam': 'கோபம்',
  'angry': 'கோபம்',
  'sogam': 'சோகம்',
  'sad': 'சோகம்',
  'bayam': 'பயம்',
  'fear': 'பயம்',
  'pidikum': 'பிடிக்கும்',
  'like': 'பிடிக்கும்',
  'pidikadhu': 'பிடிக்காது',
  'dislike': 'பிடிக்காது',
  'aachariyam': 'ஆச்சரியம்',
  'surprise': 'ஆச்சரியம்',
  
  // Places & Buildings
  'manai': 'மனை',
  'home': 'மனை',
  'arai': 'அறை',
  'room': 'அறை',
  'kattu': 'கட்டு',
  'building': 'கட்டிடம்',
  'kattidam': 'கட்டிடம்',
  'kadai': 'கடை',
  'shop': 'கடை',
  'sandhai': 'சந்தை',
  'market': 'சந்தை',
  'koil': 'கோயில்',
  'temple': 'கோயில்',
  'masjid': 'மசூதி',
  'mosque': 'மசூதி',
  'church': 'ஆலயம்',
  'aalayam': 'ஆலயம்',
  'hospital': 'மருத்துவமனை',
  'maruthuvamanai': 'மருத்துவமனை',
  'poliisu': 'போலீஸ்',
  'police': 'போலீஸ்',
  
  // Transportation
  'paandu': 'பண்டு',
  'bus': 'பேருந்து',
  'perunthu': 'பேருந்து',
  'train': 'ரயில்',
  'rayil': 'ரயில்',
  'car': 'கார்',
  'kaaru': 'கார்',
  'cycle': 'சைக்கிள்',
  'bike': 'பைக்',
  'flight': 'விமானம்',
  'vimaanam': 'விமானம்',
  'ship': 'கப்பல்',
  'kappal': 'கப்பல்',
  'auto': 'ஆட்டோ',
  
  // Nature & Environment
  'vaanam': 'வானம்',
  'sky': 'வானம்',
  'megam': 'மேகம்',
  'cloud': 'மேகம்',
  'viral': 'விரல்',
  'finger': 'விரல்',
  'idal': 'இடல்',
  'thunder': 'இடி',
  'idi': 'இடி',
  'minnal': 'மின்னல்',
  'lightning': 'மின்னல்',
  'kadal': 'கடல்',
  'sea': 'கடல்',
  'aaru': 'ஆறு',
  'river': 'ஆறு',
  'malai': 'மலை',
  'mountain': 'மலை',
  'eru': 'ஏரி',
  'lake': 'ஏரி',
  'kulam': 'குளம்',
  'pond': 'குளம்',
  'nilam': 'நிலம்',
  'land': 'நிலம்',
  'maram': 'மரம்',
  'tree': 'மரம்',
  'ilai': 'இலை',
  'leaf': 'இலை',
  'kodi': 'கொடி',
  'vine': 'கொடி',
  'viththu': 'விதை',
  'seed': 'விதை',
  
  // Colors
  'niram': 'நிறம்',
  'color': 'நிறம்',
  'vellai': 'வெள்ளை',
  'white': 'வெள்ளை',
  'karuppu': 'கருப்பு',
  'black': 'கருப்பு',
  'sivappu': 'சிவப்பு',
  'red': 'சிவப்பு',
  'pachai': 'பச்சை',
  'green': 'பச்சை',
  'manjal': 'மஞ்சள்',
  'yellow': 'மஞ்சள்',
  'neelam': 'நீலம்',
  'blue': 'நீலம்',
  
  // Common Objects
  'pusthagam': 'புத்தகம்',
  'book': 'புத்தகம்',
  'kathal': 'கதை',
  'story': 'கதை',
  'paper': 'காகிதம்',
  'kaagitham': 'காகிதம்',
  'pen': 'எழுதுகோல்',
  'pencil': 'பென்சில்',
  'meja': 'மேஜை',
  'table': 'மேஜை',
  'narkali': 'நாற்காலி',
  'chair': 'நாற்காலி',
  'kathavu': 'கதவு',
  'door': 'கதவு',
  'sannal': 'ஜன்னல்',
  'window': 'ஜன்னல்',
  'kappi': 'கப்பி',
  'cup': 'கோப்பை',
  'koppai': 'கோப்பை',
  'plate': 'தட்டு',
  'thattu': 'தட்டு',
  
  // Actions & Activities
  'vilaiyaddu': 'விளையாட்டு',
  'game': 'விளையாட்டு',
  'paadal': 'பாடல்',
  'song': 'பாடல்',
  'aattam': 'ஆட்டம்',
  'dance': 'ஆட்டம்',
  'cinema': 'சினிமா',
  'padam': 'படம்',
  'movie': 'படம்',
  'velai': 'வேலை',
  'job': 'வேலை',
  'velaiyaattam': 'வேலையாட்டம்',
  
  // Common Adjectives
  'uiram': 'உயரம்',
  'tall': 'உயரம்',
  'kutti': 'குட்டி',
  'short': 'குட்டி',
  'nerukkamaana': 'நெருக்கமான',
  'near': 'அருகில்',
  'arugil': 'அருகில்',
  'thoorathil': 'தூரத்தில்',
  'far': 'தூரம்',
  'thooram': 'தூரம்',
  'veguva': 'வேகம்',
  'fast': 'வேகம்',
  'medhuva': 'மெதுவ',
  'slow': 'மெதுவ',
  'suuda': 'சூடா',
  'hot': 'சூடு',
  'soodu': 'சூடு',
  'kulira': 'குளிர்',
  'cold': 'குளிர்'
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
 * Generate multiple Tamil transliteration variants (Google Input Tools style)
 * Fixed to properly build complete Tamil words with correct syllable structure
 * @param {string} englishText - English text to transliterate
 * @returns {Array} - Array of Tamil variants
 */
function generateTamilVariants(englishText) {
  if (!englishText || englishText.length < 2) return [];
  
  const lower = englishText.toLowerCase();
  const allVariants = [];
  
  // Helper function to build Tamil syllables recursively
  const buildVariants = (input, position, current) => {
    // Base case: reached end of input
    if (position >= input.length) {
      if (current.length > 0) {
        allVariants.push(current);
      }
      return;
    }
    
    // Limit total variants to prevent explosion
    if (allVariants.length >= 10) return;
    
    let matched = false;
    
    // Try to match consonant clusters (longest first)
    for (let cLen = 4; cLen >= 1; cLen--) {
      if (position + cLen > input.length) continue;
      
      const consonantStr = input.substring(position, position + cLen);
      const consonantData = tamilConsonantMap[consonantStr];
      
      if (!consonantData) continue;
      
      // Look ahead for vowel
      let vowelMatched = false;
      for (let vLen = 2; vLen >= 1; vLen--) {
        const vowelPos = position + cLen;
        if (vowelPos + vLen > input.length) continue;
        
        const vowelStr = input.substring(vowelPos, vowelPos + vLen);
        const vowelSign = tamilVowelSigns[vowelStr];
        
        if (vowelSign !== undefined) {
          // Build consonant + vowel syllable variants
          // CRITICAL: When vowel sign is present, NEVER add pulli
          consonantData.variants.slice(0, 2).forEach(cons => {  // Limit to 2 consonant variants
            const syllable = cons + vowelSign;
            const nextPos = vowelPos + vLen;
            
            // Vowel sign present = NO pulli (e.g., "தெ" in "தென்றல்")
            buildVariants(input, nextPos, current + syllable);
          });
          
          vowelMatched = true;
          matched = true;
          break;
        }
      }
      
      // If no vowel found, use inherent 'a' (default vowel)
      if (!vowelMatched) {
        consonantData.variants.slice(0, 1).forEach(cons => {  // Primary consonant only
          const nextPos = position + cLen;
          
          // Add pulli ONLY when inherent 'a' AND followed by consonant
          // Example: "த்" in "த்மிழ்" but NOT in "தமிழ்"
          const isFollowedByConsonant = nextPos < input.length &&
            (tamilConsonantMap[input[nextPos]] ||
             tamilConsonantMap[input.substring(nextPos, nextPos + 2)]);
          
          const syllable = isFollowedByConsonant ? (cons + '்') : cons;
          buildVariants(input, nextPos, current + syllable);
        });
        matched = true;
      }
      
      if (matched) break;
    }
    
    // Try standalone vowels
    if (!matched) {
      for (let vLen = 2; vLen >= 1; vLen--) {
        if (position + vLen > input.length) continue;
        
        const vowelStr = input.substring(position, position + vLen);
        const vowelChar = tamilVowels[vowelStr];
        
        if (vowelChar) {
          buildVariants(input, position + vLen, current + vowelChar);
          matched = true;
          break;
        }
      }
    }
    
    // Skip unknown character
    if (!matched) {
      buildVariants(input, position + 1, current);
    }
  };
  
  // Start building variants
  buildVariants(lower, 0, '');
  
  // Add vowel length variations
  const withLengthVariants = new Set(allVariants);
  
  allVariants.forEach(variant => {
    // Create long vowel versions
    if (variant.includes('ெ') && withLengthVariants.size < 8) {
      withLengthVariants.add(variant.replace(/ெ/g, 'ே')); // e → ee
    }
    if (variant.includes('ொ') && withLengthVariants.size < 8) {
      withLengthVariants.add(variant.replace(/ொ/g, 'ோ')); // o → oo
    }
    if (variant.includes('ா') && withLengthVariants.size < 8) {
      // a → aa already handled
    }
  });
  
  // Return top 6 unique variants
  return Array.from(withLengthVariants).slice(0, 6);
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
  const seen = new Set();
  
  // Helper to add unique suggestions with priority
  const addSuggestion = (word, priority = 0) => {
    if (!seen.has(word)) {
      seen.add(word);
      suggestions.push({ word, priority });
    }
  };
  
  // 1. HIGHEST PRIORITY: Exact match in common word map
  if (commonWordMap[lower]) {
    addSuggestion(commonWordMap[lower], 100);
  }
  
  // 2. HIGH PRIORITY: Partial matches in common word map (starts with)
  Object.keys(commonWordMap).forEach(key => {
    if (key.startsWith(lower) && key !== lower) {
      addSuggestion(commonWordMap[key], 90);
    }
  });
  
  // 3. MEDIUM PRIORITY: Contains match in common word map
  Object.keys(commonWordMap).forEach(key => {
    if (key.includes(lower) && !key.startsWith(lower)) {
      addSuggestion(commonWordMap[key], 80);
    }
  });
  
  // 4. PHONETIC VARIANTS: Generate multiple Tamil variations (Google Input Tools style)
  const phoneticVariants = generateTamilVariants(lower);
  phoneticVariants.forEach(variant => {
    addSuggestion(variant, 85);
  });
  
  // 5. Try single transliteration for phonetic matching
  const transliterated = transliterateToTamil(lower);
  
  // Find Tamil words that start with the transliterated text
  if (transliterated && transliterated !== lower) {
    addSuggestion(transliterated, 75);
    
    tamilWords.forEach(word => {
      if (word.startsWith(transliterated)) {
        addSuggestion(word, 70);
      }
    });
  }
  
  // 6. Partial transliteration (first 2-3 chars)
  if (lower.length >= 2) {
    const partialTranslit = transliterateToTamil(lower.substring(0, Math.min(3, lower.length)));
    if (partialTranslit && partialTranslit !== lower.substring(0, Math.min(3, lower.length))) {
      tamilWords.forEach(word => {
        if (word.startsWith(partialTranslit)) {
          addSuggestion(word, 60);
        }
      });
    }
  }
  
  // Sort by priority (highest first) and return top 8
  const sortedSuggestions = suggestions
    .sort((a, b) => b.priority - a.priority)
    .map(s => s.word)
    .slice(0, 8);
  
  return sortedSuggestions;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { transliterateToTamil, getTamilSuggestionsFromEnglish };
}
