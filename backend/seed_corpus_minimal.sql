-- Tamil Corpus Seed Data - Direct SQL Insert
-- Run this in Cloud SQL console or via: psql $DATABASE_URL -f seed_corpus_minimal.sql
-- This is a minimal starter set to get the corpus working immediately

\echo '🔧 Seeding Tamil corpus tables...'
\echo ''

-- Check current counts
\echo 'Current counts:'
SELECT 'tamil_words' as table_name, COUNT(*) as count FROM tamil_words
UNION ALL
SELECT 'tamil_phrases', COUNT(*) FROM tamil_phrases
UNION ALL
SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams;

\echo ''
\echo 'Inserting seed data...'

-- Essential Tamil words (30 most common + problematic words)
INSERT INTO tamil_words (tamil_text, transliteration, alternate_spellings, frequency, category, source, user_confirmed, is_verified)
VALUES 
    -- Problematic words that were reported
    ('அம்மா', 'amma', '[]', 2500, 'kinship', 'seed', 0, true),
    ('படிச்சியா', 'padichiya', '["padichchiya","padiththiya"]', 1900, 'verb', 'seed', 0, true),
    ('சோறு', 'soru', '["choru"]', 2200, 'food', 'seed', 0, true),
    ('நண்பன்', 'nanban', '["nanba","nanbaa"]', 2300, 'common', 'seed', 0, true),
    ('சாப்பாடு', 'saappadu', '["sapadu","chaapadu"]', 2150, 'food', 'seed', 0, true),
    
    -- Common kinship
    ('அப்பா', 'appa', '[]', 2400, 'kinship', 'seed', 0, true),
    ('அண்ணா', 'annaa', '[]', 2300, 'kinship', 'seed', 0, true),
    ('அக்கா', 'akkaa', '[]', 2200, 'kinship', 'seed', 0, true),
    
    -- Common verbs
    ('படிக்க', 'padikka', '[]', 2000, 'verb', 'seed', 0, true),
    ('படித்தேன்', 'padiththen', '["padichen"]', 1800, 'verb', 'seed', 0, true),
    ('படிச்சேன்', 'padichaen', '["padichen"]', 1750, 'verb', 'seed', 0, true),
    ('வா', 'vaa', '[]', 2200, 'verb', 'seed', 0, true),
    ('வந்தேன்', 'vanththen', '["vanthen"]', 2000, 'verb', 'seed', 0, true),
    ('போ', 'po', '[]', 2100, 'verb', 'seed', 0, true),
    ('போனேன்', 'ponen', '[]', 1950, 'verb', 'seed', 0, true),
    ('சாப்பிட', 'saappida', '["sapida"]', 2000, 'verb', 'seed', 0, true),
    ('சாப்பிட்டேன்', 'saappittaen', '["sapittaen"]', 1800, 'verb', 'seed', 0, true),
    
    -- Common nouns
    ('தமிழ்', 'thamizh', '["tamil"]', 2500, 'common', 'seed', 0, true),
    ('மொழி', 'mozhi', '["moli"]', 2150, 'common', 'seed', 0, true),
    ('வீடு', 'veedu', '[]', 2400, 'common', 'seed', 0, true),
    ('பள்ளி', 'palli', '[]', 2300, 'common', 'seed', 0, true),
    
    -- Question words
    ('என்ன', 'enna', '[]', 2600, 'question', 'seed', 0, true),
    ('எப்படி', 'eppadi', '[]', 2500, 'question', 'seed', 0, true),
    ('எங்கே', 'engae', '["enga"]', 2300, 'question', 'seed', 0, true),
    
    -- Pronouns
    ('நான்', 'naan', '["nan"]', 2800, 'pronoun', 'seed', 0, true),
    ('நீ', 'nee', '[]', 2700, 'pronoun', 'seed', 0, true),
    
    -- Greetings
    ('வணக்கம்', 'vanakkam', '[]', 2500, 'greeting', 'seed', 0, true),
    ('நன்றி', 'nandri', '["nanri"]', 2450, 'greeting', 'seed', 0, true),
    
    -- Time
    ('இன்று', 'indru', '[]', 2400, 'time', 'seed', 0, true),
    ('நேற்று', 'netru', '[]', 2300, 'time', 'seed', 0, true)
ON CONFLICT (transliteration) 
DO UPDATE SET 
    frequency = GREATEST(tamil_words.frequency, EXCLUDED.frequency),
    updated_at = NOW();

-- Essential phrases
INSERT INTO tamil_phrases (phrase, frequency)
VALUES 
    ('எப்படி இருக்கீங்க', 1450),
    ('என்ன செய்யறீங்க', 1300),
    ('வீட்டுக்கு போ', 1200),
    ('பள்ளிக்கு போ', 1180),
    ('சாப்பாடு சாப்பிட்டீங்களா', 1300),
    ('எனக்கு தெரியும்', 1400),
    ('எனக்கு தெரியாது', 1450),
    ('என் பெயர்', 1500),
    ('உங்கள் பெயர்', 1450),
    ('தமிழ் படிக்க', 1300)
ON CONFLICT (phrase) 
DO UPDATE SET 
    frequency = GREATEST(tamil_phrases.frequency, EXCLUDED.frequency),
    updated_at = NOW();

-- Essential bigrams (context patterns)
INSERT INTO tamil_bigrams (word, next_word, frequency)
VALUES 
    ('நான்', 'வர', 1800),
    ('நான்', 'போ', 1750),
    ('நான்', 'படிக்க', 1700),
    ('என்ன', 'செய்யறீங்க', 1700),
    ('எப்படி', 'இருக்கிறீர்கள்', 1650),
    ('எங்கே', 'போகிறீர்கள்', 1600),
    ('அம்மா', 'வந்தாள்', 1500),
    ('வீட்டுக்கு', 'போ', 1600),
    ('பள்ளிக்கு', 'போ', 1550),
    ('தமிழ்', 'படிக்கிறேன்', 1400)
ON CONFLICT (word, next_word) 
DO UPDATE SET 
    frequency = GREATEST(tamil_bigrams.frequency, EXCLUDED.frequency),
    updated_at = NOW();

\echo ''
\echo '✅ Seed data inserted!'
\echo ''
\echo 'Updated counts:'
SELECT 'tamil_words' as table_name, COUNT(*) as count FROM tamil_words
UNION ALL
SELECT 'tamil_phrases', COUNT(*) FROM tamil_phrases
UNION ALL
SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams;

\echo ''
\echo '✅ Corpus seeding complete!'
\echo ''
\echo 'Sample words:'
SELECT tamil_text, transliteration, frequency FROM tamil_words WHERE source = 'seed' ORDER BY frequency DESC LIMIT 10;
