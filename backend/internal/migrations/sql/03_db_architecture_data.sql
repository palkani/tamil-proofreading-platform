-- ============================================================
-- ProofTamil DB Architecture: Data migration (phonetic_variants, frequency_rank)
-- Run after 01_db_architecture_schema.sql and 02_db_architecture_rpcs.sql.
-- Handles alternate_spellings as JSON array or comma/pipe/space-separated.
-- ============================================================

-- Allow up to 10 minutes for large tamil_words (Supabase default can be 8s)
SET statement_timeout = '600s';

-- Step 1: Insert primary transliteration from tamil_words
INSERT INTO phonetic_variants (tamil_word_id, variant, tamil_text, frequency)
SELECT id, transliteration::TEXT, tamil_text::TEXT, COALESCE(frequency, 0)
FROM tamil_words
WHERE deleted_at IS NULL
  AND transliteration IS NOT NULL
  AND transliteration::TEXT != ''
ON CONFLICT (tamil_word_id, variant) DO NOTHING;

-- Step 2a: Expand alternate_spellings when stored as JSON array (column starts with '[')
INSERT INTO phonetic_variants (tamil_word_id, variant, tamil_text, frequency)
SELECT tw.id, trim(expanded.elem::TEXT), tw.tamil_text::TEXT, COALESCE(tw.frequency, 0)
FROM tamil_words tw
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN tw.alternate_spellings IS NOT NULL AND trim(tw.alternate_spellings) <> '' AND left(trim(tw.alternate_spellings), 1) = '['
  THEN tw.alternate_spellings::jsonb ELSE '[]'::jsonb END
) AS expanded(elem)
WHERE tw.deleted_at IS NULL
  AND tw.alternate_spellings IS NOT NULL
  AND trim(tw.alternate_spellings) != ''
  AND trim(expanded.elem::TEXT) != ''
ON CONFLICT (tamil_word_id, variant) DO NOTHING;

-- Step 2b: Expand alternate_spellings when comma/pipe/space-separated (non-JSON)
INSERT INTO phonetic_variants (tamil_word_id, variant, tamil_text, frequency)
SELECT tw.id, trim(alt.spelling), tw.tamil_text::TEXT, COALESCE(tw.frequency, 0)
FROM tamil_words tw,
  LATERAL unnest(
    string_to_array(
      replace(replace(COALESCE(trim(tw.alternate_spellings), ''), '|', ','), ' ', ','),
      ','
    )
  ) AS alt(spelling)
WHERE tw.deleted_at IS NULL
  AND tw.alternate_spellings IS NOT NULL
  AND trim(tw.alternate_spellings) != ''
  AND (left(trim(tw.alternate_spellings), 1) != '[' OR trim(tw.alternate_spellings) = '[]')
  AND trim(alt.spelling) != ''
ON CONFLICT (tamil_word_id, variant) DO NOTHING;

-- Step 3: Compute frequency_rank on tamil_words
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY COALESCE(frequency, 0) DESC, COALESCE(user_confirmed, 0) DESC) AS rank
  FROM tamil_words
  WHERE deleted_at IS NULL
)
UPDATE tamil_words tw SET frequency_rank = r.rank
FROM ranked r WHERE tw.id = r.id;

-- Step 4: Refresh materialized view (CONCURRENTLY requires unique index, already created)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_suggestions;

-- Step 5: Update statistics
ANALYZE tamil_words;
ANALYZE phonetic_variants;
ANALYZE mv_top_suggestions;

RESET statement_timeout;

-- Verification (optional; run manually)
-- SELECT 'tamil_words' AS tbl, count(*) AS rows FROM tamil_words WHERE deleted_at IS NULL
-- UNION ALL SELECT 'phonetic_variants', count(*) FROM phonetic_variants
-- UNION ALL SELECT 'mv_top_suggestions', count(*) FROM mv_top_suggestions;
