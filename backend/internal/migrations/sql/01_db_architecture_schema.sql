-- ============================================================
-- ProofTamil DB Architecture: Schema, Indexes, Materialized View
-- Run once (e.g. Supabase SQL Editor or via RUN_MIGRATIONS).
-- All statements are idempotent (IF NOT EXISTS / DO blocks).
-- ============================================================

-- STEP 1: Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- STEP 2: Alter tamil_words
ALTER TABLE tamil_words ADD COLUMN IF NOT EXISTS frequency_rank INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tamil_words' AND column_name = 'translit_lower') THEN
    ALTER TABLE tamil_words ADD COLUMN translit_lower TEXT GENERATED ALWAYS AS (LOWER(transliteration::TEXT)) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tamil_words' AND column_name = 'translit_length') THEN
    ALTER TABLE tamil_words ADD COLUMN translit_length SMALLINT GENERATED ALWAYS AS (char_length(transliteration::TEXT)) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_tw_tamil_text_unique') THEN
    IF NOT EXISTS (
      SELECT 1 FROM tamil_words WHERE deleted_at IS NULL
      GROUP BY tamil_text HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX idx_tw_tamil_text_unique ON tamil_words (tamil_text) WHERE deleted_at IS NULL;
    ELSE
      RAISE NOTICE 'Skipping idx_tw_tamil_text_unique: duplicate tamil_text exist in tamil_words; non-unique idx_tw_tamil_text will be created in STEP 6';
    END IF;
  END IF;
END $$;

-- STEP 3: phonetic_variants table
CREATE TABLE IF NOT EXISTS phonetic_variants (
  id              BIGSERIAL PRIMARY KEY,
  tamil_word_id   BIGINT NOT NULL REFERENCES tamil_words(id) ON DELETE CASCADE,
  variant         TEXT NOT NULL,
  tamil_text      TEXT NOT NULL,
  frequency       BIGINT NOT NULL DEFAULT 0,
  variant_lower   TEXT GENERATED ALWAYS AS (LOWER(variant)) STORED,
  variant_length  SMALLINT GENERATED ALWAYS AS (char_length(variant)) STORED,
  UNIQUE (tamil_word_id, variant)
);

COMMENT ON TABLE phonetic_variants IS 'English phonetic spellings → Tamil words. Core table for autocomplete.';
COMMENT ON COLUMN phonetic_variants.tamil_text IS 'Denormalized from tamil_words.tamil_text.';
COMMENT ON COLUMN phonetic_variants.variant_lower IS 'Generated lowercase variant for indexed prefix search.';

-- STEP 4: tamil_bigrams - add id if missing, unique on (word, next_word)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tamil_bigrams' AND column_name = 'id') THEN
    ALTER TABLE tamil_bigrams ADD COLUMN id BIGSERIAL;
    CREATE UNIQUE INDEX idx_bigrams_id_unique ON tamil_bigrams (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_bigrams_unique') THEN
    CREATE UNIQUE INDEX idx_bigrams_unique ON tamil_bigrams (word, next_word);
  END IF;
END $$;

-- STEP 5: tamil_phrases - add id if missing, unique on phrase
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tamil_phrases' AND column_name = 'id') THEN
    ALTER TABLE tamil_phrases ADD COLUMN id BIGSERIAL;
    CREATE UNIQUE INDEX idx_phrases_id_unique ON tamil_phrases (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_phrases_unique') THEN
    CREATE UNIQUE INDEX idx_phrases_unique ON tamil_phrases (phrase);
  END IF;
END $$;

-- STEP 6: Indexes

-- phonetic_variants
CREATE INDEX IF NOT EXISTS idx_pv_prefix ON phonetic_variants (variant_lower text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_pv_prefix_freq ON phonetic_variants (variant_lower text_pattern_ops, frequency DESC);
CREATE INDEX IF NOT EXISTS idx_pv_trgm ON phonetic_variants USING gin (variant_lower gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pv_word_id ON phonetic_variants (tamil_word_id);

-- tamil_words
CREATE INDEX IF NOT EXISTS idx_tw_translit_prefix ON tamil_words (translit_lower text_pattern_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tw_freq_rank ON tamil_words (frequency_rank ASC NULLS LAST) WHERE deleted_at IS NULL AND frequency_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tw_tamil_text ON tamil_words (tamil_text text_pattern_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tw_tamil_trgm ON tamil_words USING gin (tamil_text gin_trgm_ops);

-- tamil_bigrams
CREATE INDEX IF NOT EXISTS idx_bigrams_word_freq ON tamil_bigrams (word, frequency DESC);
CREATE INDEX IF NOT EXISTS idx_bigrams_next_freq ON tamil_bigrams (next_word, frequency DESC);

-- tamil_phrases
CREATE INDEX IF NOT EXISTS idx_phrases_prefix ON tamil_phrases (phrase text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_phrases_trgm ON tamil_phrases USING gin (phrase gin_trgm_ops);

ANALYZE tamil_words;
ANALYZE phonetic_variants;
ANALYZE tamil_bigrams;
ANALYZE tamil_phrases;

-- STEP 7: Materialized view mv_top_suggestions (requires phonetic_variants to exist; may be empty)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_top_suggestions AS
WITH p1 AS (
  SELECT left(variant_lower, 1) AS prefix, tamil_text, MAX(frequency) AS freq,
    ROW_NUMBER() OVER (PARTITION BY left(variant_lower, 1) ORDER BY MAX(frequency) DESC) AS rn
  FROM phonetic_variants
  GROUP BY left(variant_lower, 1), tamil_text
)
SELECT prefix, tamil_text, freq FROM p1 WHERE rn <= 10
UNION ALL
SELECT prefix, tamil_text, freq FROM (
  SELECT left(variant_lower, 2) AS prefix, tamil_text, MAX(frequency) AS freq,
    ROW_NUMBER() OVER (PARTITION BY left(variant_lower, 2) ORDER BY MAX(frequency) DESC) AS rn
  FROM phonetic_variants WHERE char_length(variant_lower) >= 2
  GROUP BY left(variant_lower, 2), tamil_text
) sub WHERE rn <= 10
UNION ALL
SELECT prefix, tamil_text, freq FROM (
  SELECT left(variant_lower, 3) AS prefix, tamil_text, MAX(frequency) AS freq,
    ROW_NUMBER() OVER (PARTITION BY left(variant_lower, 3) ORDER BY MAX(frequency) DESC) AS rn
  FROM phonetic_variants WHERE char_length(variant_lower) >= 3
  GROUP BY left(variant_lower, 3), tamil_text
) sub WHERE rn <= 10;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mvts_pk ON mv_top_suggestions (prefix, tamil_text);
CREATE INDEX IF NOT EXISTS idx_mvts_prefix_freq ON mv_top_suggestions (prefix, freq DESC);
