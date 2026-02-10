-- Tamil corpus seed for Supabase (run in Supabase Dashboard → SQL Editor).
-- No psql-specific commands (\echo); safe to paste and run.
-- This populates tamil_words so /api/v1/suggest returns suggestions.

INSERT INTO tamil_words (tamil_text, transliteration, alternate_spellings, frequency, category, source, user_confirmed, is_verified)
VALUES
    ('அம்மா', 'amma', '[]', 2500, 'kinship', 'seed', 0, true),
    ('படிச்சியா', 'padichiya', '["padichchiya","padiththiya"]', 1900, 'verb', 'seed', 0, true),
    ('சோறு', 'soru', '["choru"]', 2200, 'food', 'seed', 0, true),
    ('நண்பன்', 'nanban', '["nanba","nanbaa"]', 2300, 'common', 'seed', 0, true),
    ('சாப்பாடு', 'saappadu', '["sapadu","chaapadu"]', 2150, 'food', 'seed', 0, true),
    ('அப்பா', 'appa', '[]', 2400, 'kinship', 'seed', 0, true),
    ('அண்ணா', 'annaa', '[]', 2300, 'kinship', 'seed', 0, true),
    ('அக்கா', 'akkaa', '[]', 2200, 'kinship', 'seed', 0, true),
    ('படிக்க', 'padikka', '[]', 2000, 'verb', 'seed', 0, true),
    ('படித்தேன்', 'padiththen', '["padichen"]', 1800, 'verb', 'seed', 0, true),
    ('படிச்சேன்', 'padichaen', '["padichen"]', 1750, 'verb', 'seed', 0, true),
    ('வா', 'vaa', '[]', 2200, 'verb', 'seed', 0, true),
    ('வந்தேன்', 'vanththen', '["vanthen"]', 2000, 'verb', 'seed', 0, true),
    ('போ', 'po', '[]', 2100, 'verb', 'seed', 0, true),
    ('போனேன்', 'ponen', '[]', 1950, 'verb', 'seed', 0, true),
    ('சாப்பிட', 'saappida', '["sapida"]', 2000, 'verb', 'seed', 0, true),
    ('சாப்பிட்டேன்', 'saappittaen', '["sapittaen"]', 1800, 'verb', 'seed', 0, true),
    ('தமிழ்', 'thamizh', '["tamil"]', 2500, 'common', 'seed', 0, true),
    ('மொழி', 'mozhi', '["moli"]', 2150, 'common', 'seed', 0, true),
    ('வீடு', 'veedu', '[]', 2400, 'common', 'seed', 0, true),
    ('பள்ளி', 'palli', '[]', 2300, 'common', 'seed', 0, true),
    ('என்ன', 'enna', '[]', 2600, 'question', 'seed', 0, true),
    ('எனது', 'enathu', '["enadu"]', 2400, 'common', 'seed', 0, true),
    ('எப்படி', 'eppadi', '[]', 2500, 'question', 'seed', 0, true),
    ('எங்கே', 'engae', '["enga"]', 2300, 'question', 'seed', 0, true),
    ('நான்', 'naan', '["nan"]', 2800, 'pronoun', 'seed', 0, true),
    ('நீ', 'nee', '[]', 2700, 'pronoun', 'seed', 0, true),
    ('வணக்கம்', 'vanakkam', '[]', 2500, 'greeting', 'seed', 0, true),
    ('நன்றி', 'nandri', '["nanri"]', 2450, 'greeting', 'seed', 0, true),
    ('இன்று', 'indru', '[]', 2400, 'time', 'seed', 0, true),
    ('நேற்று', 'netru', '[]', 2300, 'time', 'seed', 0, true)
ON CONFLICT (transliteration)
DO UPDATE SET
    frequency = GREATEST(tamil_words.frequency, EXCLUDED.frequency),
    updated_at = NOW();
