-- Direct SQL corpus population script
-- Run this if you have direct psql access to your database
-- Usage: psql $DATABASE_URL -f seed_corpus_direct.sql

\echo 'Starting corpus population...'
\echo ''

-- Check if tables exist
\echo 'Checking tables...'
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tamil_words') 
    THEN '✓ tamil_words exists' 
    ELSE '✗ tamil_words missing' END;
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tamil_phrases') 
    THEN '✓ tamil_phrases exists' 
    ELSE '✗ tamil_phrases missing' END;
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tamil_bigrams') 
    THEN '✓ tamil_bigrams exists' 
    ELSE '✗ tamil_bigrams missing' END;

\echo ''
\echo 'Inserting sample words...'

-- Insert common words (subset for testing)
-- For full dataset, use the seeder tool or COPY command
INSERT INTO tamil_words (tamil_text, transliteration, alternate_spellings, frequency, category, source, user_confirmed)
VALUES 
    ('அம்மா', 'amma', '[]', 2500, 'common', 'seed', 0),
    ('அப்பா', 'appa', '[]', 2400, 'common', 'seed', 0),
    ('நண்பன்', 'nanban', '["nanbaa","nanba"]', 2300, 'common', 'seed', 0),
    ('படிக்க', 'padikka', '[]', 2000, 'verb', 'seed', 0),
    ('படித்தேன்', 'padiththen', '["padichen"]', 1800, 'verb', 'seed', 0),
    ('படிச்சேன்', 'padichaen', '["padichen","padichchaen"]', 1750, 'verb', 'seed', 0),
    ('படிச்சியா', 'padichiya', '["padichchiya","padiththiya"]', 1900, 'verb', 'seed', 0),
    ('சோறு', 'soru', '["choru"]', 2200, 'noun', 'seed', 0),
    ('சாப்பாடு', 'saappadu', '["sapadu","chaapadu"]', 2150, 'noun', 'seed', 0),
    ('வணக்கம்', 'vanakkam', '[]', 2500, 'greeting', 'seed', 0),
    ('நன்றி', 'nandri', '["nanri"]', 2450, 'greeting', 'seed', 0),
    ('என்ன', 'enna', '[]', 2600, 'question', 'seed', 0),
    ('எப்படி', 'eppadi', '[]', 2500, 'question', 'seed', 0),
    ('எங்கே', 'engae', '["enga"]', 2300, 'question', 'seed', 0),
    ('நான்', 'naan', '["nan"]', 2800, 'pronoun', 'seed', 0),
    ('நீ', 'nee', '[]', 2700, 'pronoun', 'seed', 0),
    ('வா', 'vaa', '[]', 2200, 'verb', 'seed', 0),
    ('வந்தேன்', 'vanththen', '["vanthen"]', 2000, 'verb', 'seed', 0),
    ('போ', 'po', '[]', 2100, 'verb', 'seed', 0),
    ('போனேன்', 'ponen', '[]', 1950, 'verb', 'seed', 0),
    ('தமிழ்', 'thamizh', '["tamil"]', 2500, 'noun', 'seed', 0),
    ('மொழி', 'mozhi', '["moli"]', 2150, 'noun', 'seed', 0),
    ('வீடு', 'veedu', '[]', 2400, 'noun', 'seed', 0),
    ('பள்ளி', 'palli', '[]', 2300, 'noun', 'seed', 0),
    ('இன்று', 'indru', '[]', 2400, 'time', 'seed', 0),
    ('நேற்று', 'netru', '[]', 2300, 'time', 'seed', 0),
    ('நாளை', 'naalai', '[]', 2200, 'time', 'seed', 0),
    ('இட்லி', 'idli', '[]', 1950, 'food', 'seed', 0),
    ('தோசை', 'thosai', '["dosai"]', 1900, 'food', 'seed', 0),
    ('சாதம்', 'saatham', '["sadham"]', 2000, 'food', 'seed', 0)
ON CONFLICT (transliteration) DO UPDATE 
SET frequency = GREATEST(tamil_words.frequency, EXCLUDED.frequency),
    updated_at = NOW();

\echo 'Inserted/updated words.'
\echo ''
\echo 'Inserting sample phrases...'

INSERT INTO tamil_phrases (phrase, frequency)
VALUES 
    ('எப்படி இருக்கிறீர்கள்', 1500),
    ('எப்படி இருக்கீங்க', 1450),
    ('என்ன செய்யறீங்க', 1300),
    ('நான் வருகிறேன்', 1150),
    ('நான் போறேன்', 1100),
    ('வீட்டுக்கு போ', 1200),
    ('பள்ளிக்கு போ', 1180),
    ('சாப்பாடு சாப்பிட்டீங்களா', 1300),
    ('எனக்கு தெரியும்', 1400),
    ('எனக்கு தெரியாது', 1450),
    ('நன்றி சொல்ல', 1400),
    ('என் பெயர்', 1500),
    ('உங்கள் பெயர்', 1450),
    ('தமிழ் படிக்க', 1300),
    ('வீட்டில் இருக்கிறேன்', 1250)
ON CONFLICT (phrase) DO UPDATE 
SET frequency = GREATEST(tamil_phrases.frequency, EXCLUDED.frequency),
    updated_at = NOW();

\echo 'Inserted/updated phrases.'
\echo ''
\echo 'Inserting sample bigrams...'

INSERT INTO tamil_bigrams (word, next_word, frequency)
VALUES 
    ('நான்', 'வர', 1800),
    ('நான்', 'போ', 1750),
    ('நான்', 'படிக்க', 1700),
    ('நான்', 'சாப்பிட', 1650),
    ('என்ன', 'செய்யறீங்க', 1700),
    ('எப்படி', 'இருக்கிறீர்கள்', 1650),
    ('எங்கே', 'போகிறீர்கள்', 1600),
    ('அம்மா', 'வந்தாள்', 1500),
    ('அப்பா', 'வந்தார்', 1480),
    ('வீட்டுக்கு', 'போ', 1600),
    ('பள்ளிக்கு', 'போ', 1550),
    ('சோறு', 'சாப்பிட்டேன்', 1500),
    ('தமிழ்', 'படிக்கிறேன்', 1400),
    ('நண்பன்', 'வந்தான்', 1450),
    ('இன்று', 'வா', 1500)
ON CONFLICT (word, next_word) DO UPDATE 
SET frequency = GREATEST(tamil_bigrams.frequency, EXCLUDED.frequency),
    updated_at = NOW();

\echo 'Inserted/updated bigrams.'
\echo ''
\echo '✓ Corpus population complete!'
\echo ''
\echo 'Verification:'
SELECT 'tamil_words' as table_name, COUNT(*) as row_count FROM tamil_words
UNION ALL
SELECT 'tamil_phrases', COUNT(*) FROM tamil_phrases
UNION ALL
SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams;

\echo ''
\echo 'Sample words:'
SELECT tamil_text, transliteration, frequency FROM tamil_words ORDER BY frequency DESC LIMIT 10;

\echo ''
\echo 'Next steps:'
\echo '1. Set DATABASE_URL in ProofTamilRunner Cloud Run'
\echo '2. Redeploy ProofTamilRunner'
\echo '3. Test suggestions for: amma, padichiya, soru, nanban'
\echo ''
