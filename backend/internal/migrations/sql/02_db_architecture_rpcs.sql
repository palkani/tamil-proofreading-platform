-- ============================================================
-- ProofTamil DB Architecture: RPC Functions
-- Run after 01_db_architecture_schema.sql (pg_trgm required).
-- ============================================================

-- suggest_tamil: 4-tier autocomplete (MV → prefix → translit → fuzzy)
CREATE OR REPLACE FUNCTION suggest_tamil(
  p_query     TEXT,
  p_limit     INTEGER DEFAULT 8,
  p_prev_word TEXT DEFAULT NULL
)
RETURNS TABLE (tamil_text TEXT, score BIGINT, match_type TEXT)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  v_query TEXT;
  v_count INTEGER := 0;
BEGIN
  v_query := lower(trim(p_query));
  IF v_query IS NULL OR v_query = '' THEN
    RETURN;
  END IF;

  -- Tier 1: Materialized view (1–3 char)
  IF char_length(v_query) <= 3 THEN
    RETURN QUERY
    SELECT mv.tamil_text,
      CASE WHEN p_prev_word IS NOT NULL THEN
        mv.freq + COALESCE(
          (SELECT b.frequency FROM tamil_bigrams b WHERE b.word = p_prev_word AND b.next_word = mv.tamil_text),
          0
        )
      ELSE mv.freq END AS score,
      'cached'::TEXT AS match_type
    FROM mv_top_suggestions mv
    WHERE mv.prefix = v_query
    ORDER BY score DESC
    LIMIT p_limit;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count >= p_limit THEN RETURN; END IF;
  END IF;

  -- Tier 2: phonetic_variants prefix (only if tier 1 not used or returned 0)
  RETURN QUERY
  WITH matches AS (
    SELECT DISTINCT ON (pv.tamil_text) pv.tamil_text, pv.frequency, pv.variant_length
    FROM phonetic_variants pv
    WHERE pv.variant_lower LIKE v_query || '%'
    ORDER BY pv.tamil_text, pv.frequency DESC
  )
  SELECT m.tamil_text,
    (CASE WHEN p_prev_word IS NOT NULL THEN
      m.frequency + COALESCE(
        (SELECT b.frequency FROM tamil_bigrams b WHERE b.word = p_prev_word AND b.next_word = m.tamil_text),
        0
      )
    ELSE m.frequency END)::BIGINT AS score,
    'prefix'::TEXT AS match_type
  FROM matches m
  ORDER BY (char_length(v_query)::FLOAT / GREATEST(m.variant_length, 1)) DESC,
    (CASE WHEN p_prev_word IS NOT NULL THEN m.frequency + COALESCE((SELECT b.frequency FROM tamil_bigrams b WHERE b.word = p_prev_word AND b.next_word = m.tamil_text), 0) ELSE m.frequency END) DESC
  LIMIT p_limit;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RETURN; END IF;

  -- Tier 3: tamil_words.translit_lower fallback
  RETURN QUERY
  SELECT DISTINCT ON (tw.tamil_text::TEXT) tw.tamil_text::TEXT,
    COALESCE(tw.frequency, 0)::BIGINT,
    'translit'::TEXT AS match_type
  FROM tamil_words tw
  WHERE tw.translit_lower LIKE v_query || '%' AND tw.deleted_at IS NULL
  ORDER BY tw.tamil_text::TEXT, COALESCE(tw.frequency, 0) DESC
  LIMIT p_limit;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RETURN; END IF;

  -- Tier 4: Fuzzy (pg_trgm)
  RETURN QUERY
  SELECT DISTINCT ON (pv.tamil_text) pv.tamil_text, pv.frequency,
    'fuzzy'::TEXT AS match_type
  FROM phonetic_variants pv
  WHERE pv.variant_lower % v_query AND similarity(pv.variant_lower, v_query) > 0.3
  ORDER BY pv.tamil_text, similarity(pv.variant_lower, v_query) DESC, pv.frequency DESC
  LIMIT p_limit;
END;
$$;

-- predict_next_word
CREATE OR REPLACE FUNCTION predict_next_word(p_word TEXT, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (next_word TEXT, frequency BIGINT)
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT b.next_word, b.frequency FROM tamil_bigrams b
  WHERE b.word = p_word
  ORDER BY b.frequency DESC
  LIMIT p_limit;
$$;

-- validate_tamil_words
CREATE OR REPLACE FUNCTION validate_tamil_words(p_words TEXT[])
RETURNS TABLE (word TEXT, is_valid BOOLEAN, suggestion TEXT)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH input_words AS (SELECT DISTINCT unnest(p_words) AS w),
  checked AS (
    SELECT iw.w,
      EXISTS (
        SELECT 1 FROM tamil_words tw
        WHERE tw.tamil_text = iw.w AND tw.deleted_at IS NULL
      ) AS valid
    FROM input_words iw
  )
  SELECT c.w AS word, c.valid AS is_valid,
    CASE WHEN c.valid THEN NULL::TEXT
    ELSE (
      SELECT tw.tamil_text::TEXT FROM tamil_words tw
      WHERE tw.deleted_at IS NULL AND similarity(tw.tamil_text::TEXT, c.w) > 0.3
      ORDER BY similarity(tw.tamil_text::TEXT, c.w) DESC
      LIMIT 1
    ) END AS suggestion
  FROM checked c;
END;
$$;

-- check_phrase_validity
CREATE OR REPLACE FUNCTION check_phrase_validity(p_phrase TEXT)
RETURNS TABLE (phrase TEXT, is_valid BOOLEAN, known_phrase TEXT, confidence FLOAT)
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT p_phrase AS phrase,
    EXISTS (SELECT 1 FROM tamil_phrases tp WHERE tp.phrase = p_phrase) AS is_valid,
    (SELECT tp.phrase FROM tamil_phrases tp WHERE similarity(tp.phrase, p_phrase) > 0.4 ORDER BY similarity(tp.phrase, p_phrase) DESC LIMIT 1) AS known_phrase,
    (SELECT similarity(tp.phrase, p_phrase) FROM tamil_phrases tp WHERE similarity(tp.phrase, p_phrase) > 0.4 ORDER BY similarity(tp.phrase, p_phrase) DESC LIMIT 1) AS confidence;
$$;

-- record_word_selected
CREATE OR REPLACE FUNCTION record_word_selected(p_word_id BIGINT)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE tamil_words SET user_confirmed = COALESCE(user_confirmed, 0) + 1, updated_at = now() WHERE id = p_word_id;
$$;
