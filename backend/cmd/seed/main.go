package main

import (
        "encoding/json"
        "log"
        "strings"

        "tamil-proofreading-platform/backend/internal/config"
        "tamil-proofreading-platform/backend/internal/models"

        "gorm.io/driver/postgres"
        "gorm.io/gorm"
)

type WordEntry struct {
        Tamil          string   `json:"tamil"`
        Transliteration string  `json:"transliteration"`
        Alternates      []string `json:"alternates"`
        Frequency       int      `json:"frequency"`
        Category        string   `json:"category"`
        Meaning         string   `json:"meaning"`
}

func main() {
        log.Println("Starting Tamil word database seeder...")

        // Load configuration
        cfg := config.Load()

        // Initialize database
        db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
        if err != nil {
                log.Fatal("Failed to connect to database:", err)
        }

        // Define comprehensive Tamil word list
        words := []WordEntry{
                // Very High Frequency Words (1000-900)
                {Tamil: "வணக்கம்", Transliteration: "vanakkam", Alternates: []string{"vanakam", "vaṇakkam"}, Frequency: 1000, Category: "common", Meaning: "hello, greetings"},
                {Tamil: "நன்றி", Transliteration: "nandri", Alternates: []string{"nanri", "naṉṟi"}, Frequency: 990, Category: "common", Meaning: "thank you"},
                {Tamil: "சரி", Transliteration: "sari", Alternates: []string{"chari"}, Frequency: 985, Category: "common", Meaning: "okay, correct"},
                {Tamil: "தமிழ்", Transliteration: "tamil", Alternates: []string{"thamizh", "tamizh"}, Frequency: 980, Category: "noun", Meaning: "Tamil language"},
                {Tamil: "நல்ல", Transliteration: "nalla", Alternates: []string{"nallla"}, Frequency: 975, Category: "adjective", Meaning: "good"},
                {Tamil: "இல்லை", Transliteration: "illai", Alternates: []string{"illae", "illē"}, Frequency: 970, Category: "common", Meaning: "no, not available"},
                {Tamil: "இருக்கிறது", Transliteration: "irukkradu", Alternates: []string{"irukkurathu", "irukkirathu"}, Frequency: 965, Category: "verb", Meaning: "is, exists"},
                {Tamil: "அது", Transliteration: "athu", Alternates: []string{"adhu"}, Frequency: 960, Category: "pronoun", Meaning: "that"},
                {Tamil: "இது", Transliteration: "idhu", Alternates: []string{"ithu"}, Frequency: 955, Category: "pronoun", Meaning: "this"},
                {Tamil: "வருகிறது", Transliteration: "varukiradu", Alternates: []string{"varugiradu", "varugirathu"}, Frequency: 950, Category: "verb", Meaning: "coming"},
                
                // Names & Titles (950-850)
                {Tamil: "ராஜா", Transliteration: "raja", Alternates: []string{"raaja", "rāja"}, Frequency: 945, Category: "proper_noun", Meaning: "king, ruler"},
                {Tamil: "அரசன்", Transliteration: "arasan", Alternates: []string{"arasann"}, Frequency: 940, Category: "noun", Meaning: "king"},
                {Tamil: "ராணி", Transliteration: "rani", Alternates: []string{"raani", "rāṇi"}, Frequency: 935, Category: "proper_noun", Meaning: "queen"},
                {Tamil: "அரசி", Transliteration: "arasi", Alternates: []string{"arasī"}, Frequency: 930, Category: "noun", Meaning: "queen"},
                {Tamil: "தலைவர்", Transliteration: "thalaivar", Alternates: []string{"talaivar", "talēvar"}, Frequency: 925, Category: "noun", Meaning: "leader"},
                {Tamil: "அம்மா", Transliteration: "amma", Alternates: []string{"ammā"}, Frequency: 920, Category: "noun", Meaning: "mother"},
                {Tamil: "அப்பா", Transliteration: "appa", Alternates: []string{"appā"}, Frequency: 915, Category: "noun", Meaning: "father"},
                {Tamil: "அக்கா", Transliteration: "akka", Alternates: []string{"akkā"}, Frequency: 910, Category: "noun", Meaning: "elder sister"},
                {Tamil: "அண்ணா", Transliteration: "anna", Alternates: []string{"aṇṇā", "annā"}, Frequency: 905, Category: "noun", Meaning: "elder brother"},
                {Tamil: "தம்பி", Transliteration: "thambi", Alternates: []string{"tambi"}, Frequency: 900, Category: "noun", Meaning: "younger brother"},
                
                // Common Nouns (900-800)
                {Tamil: "நாள்", Transliteration: "naal", Alternates: []string{"nāl", "nal"}, Frequency: 895, Category: "noun", Meaning: "day"},
                {Tamil: "நேரம்", Transliteration: "neram", Alternates: []string{"nēram"}, Frequency: 890, Category: "noun", Meaning: "time"},
                {Tamil: "மனிதன்", Transliteration: "manithan", Alternates: []string{"manidhan"}, Frequency: 885, Category: "noun", Meaning: "human, man"},
                {Tamil: "பெண்", Transliteration: "pen", Alternates: []string{"peṇ"}, Frequency: 880, Category: "noun", Meaning: "woman, girl"},
                {Tamil: "ஆண்", Transliteration: "aan", Alternates: []string{"āṇ"}, Frequency: 875, Category: "noun", Meaning: "man, male"},
                {Tamil: "வீடு", Transliteration: "veedu", Alternates: []string{"vīṭu", "vedu"}, Frequency: 870, Category: "noun", Meaning: "house"},
                {Tamil: "ஊர்", Transliteration: "oor", Alternates: []string{"ūr"}, Frequency: 865, Category: "noun", Meaning: "town, village"},
                {Tamil: "நகரம்", Transliteration: "nakaram", Alternates: []string{"nagaram"}, Frequency: 860, Category: "noun", Meaning: "city"},
                {Tamil: "தெரு", Transliteration: "theru", Alternates: []string{"teru"}, Frequency: 855, Category: "noun", Meaning: "street"},
                {Tamil: "பள்ளி", Transliteration: "palli", Alternates: []string{"paḷḷi"}, Frequency: 850, Category: "noun", Meaning: "school"},
                
                // Nature & Environment (850-750)
                {Tamil: "தென்றல்", Transliteration: "thendral", Alternates: []string{"thenral", "tendral"}, Frequency: 845, Category: "noun", Meaning: "breeze"},
                {Tamil: "காற்று", Transliteration: "kaatru", Alternates: []string{"katru", "kāṟṟu"}, Frequency: 840, Category: "noun", Meaning: "wind"},
                {Tamil: "மழை", Transliteration: "mazhai", Alternates: []string{"maḻai"}, Frequency: 835, Category: "noun", Meaning: "rain"},
                {Tamil: "வானம்", Transliteration: "vaanam", Alternates: []string{"vāṉam", "vanam"}, Frequency: 830, Category: "noun", Meaning: "sky"},
                {Tamil: "கடல்", Transliteration: "kadal", Alternates: []string{"kaṭal"}, Frequency: 825, Category: "noun", Meaning: "sea, ocean"},
                {Tamil: "மலை", Transliteration: "malai", Alternates: []string{"mālai"}, Frequency: 820, Category: "noun", Meaning: "mountain"},
                {Tamil: "ஆறு", Transliteration: "aaru", Alternates: []string{"āṟu", "aaru6"}, Frequency: 815, Category: "noun", Meaning: "river"},
                {Tamil: "மரம்", Transliteration: "maram", Alternates: []string{"maram"}, Frequency: 810, Category: "noun", Meaning: "tree"},
                {Tamil: "மலர்", Transliteration: "malar", Alternates: []string{"mallar"}, Frequency: 805, Category: "noun", Meaning: "flower"},
                {Tamil: "புல்", Transliteration: "pul", Alternates: []string{"pull"}, Frequency: 800, Category: "noun", Meaning: "grass"},
                
                // Animals (800-750)
                {Tamil: "நாய்", Transliteration: "naai", Alternates: []string{"nāy", "nay"}, Frequency: 795, Category: "noun", Meaning: "dog"},
                {Tamil: "பூனை", Transliteration: "poonai", Alternates: []string{"pūṉai"}, Frequency: 790, Category: "noun", Meaning: "cat"},
                {Tamil: "பசு", Transliteration: "pasu", Alternates: []string{"pacu"}, Frequency: 785, Category: "noun", Meaning: "cow"},
                {Tamil: "மான்", Transliteration: "maan", Alternates: []string{"māṉ"}, Frequency: 780, Category: "noun", Meaning: "deer"},
                {Tamil: "யானை", Transliteration: "yaanai", Alternates: []string{"yānai", "yaanae"}, Frequency: 775, Category: "noun", Meaning: "elephant"},
                {Tamil: "குதிரை", Transliteration: "kuthirai", Alternates: []string{"kudirai"}, Frequency: 770, Category: "noun", Meaning: "horse"},
                {Tamil: "சிங்கம்", Transliteration: "singam", Alternates: []string{"simgam", "ciṅkam"}, Frequency: 765, Category: "noun", Meaning: "lion"},
                {Tamil: "புலி", Transliteration: "puli", Alternates: []string{"pullē"}, Frequency: 760, Category: "noun", Meaning: "tiger"},
                {Tamil: "குருவி", Transliteration: "kuruvi", Alternates: []string{"kuruvē"}, Frequency: 755, Category: "noun", Meaning: "sparrow, small bird"},
                {Tamil: "கோழி", Transliteration: "kozhi", Alternates: []string{"kōḻi", "kolzhi"}, Frequency: 750, Category: "noun", Meaning: "chicken"},
                
                // Food (750-700)
                {Tamil: "சாப்பாடு", Transliteration: "saappaadu", Alternates: []string{"sappadu", "cāppāṭu"}, Frequency: 745, Category: "noun", Meaning: "food"},
                {Tamil: "சோறு", Transliteration: "soru", Alternates: []string{"choru", "cōṟu"}, Frequency: 740, Category: "noun", Meaning: "cooked rice"},
                {Tamil: "சம்பா", Transliteration: "samba", Alternates: []string{"sampā", "champa"}, Frequency: 735, Category: "noun", Meaning: "samba rice variety"},
                {Tamil: "பாயசம்", Transliteration: "payasam", Alternates: []string{"pāyacam"}, Frequency: 730, Category: "noun", Meaning: "sweet pudding"},
                {Tamil: "இட்லி", Transliteration: "idli", Alternates: []string{"iṭli"}, Frequency: 725, Category: "noun", Meaning: "idli (steamed rice cake)"},
                {Tamil: "தோசை", Transliteration: "dosai", Alternates: []string{"thosai", "tōcai"}, Frequency: 720, Category: "noun", Meaning: "dosa (fermented crepe)"},
                {Tamil: "வடை", Transliteration: "vadai", Alternates: []string{"vaṭai", "vada"}, Frequency: 715, Category: "noun", Meaning: "vada (fried lentil cake)"},
                {Tamil: "பொங்கல்", Transliteration: "pongal", Alternates: []string{"poṅkal"}, Frequency: 710, Category: "noun", Meaning: "pongal (rice dish)"},
                {Tamil: "தயிர்", Transliteration: "thayir", Alternates: []string{"tayir", "tayiru"}, Frequency: 705, Category: "noun", Meaning: "curd, yogurt"},
                {Tamil: "பால்", Transliteration: "paal", Alternates: []string{"pāl", "pal"}, Frequency: 700, Category: "noun", Meaning: "milk"},
                
                // Colors (700-675)
                {Tamil: "சிவப்பு", Transliteration: "sivappu", Alternates: []string{"sivappu", "civappu"}, Frequency: 695, Category: "adjective", Meaning: "red"},
                {Tamil: "வெள்ளை", Transliteration: "vellai", Alternates: []string{"veḷḷai"}, Frequency: 690, Category: "adjective", Meaning: "white"},
                {Tamil: "கருப்பு", Transliteration: "karuppu", Alternates: []string{"karuppu"}, Frequency: 685, Category: "adjective", Meaning: "black"},
                {Tamil: "பச்சை", Transliteration: "pachai", Alternates: []string{"paccai", "paccē"}, Frequency: 680, Category: "adjective", Meaning: "green"},
                {Tamil: "நீலம்", Transliteration: "neelam", Alternates: []string{"nīlam"}, Frequency: 675, Category: "adjective", Meaning: "blue"},
                
                // Body Parts (675-650)
                {Tamil: "கண்", Transliteration: "kan", Alternates: []string{"kaṇ"}, Frequency: 670, Category: "noun", Meaning: "eye"},
                {Tamil: "கை", Transliteration: "kai", Alternates: []string{"kae"}, Frequency: 665, Category: "noun", Meaning: "hand"},
                {Tamil: "கால்", Transliteration: "kaal", Alternates: []string{"kāl"}, Frequency: 660, Category: "noun", Meaning: "leg, foot"},
                {Tamil: "தலை", Transliteration: "thalai", Alternates: []string{"talai"}, Frequency: 655, Category: "noun", Meaning: "head"},
                {Tamil: "வாய்", Transliteration: "vaai", Alternates: []string{"vāy"}, Frequency: 650, Category: "noun", Meaning: "mouth"},
                
                // Common Verbs (650-600)
                {Tamil: "செய்", Transliteration: "sei", Alternates: []string{"sey", "cey"}, Frequency: 645, Category: "verb", Meaning: "to do, make"},
                {Tamil: "போ", Transliteration: "po", Alternates: []string{"pō"}, Frequency: 640, Category: "verb", Meaning: "to go"},
                {Tamil: "வா", Transliteration: "va", Alternates: []string{"vā"}, Frequency: 635, Category: "verb", Meaning: "to come"},
                {Tamil: "சொல்", Transliteration: "sol", Alternates: []string{"coll", "col"}, Frequency: 630, Category: "verb", Meaning: "to say, tell"},
                {Tamil: "பார்", Transliteration: "paar", Alternates: []string{"pār"}, Frequency: 625, Category: "verb", Meaning: "to see, look"},
                {Tamil: "கேள்", Transliteration: "kel", Alternates: []string{"kēl", "kael"}, Frequency: 620, Category: "verb", Meaning: "to hear, listen"},
                {Tamil: "எழுது", Transliteration: "ezhuthu", Alternates: []string{"eluthu", "eḻutu"}, Frequency: 615, Category: "verb", Meaning: "to write"},
                {Tamil: "படி", Transliteration: "padi", Alternates: []string{"paṭi"}, Frequency: 610, Category: "verb", Meaning: "to read"},
                {Tamil: "சாப்பிடு", Transliteration: "saappidu", Alternates: []string{"sappidu"}, Frequency: 605, Category: "verb", Meaning: "to eat"},
                {Tamil: "குடி", Transliteration: "kudi", Alternates: []string{"kuṭi"}, Frequency: 600, Category: "verb", Meaning: "to drink"},
                
                // Deities (600-575)
                {Tamil: "முருகன்", Transliteration: "murugan", Alternates: []string{"murukaṉ"}, Frequency: 595, Category: "proper_noun", Meaning: "Lord Murugan"},
                {Tamil: "விநாயகர்", Transliteration: "vinayagar", Alternates: []string{"vināyakar", "vinayakar"}, Frequency: 590, Category: "proper_noun", Meaning: "Lord Ganesha"},
                {Tamil: "சிவன்", Transliteration: "sivan", Alternates: []string{"civaṉ", "shivan"}, Frequency: 585, Category: "proper_noun", Meaning: "Lord Shiva"},
                {Tamil: "பார்வதி", Transliteration: "parvathi", Alternates: []string{"pārvatī"}, Frequency: 580, Category: "proper_noun", Meaning: "Goddess Parvati"},
                {Tamil: "லட்சுமி", Transliteration: "lakshmi", Alternates: []string{"latchumi", "lakṣmī"}, Frequency: 575, Category: "proper_noun", Meaning: "Goddess Lakshmi"},
                
                // Places (575-550)
                {Tamil: "கோயில்", Transliteration: "koil", Alternates: []string{"kōyil", "kovil"}, Frequency: 570, Category: "noun", Meaning: "temple"},
                {Tamil: "சந்தை", Transliteration: "sandhai", Alternates: []string{"cantai"}, Frequency: 565, Category: "noun", Meaning: "market"},
                {Tamil: "பண்ணை", Transliteration: "pannai", Alternates: []string{"paṇṇai"}, Frequency: 560, Category: "noun", Meaning: "farm"},
                {Tamil: "மருத்துவமனை", Transliteration: "maruthuvamanai", Alternates: []string{"maruththuvamanai"}, Frequency: 555, Category: "noun", Meaning: "hospital"},
                {Tamil: "பூங்கா", Transliteration: "poongaa", Alternates: []string{"pūṅkā"}, Frequency: 550, Category: "noun", Meaning: "park, garden"},
                
                // Transportation (550-525)
                {Tamil: "பேருந்து", Transliteration: "perundhu", Alternates: []string{"pēruntu", "bus"}, Frequency: 545, Category: "noun", Meaning: "bus"},
                {Tamil: "ரயில்", Transliteration: "rail", Alternates: []string{"rayil", "train"}, Frequency: 540, Category: "noun", Meaning: "train"},
                {Tamil: "கார்", Transliteration: "car", Alternates: []string{"kār", "carr"}, Frequency: 535, Category: "noun", Meaning: "car"},
                {Tamil: "மோட்டார்", Transliteration: "mottar", Alternates: []string{"mōṭṭār", "motor"}, Frequency: 530, Category: "noun", Meaning: "motor, motorcycle"},
                {Tamil: "விமானம்", Transliteration: "vimanam", Alternates: []string{"vimāṉam", "vimaanam"}, Frequency: 525, Category: "noun", Meaning: "airplane"},
                
                // Emotions (525-500)
                {Tamil: "சந்தோஷம்", Transliteration: "santhosham", Alternates: []string{"cantōṣam", "sandhosham"}, Frequency: 520, Category: "noun", Meaning: "happiness, joy"},
                {Tamil: "கோபம்", Transliteration: "kobam", Alternates: []string{"kōpam", "gopam"}, Frequency: 515, Category: "noun", Meaning: "anger"},
                {Tamil: "அன்பு", Transliteration: "anbu", Alternates: []string{"aṉpu", "anbhu"}, Frequency: 510, Category: "noun", Meaning: "love"},
                {Tamil: "துக்கம்", Transliteration: "thukkam", Alternates: []string{"tukkam"}, Frequency: 505, Category: "noun", Meaning: "sorrow, sadness"},
                {Tamil: "பயம்", Transliteration: "bayam", Alternates: []string{"payam"}, Frequency: 500, Category: "noun", Meaning: "fear"},
        }

        log.Printf("Seeding %d Tamil words...", len(words))

        successCount := 0
        skipCount := 0

        for _, entry := range words {
                // Check if word already exists
                var existing models.TamilWord
                result := db.Where("transliteration = ?", strings.ToLower(entry.Transliteration)).First(&existing)
                
                if result.Error == nil {
                        // Word exists, skip
                        skipCount++
                        continue
                }

                // Prepare alternate spellings as JSON
                alternates := ""
                if len(entry.Alternates) > 0 {
                        jsonBytes, _ := json.Marshal(entry.Alternates)
                        alternates = string(jsonBytes)
                }

                // Create new word
                word := models.TamilWord{
                        TamilText:          entry.Tamil,
                        Transliteration:    strings.ToLower(entry.Transliteration),
                        AlternateSpellings: alternates,
                        Frequency:          entry.Frequency,
                        Category:           models.WordCategory(entry.Category),
                        Meaning:            entry.Meaning,
                        Source:             "manual_seed",
                        IsVerified:         true,
                }

                if err := db.Create(&word).Error; err != nil {
                        log.Printf("Error creating word '%s': %v", entry.Transliteration, err)
                        continue
                }

                successCount++
        }

        log.Printf("Seeding complete! Successfully added: %d, Skipped (already exists): %d", successCount, skipCount)
}
