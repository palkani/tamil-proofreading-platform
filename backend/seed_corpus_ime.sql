-- Seed corpus_words table with common Tamil words for IME suggestions
-- This enables corpus-first architecture for better transliteration quality

-- Ensure tables exist
CREATE TABLE IF NOT EXISTS corpus_words (
    id SERIAL PRIMARY KEY,
    latin_equivalent TEXT NOT NULL,
    tamil_word TEXT NOT NULL,
    frequency INT DEFAULT 0,
    mode TEXT DEFAULT 'spoken',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corpus_phrases (
    id SERIAL PRIMARY KEY,
    latin_equivalent TEXT NOT NULL,
    tamil_phrase TEXT NOT NULL,
    frequency INT DEFAULT 0,
    mode TEXT DEFAULT 'spoken',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_corpus_words_latin ON corpus_words(LOWER(latin_equivalent));
CREATE INDEX IF NOT EXISTS idx_corpus_words_mode ON corpus_words(mode);
CREATE INDEX IF NOT EXISTS idx_corpus_words_freq ON corpus_words(frequency DESC);

CREATE INDEX IF NOT EXISTS idx_corpus_phrases_latin ON corpus_phrases(LOWER(latin_equivalent));
CREATE INDEX IF NOT EXISTS idx_corpus_phrases_mode ON corpus_phrases(mode);
CREATE INDEX IF NOT EXISTS idx_corpus_phrases_freq ON corpus_phrases(frequency DESC);

-- Clear existing data (for fresh seed)
TRUNCATE TABLE corpus_words CASCADE;
TRUNCATE TABLE corpus_phrases CASCADE;

-- ========== COMMON TAMIL WORDS ==========

-- Greetings and basic words (high frequency)
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('vanakkam', 'வணக்கம்', 10000, 'all'),
    ('nandri', 'நன்றி', 8000, 'all'),
    ('nalvaazhthu', 'நல்வாழ்த்து', 5000, 'all'),
    ('poitu varen', 'போய்ட்டு வரேன்', 3000, 'spoken'),
    ('seri', 'சரி', 7000, 'all'),
    ('illa', 'இல்ல', 6000, 'spoken'),
    ('illai', 'இல்லை', 6000, 'formal');

-- Question words
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('enna', 'என்ன', 8000, 'all'),
    ('yaar', 'யார்', 7000, 'all'),
    ('yaaru', 'யாரு', 7000, 'spoken'),
    ('enga', 'எங்க', 6000, 'spoken'),
    ('engae', 'எங்கே', 6000, 'formal'),
    ('eppadi', 'எப்படி', 8000, 'all'),
    ('eppo', 'எப்போ', 5000, 'spoken'),
    ('eppothu', 'எப்போது', 5000, 'formal'),
    ('yen', 'ஏன்', 7000, 'all'),
    ('yethanai', 'எத்தனை', 5000, 'formal'),
    ('ethana', 'எத்தன', 5000, 'spoken');

-- Pronouns
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('naan', 'நான்', 9000, 'all'),
    ('naanga', 'நாங்க', 7000, 'spoken'),
    ('naangal', 'நாங்கள்', 7000, 'formal'),
    ('nee', 'நீ', 8000, 'all'),
    ('neenga', 'நீங்க', 7000, 'spoken'),
    ('neengal', 'நீங்கள்', 7000, 'formal'),
    ('avan', 'அவன்', 6000, 'all'),
    ('aval', 'அவள்', 6000, 'all'),
    ('avar', 'அவர்', 7000, 'all'),
    ('avanga', 'அவங்க', 6000, 'spoken'),
    ('avargal', 'அவர்கள்', 6000, 'formal'),
    ('ithu', 'இது', 7000, 'all'),
    ('athu', 'அது', 7000, 'all');

-- Common verbs
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('vara', 'வர', 6000, 'all'),
    ('poga', 'போக', 6000, 'all'),
    ('saapida', 'சாப்பிட', 5000, 'all'),
    ('kudika', 'குடிக்க', 4000, 'all'),
    ('paakka', 'பாக்க', 5000, 'spoken'),
    ('parka', 'பார்க்க', 5000, 'formal'),
    ('solla', 'சொல்ல', 6000, 'all'),
    ('seiya', 'செய்ய', 6000, 'all'),
    ('padika', 'படிக்க', 5000, 'all'),
    ('yezhuda', 'எழுத', 4000, 'all'),
    ('kelka', 'கேக்க', 5000, 'spoken'),
    ('kekka', 'கேட்க', 5000, 'formal'),
    ('iruka', 'இருக்க', 7000, 'all'),
    ('aaga', 'ஆக', 5000, 'all');

-- Food related
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('soru', 'சோறு', 5000, 'all'),
    ('saaru', 'சாறு', 3000, 'all'),
    ('rasam', 'ரசம்', 4000, 'all'),
    ('sambar', 'சாம்பார்', 4000, 'all'),
    ('dosai', 'தோசை', 4000, 'all'),
    ('idli', 'இட்லி', 4000, 'all'),
    ('pongal', 'பொங்கல்', 3000, 'all'),
    ('vadai', 'வடை', 3000, 'all'),
    ('payasam', 'பாயசம்', 2000, 'all'),
    ('theneer', 'தண்ணீர்', 5000, 'all'),
    ('thanni', 'தண்ணி', 5000, 'spoken'),
    ('paalu', 'பாலு', 4000, 'spoken'),
    ('paal', 'பால்', 4000, 'formal'),
    ('kaapi', 'காபி', 5000, 'all'),
    ('thee', 'தேநீர்', 4000, 'formal'),
    ('tea', 'டீ', 4000, 'spoken');

-- Numbers
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('onru', 'ஒன்று', 6000, 'all'),
    ('rendu', 'ரெண்டு', 6000, 'spoken'),
    ('irandu', 'இரண்டு', 6000, 'formal'),
    ('moonu', 'மூணு', 5000, 'spoken'),
    ('moonru', 'மூன்று', 5000, 'formal'),
    ('naalu', 'நாலு', 5000, 'spoken'),
    ('naangu', 'நான்கு', 5000, 'formal'),
    ('anju', 'ஐஞ்சு', 4000, 'spoken'),
    ('ainthu', 'ஐந்து', 4000, 'formal');

-- Time related
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('indru', 'இன்று', 6000, 'formal'),
    ('inniki', 'இன்னிக்கி', 6000, 'spoken'),
    ('naalai', 'நாளை', 5000, 'formal'),
    ('naalaikku', 'நாளைக்கு', 5000, 'spoken'),
    ('netru', 'நேற்று', 5000, 'formal'),
    ('netthu', 'நேத்து', 5000, 'spoken'),
    ('kaalai', 'காலை', 5000, 'all'),
    ('madhiyam', 'மத்தியானம்', 4000, 'formal'),
    ('madhyanam', 'மத்தியானம்', 4000, 'spoken'),
    ('maalai', 'மாலை', 5000, 'all'),
    ('iravu', 'இரவு', 5000, 'all');

-- Family
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('appa', 'அப்பா', 8000, 'all'),
    ('amma', 'அம்மா', 8000, 'all'),
    ('anna', 'அண்ணா', 6000, 'all'),
    ('akka', 'அக்கா', 6000, 'all'),
    ('thambi', 'தம்பி', 5000, 'all'),
    ('thangai', 'தங்கை', 5000, 'all'),
    ('paati', 'பாட்டி', 4000, 'all'),
    ('thatha', 'தாத்தா', 4000, 'all');

-- Specific word fixes (user reported issues)
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('saptiya', 'சப்தியா', 3000, 'all'),
    ('saptiyaa', 'சப்தியா', 3000, 'all');

-- Common words from user feedback
INSERT INTO corpus_words (latin_equivalent, tamil_word, frequency, mode) VALUES
    ('enathu', 'எனது', 5000, 'all'),
    ('enadu', 'எனது', 5000, 'spoken'),
    ('en', 'என்', 7000, 'all'),
    ('ena', 'என', 6000, 'all'),
    ('enbathu', 'என்பது', 4000, 'formal');

-- ========== COMMON TAMIL PHRASES ==========

INSERT INTO corpus_phrases (latin_equivalent, tamil_phrase, frequency, mode) VALUES
    ('vanakkam eppadi irukinga', 'வணக்கம் எப்படி இருக்கிங்க', 5000, 'spoken'),
    ('vanakkam eppadi irukkiraerga', 'வணக்கம் எப்படி இருக்கிறீர்கள்', 5000, 'formal'),
    ('nalama irukken', 'நல்லா இருக்கேன்', 4000, 'spoken'),
    ('nandri romba nandri', 'நன்றி ரொம்ப நன்றி', 4000, 'all'),
    ('poitu varen', 'போய்ட்டு வரேன்', 4000, 'spoken'),
    ('seri paakalam', 'சரி பாக்கலாம்', 3000, 'spoken'),
    ('enna achu', 'என்ன ஆச்சு', 4000, 'spoken'),
    ('enna aachu', 'என்ன ஆச்சு', 4000, 'spoken'),
    ('enna aayitru', 'என்ன ஆயிற்று', 4000, 'formal'),
    ('pona vaaram', 'போன வாரம்', 3000, 'all'),
    ('antha vaaram', 'அந்த வாரம்', 3000, 'all'),
    ('indha vaaram', 'இந்த வாரம்', 3000, 'all'),
    ('en peyar', 'என் பெயர்', 4000, 'all'),
    ('unga peyar enna', 'உங்க பெயர் என்ன', 3000, 'spoken'),
    ('ungal peyar enna', 'உங்கள் பெயர் என்ன', 3000, 'formal');

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Corpus seeding completed successfully!';
    RAISE NOTICE 'Total words seeded: %', (SELECT COUNT(*) FROM corpus_words);
    RAISE NOTICE 'Total phrases seeded: %', (SELECT COUNT(*) FROM corpus_phrases);
END $$;
