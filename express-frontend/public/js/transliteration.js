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
  'th': { primary: 'த', variants: ['த'] },
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

// Legacy single-mapping consonant table — DERIVED from tamilConsonantMap so
// we don't drift. Previous hand-maintained version was missing loanword
// consonants (s, j, g, b, d, w, z, h, f, sh) which made transliterateToTamil
// silently drop those letters — e.g. "selvam" became "எலவம்" because the 's'
// was skipped. It also had a duplicate 'n' key where the second 'n':'ன'
// overwrote the first 'n':'ந', so 'n' always mapped to ன instead of ந.
const tamilConsonants = Object.fromEntries(
  Object.entries(tamilConsonantMap).map(([k, v]) => [k, v.primary])
);

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
  'cold': 'குளிர்',
  
  // Titles & Honorifics
  'raja': 'ராஜா',
  'king': 'அரசன்',
  'arasan': 'அரசன்',
  'rani': 'ராணி',
  'queen': 'அரசி',
  'arasi': 'அரசி',
  'thalaivar': 'தலைவர்',
  'leader': 'தலைவர்',
  'sir': 'ஐயா',
  'aiyaa': 'ஐயா',
  'madam': 'அம்மா',
  'thalaivi': 'தலைவி',
  
  // Common Names & Words
  'raman': 'ராமன்',
  'krishnan': 'கிருஷ்ணன்',
  'murugan': 'முருகன்',
  'vinayagar': 'விநாயகர்',
  'sivan': 'சிவன்',
  'lakshmi': 'லட்சுமி',
  'saraswathi': 'சரஸ்வதி',
  'durga': 'துர்கா',
  
  // More Common Words
  'vallu': 'வாழ்',
  'live': 'வாழ்',
  'vaazhkai': 'வாழ்க்கை',
  'life': 'வாழ்க்கை',
  'maranam': 'மரணம்',
  'death': 'மரணம்',
  'pirappu': 'பிறப்பு',
  'birth': 'பிறப்பு',
  'kalyanam': 'கல்யாணம்',
  'marriage': 'கல்யாணம',
  'thirumanam': 'திருமணம்',
  'wedding': 'திருமணம்',

  // ── Possessives & Pronouns (commonly typed in English) ──────────────────
  'enath':   'எனது',
  'enathu':  'எனது',
  'enadu':   'எனது',
  'ennoda':  'என்னோட',
  'enakku':  'எனக்கு',
  'unakku':  'உனக்கு',
  'unaku':   'உனக்கு',
  'ungal':   'உங்கள்',
  'unkal':   'உங்கள்',
  'ungaluku':'உங்களுக்கு',
  'nammal':  'நாம்',
  'namma':   'நம்ம',
  'naanga':  'நாங்க',
  'avanga':  'அவங்க',
  'ivan':    'இவன்',
  'ival':    'இவள்',
  'ivar':    'இவர்',

  // ── Grammar connectors ───────────────────────────────────────────────────
  'enave':   'எனவே',
  'aanal':   'ஆனால்',
  'aana':    'ஆனா',
  'athanal': 'அதனால்',
  'aaganave':'ஆகவே',
  'matrum':  'மற்றும்',
  'allatu':  'அல்லது',
  'alladu':  'அல்லது',
  'aanal':   'ஆனால்',
  'podhu':   'பொது',
  'patri':   'பற்றி',
  'pathu':   'பத்து',

  // ── Common response words ─────────────────────────────────────────────────
  'sari':    'சரி',
  'illai':   'இல்லை',
  'illa':    'இல்ல',
  'aam':     'ஆமாம்',
  'aamam':   'ஆமாம்',
  'ille':    'இல்லே',

  // ── Auxiliaries / modal verbs ─────────────────────────────────────────────
  'vendum':     'வேண்டும்',
  'vendam':     'வேண்டாம்',
  'mudiyum':    'முடியும்',
  'mudiyathu':  'முடியாது',
  'theriyum':   'தெரியும்',
  'theriyathu': 'தெரியாது',
  'theruma':    'தெரியுமா',
  'pidikkum':   'பிடிக்கும்',

  // ── Colloquial verb forms ──────────────────────────────────────────────────
  'paaru':   'பாரு',
  'paarum':  'பாருங்க',
  'vanga':   'வாங்க',
  'ponga':   'போங்க',
  'solunga': 'சொல்லுங்க',
  'kelunga': 'கேளுங்க',
  'parunga': 'பாருங்க',
  'kudunga': 'குடுங்க',
  'kudu':    'குடு',
  'thaa':    'தா',
  'thaango': 'தாங்க',

  // ── Place / direction words ────────────────────────────────────────────────
  'mela':    'மேல',
  'kizha':   'கீழ',
  'munna':   'முன்ன',
  'pinna':   'பின்ன',
  'vela':    'வெளி',
  'ulle':    'உள்ள',

  // ── Commonly missed words ──────────────────────────────────────────────────
  'ithu':    'இது',
  'athu':    'அது',
  'inga':    'இங்க',
  'anga':    'அங்க',
  'epdi':    'எப்படி',
  'eppo':    'எப்போ',
  'enga':    'எங்க',
  'yenna':   'என்ன',
  'yenakku': 'எனக்கு',
  'romba':   'ரொம்ப',
  'semma':   'சேம்மா',
  'super':   'சூப்பர்',
  'nandri':  'நன்றி',

  // ── Time words (நேரம் family) ─────────────────────────────────────────────
  'neram':     'நேரம்',
  'neramum':   'நேரமும்',
  'neratil':   'நேரத்தில்',
  'nerathil':  'நேரத்தில்',
  'nerathile':  'நேரத்திலே',
  'neramaana': 'நேரமான',
  'neramilla': 'நேரமில்ல',
  'naeram':    'நேரம்',
  'naeramum':  'நேரமும்',
  'pozhuthu':  'பொழுது',
  'pozhudhum': 'பொழுதும்',
  'vaelai':    'வேளை',
  'samayam':   'சமயம்',
  'nattu':     'நாட்டு',
  'natkal':    'நாட்கள்',

  // ── More common words ─────────────────────────────────────────────────────
  'mudhal':    'முதல்',
  'kadaisi':   'கடைசி',
  'mudivil':   'முடிவில்',
  'mudive':    'முடிவே',
  'ellam':     'எல்லாம்',
  'ellorum':   'எல்லோரும்',
  'anaivarum': 'அனைவரும்',
  'engum':     'எங்கும்',
  'enpatum':   'என்பதும்',
  'enbathu':   'என்பது',
  'athanal':   'அதனால்',
  'aaganaal':  'ஆகவே',
  'meelum':    'மேலும்',
  'konjam':    'கொஞ்சம்',
  'konjamum':  'கொஞ்சமும்',
  'thirumba':  'திரும்ப',
  'thirumbavum':'திரும்பவும்',
  'marupadi':  'மறுபடி',
  'parvai':    'பார்வை'
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

  // Character-by-character transliteration with consonant-context tracking.
  // When a vowel immediately follows a consonant, use the vowel SIGN (matra)
  // rather than the standalone vowel letter — e.g. "uyi" → "உயி" (not "உயஇ").
  let result = '';
  let i = 0;
  let lastWasConsonant = false;

  while (i < lower.length) {
    let matched = false;

    // Try to match longer sequences first (2-3 chars)
    for (let len = 3; len >= 1; len--) {
      const substr = lower.substring(i, i + len);

      // Check for consonant combinations
      if (tamilConsonants[substr]) {
        // Tamil rule: when a consonant is immediately followed by another
        // consonant (no vowel between), the first one carries a pulli so it
        // is read with no inherent vowel — e.g. "செல்வம்" not "செலவம்",
        // "வணக்கம்" not "வணககம்". Add the pulli BEFORE writing the new
        // consonant.
        if (lastWasConsonant) {
          result += '்';
        }
        result += tamilConsonants[substr];
        lastWasConsonant = true;
        i += len;
        matched = true;
        break;
      }

      // Check for vowels
      if (tamilVowels[substr]) {
        if (lastWasConsonant) {
          // After a consonant: use the vowel sign (matra) so the syllable is
          // formed correctly — "கி" not "கஇ", "உயி" not "உயஇ".
          const sign = tamilVowelSigns[substr];
          result += (sign !== undefined) ? sign : tamilVowels[substr];
        } else {
          result += tamilVowels[substr];
        }
        lastWasConsonant = false;
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      lastWasConsonant = false;
      i++;
    }
  }

  // Tamil linguistic rule: a word-final consonant has no following vowel, so it
  // must carry a pulli (virama ்). Without it the consonant is read with an inherent
  // 'a' — e.g. "உயிர" reads as "uyira", but the correct word is "உயிர்" ("uyir").
  // This applies to ANY word ending in a consonant, not just specific words.
  if (lastWasConsonant && result.length > 0) {
    result += '்'; // U+0BCD Tamil virama (pulli)
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
  
  // Tamil linguistic rule: these consonants CANNOT start a word.
  // ன் (alveolar n) and ண் (retroflex n) appear only mid/end-of-word.
  // ற் (alveolar r), ள் (retroflex l), ழ் (retroflex zh) are also word-medial/final only.
  const wordInitialForbidden = new Set(['ன', 'ண', 'ற', 'ள', 'ழ']);

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

    const isWordInitial = current.length === 0;

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
          let consVariants = consonantData.variants.slice(0, 2);
          // At word start, remove consonants that cannot begin a Tamil word
          if (isWordInitial) {
            consVariants = consVariants.filter(c => !wordInitialForbidden.has(c));
          }
          consVariants.forEach(cons => {
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
        let consVariants = consonantData.variants.slice(0, 1);
        if (isWordInitial) {
          consVariants = consVariants.filter(c => !wordInitialForbidden.has(c));
        }
        consVariants.forEach(cons => {
          const nextPos = position + cLen;

          // Add pulli when:
          // (a) consonant is followed by another consonant — e.g. "த்" in "த்மிழ்"
          // (b) consonant is at word end — e.g. "ர்" in "உயிர்", "ல்" in "பாடல்"
          // Without pulli a word-final consonant gains a ghost inherent 'a' vowel.
          const isFollowedByConsonant = nextPos < input.length &&
            (tamilConsonantMap[input[nextPos]] ||
             tamilConsonantMap[input.substring(nextPos, nextPos + 2)]);
          const isWordEnd = nextPos >= input.length;

          const syllable = (isFollowedByConsonant || isWordEnd) ? (cons + '்') : cons;
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
  
  // Interleave long-vowel variants immediately after each short-vowel form.
  // This ensures நேரமும் (long ே) appears right after நெரமும் (short ெ),
  // giving realistic Tamil words a chance to rank near the top.
  const seen = new Set();
  const withLengthVariants = [];

  allVariants.forEach(variant => {
    if (!seen.has(variant)) {
      seen.add(variant);
      withLengthVariants.push(variant);
    }

    // Immediately follow each short-vowel form with its long-vowel counterpart
    if (variant.includes('ெ')) {
      const long = variant.replace(/ெ/g, 'ே');
      if (!seen.has(long) && withLengthVariants.length < 8) {
        seen.add(long);
        withLengthVariants.push(long);
      }
    }
    if (variant.includes('ொ')) {
      const long = variant.replace(/ொ/g, 'ோ');
      if (!seen.has(long) && withLengthVariants.length < 8) {
        seen.add(long);
        withLengthVariants.push(long);
      }
    }
  });

  // Return top 6 unique variants
  return withLengthVariants.slice(0, 6);
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
  
  // 2. DIRECT TRANSLITERATION of the exact input — highest phonetic relevance.
  // Placed before prefix/variant lookups so it always wins over longer words that
  // merely *start with* the same English token (e.g. "uyir" → "உயிர்" should rank
  // above "uyirchatham" → "உயிர்ச்சதம்").
  const transliterated = transliterateToTamil(lower);
  const wordList = Array.isArray(tamilWords) ? tamilWords
    : (typeof window !== 'undefined' && Array.isArray(window.tamilDictionary) ? window.tamilDictionary : []);

  if (transliterated && transliterated !== lower) {
    addSuggestion(transliterated, 96); // 2nd only to exact commonWordMap hit (100)
  }

  // 3. PHONETIC VARIANTS: Generate multiple Tamil variations (Google Input Tools style)
  const phoneticVariants = generateTamilVariants(lower);
  phoneticVariants.forEach(variant => {
    addSuggestion(variant, 88);
  });

  // 4. Prefix matches in common word map — keys longer than the input (lower relevance than direct match)
  Object.keys(commonWordMap).forEach(key => {
    if (key.startsWith(lower) && key !== lower) {
      addSuggestion(commonWordMap[key], 78);
    }
  });

  // 5. Contains match in common word map
  Object.keys(commonWordMap).forEach(key => {
    if (key.includes(lower) && !key.startsWith(lower)) {
      addSuggestion(commonWordMap[key], 68);
    }
  });

  // 6. Dictionary words that start with the direct transliteration
  if (transliterated && transliterated !== lower) {
    wordList.forEach(word => {
      if (word.startsWith(transliterated) && word !== transliterated) {
        addSuggestion(word, 62);
      }
    });
  }

  // 7. Partial transliteration prefix fallback — only when we need more suggestions.
  // Use at least 65% of the input (min 4 chars) so the Tamil prefix is specific enough.
  // Require the Tamil result to be ≥ 3 chars to avoid matching a single consonant
  // (e.g. 'tha' → 'த' would flood results with every த-starting word).
  if (suggestions.length < 5 && lower.length >= 3) {
    const prefixLen = Math.min(lower.length, Math.max(4, Math.ceil(lower.length * 0.65)));
    const partialTranslit = transliterateToTamil(lower.substring(0, prefixLen));
    if (partialTranslit && partialTranslit.length >= 3 &&
        partialTranslit !== lower.substring(0, prefixLen)) {
      let step7Added = 0;
      for (const word of wordList) {
        if (word.startsWith(partialTranslit)) {
          addSuggestion(word, 55);
          if (++step7Added >= 5) break; // cap at 5 to avoid flooding
        }
      }
    }
  }

  // Sort by priority (highest first) and return top 8
  const sortedSuggestions = suggestions
    .sort((a, b) => b.priority - a.priority)
    .map(s => s.word)
    .slice(0, 8);

  return sortedSuggestions;
}

// Expose to browser global scope so translit-suggest.js (V3) can call them
// without requiring a module bundler. Must come BEFORE module.exports so that
// both the browser build and any Node.js tests see the correct references.
if (typeof window !== 'undefined') {
  window.transliterateToTamil = transliterateToTamil;
  window.getTamilSuggestionsFromEnglish = getTamilSuggestionsFromEnglish;
}

// Export for use in other modules (Node / Jest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { transliterateToTamil, getTamilSuggestionsFromEnglish };
}
