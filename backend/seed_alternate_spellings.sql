-- Add common alternate spellings for transliteration variations
-- This handles cases where users type different transliterations than what's in the corpus

BEGIN;

-- natakam (நாடகம்) - most common issue: users type "nadagam"
UPDATE tamil_words 
SET alternate_spellings = '["nadagam", "nathakam", "nadakam"]'::jsonb
WHERE transliteration = 'natakam';

-- tamizh/thamizh (தமிழ்) variations
UPDATE tamil_words 
SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || '["thamizh", "damizh"]'::jsonb
WHERE transliteration = 'tamizh'
  AND (alternate_spellings IS NULL OR alternate_spellings::jsonb @> '[]'::jsonb);

UPDATE tamil_words 
SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || '["tamizh", "damizh"]'::jsonb
WHERE transliteration = 'thamizh'
  AND (alternate_spellings IS NULL OR alternate_spellings::jsonb @> '[]'::jsonb);

-- Common high-frequency words: add t<->d variations for words ending in -am, -am, -um
-- Only for words with frequency > 100 to avoid noise
UPDATE tamil_words 
SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || 
  jsonb_build_array(REPLACE(transliteration, 't', 'd'))
WHERE transliteration ~ 't[aeiou]' 
  AND transliteration !~ 'th'
  AND frequency > 100
  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb)
LIMIT 5000;

UPDATE tamil_words 
SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || 
  jsonb_build_array(REPLACE(transliteration, 'd', 't'))
WHERE transliteration ~ 'd[aeiou]' 
  AND transliteration !~ 'dh'
  AND frequency > 100
  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb)
LIMIT 5000;

-- Remove duplicate alternates
UPDATE tamil_words
SET alternate_spellings = (
  SELECT jsonb_agg(DISTINCT elem ORDER BY elem)
  FROM jsonb_array_elements_text(alternate_spellings) elem
  WHERE elem != ''
)
WHERE alternate_spellings IS NOT NULL 
  AND alternate_spellings != '[]'::jsonb;

COMMIT;
