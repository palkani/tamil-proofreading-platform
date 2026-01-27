-- Fix common transliteration variations that users type vs what's in corpus
-- This is a targeted fix for the most common mismatches

BEGIN;

-- CRITICAL FIX: natakam (நாடகம்) - users type "nadagam"
UPDATE tamil_words 
SET alternate_spellings = '["nadagam", "nathakam", "nadakam"]'::jsonb
WHERE transliteration = 'natakam';

-- tamizh/thamizh (தமிழ்) - both directions
UPDATE tamil_words 
SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || '["thamizh", "damizh"]'::jsonb
WHERE transliteration = 'tamizh'
  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb);

UPDATE tamil_words 
SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || '["tamizh", "damizh"]'::jsonb
WHERE transliteration = 'thamizh'
  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb);

-- Remove any duplicate alternates
UPDATE tamil_words
SET alternate_spellings = (
  SELECT jsonb_agg(DISTINCT elem ORDER BY elem)
  FROM jsonb_array_elements_text(alternate_spellings) elem
  WHERE elem != ''
)
WHERE alternate_spellings IS NOT NULL 
  AND alternate_spellings != '[]'::jsonb;

COMMIT;
