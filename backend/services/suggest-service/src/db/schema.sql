-- ====================================================================
-- TAMIL AUTO-SUGGESTION ENGINE - DATABASE SCHEMA
-- Production-ready schema for rule-first Tamil typing suggestions
-- Compatible with: PostgreSQL 14+, Supabase
-- ====================================================================

-- ====================================================================
-- 1. CORPUS TABLES
-- ====================================================================

-- Tamil words corpus with frequency
CREATE TABLE IF NOT EXISTS tamil_words (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  frequency INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'word' CHECK (kind IN ('word', 'phrase')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tamil_words_word_prefix ON tamil_words USING btree (word text_pattern_ops);
CREATE INDEX idx_tamil_words_frequency ON tamil_words(frequency DESC);
CREATE INDEX idx_tamil_words_kind ON tamil_words(kind);

COMMENT ON TABLE tamil_words IS 'Tamil word corpus with frequency for prefix matching';
COMMENT ON COLUMN tamil_words.word IS 'Tamil word or phrase';
COMMENT ON COLUMN tamil_words.frequency IS 'Usage frequency (higher = more common)';
COMMENT ON COLUMN tamil_words.kind IS 'word or phrase';

-- ====================================================================
-- 2. BIGRAM CONTEXT TABLE
-- ====================================================================

-- Word bigrams for context-aware suggestions
CREATE TABLE IF NOT EXISTS tamil_bigrams (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  next_word TEXT NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(word, next_word)
);

CREATE INDEX idx_tamil_bigrams_word ON tamil_bigrams(word);
CREATE INDEX idx_tamil_bigrams_frequency ON tamil_bigrams(frequency DESC);
CREATE INDEX idx_tamil_bigrams_lookup ON tamil_bigrams(word, frequency DESC);

COMMENT ON TABLE tamil_bigrams IS 'Word bigrams for context-aware next-word prediction';
COMMENT ON COLUMN tamil_bigrams.word IS 'First word (context)';
COMMENT ON COLUMN tamil_bigrams.next_word IS 'Following word';
COMMENT ON COLUMN tamil_bigrams.frequency IS 'Co-occurrence frequency';

-- ====================================================================
-- 3. PHONETIC RULES TABLE (Data-driven rules)
-- ====================================================================

-- Phonetic transformation rules for English/Tanglish → Tamil
CREATE TABLE IF NOT EXISTS phonetic_rules (
  id SERIAL PRIMARY KEY,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  weight NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  rule_type TEXT NOT NULL DEFAULT 'consonant' CHECK (rule_type IN ('vowel', 'consonant', 'digraph', 'doubled', 'ending', 'special')),
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(input, output)
);

CREATE INDEX idx_phonetic_rules_input ON phonetic_rules(input);
CREATE INDEX idx_phonetic_rules_enabled ON phonetic_rules(enabled) WHERE enabled = true;
CREATE INDEX idx_phonetic_rules_priority ON phonetic_rules(priority DESC, weight DESC);
CREATE INDEX idx_phonetic_rules_type ON phonetic_rules(rule_type);

COMMENT ON TABLE phonetic_rules IS 'Data-driven phonetic transformation rules';
COMMENT ON COLUMN phonetic_rules.input IS 'English/Tanglish pattern (e.g., "kk", "ng")';
COMMENT ON COLUMN phonetic_rules.output IS 'Tamil character(s) (e.g., "க்க", "ங")';
COMMENT ON COLUMN phonetic_rules.weight IS 'Rule confidence weight (0-1)';
COMMENT ON COLUMN phonetic_rules.priority IS 'Match priority (higher = checked first)';

-- ====================================================================
-- 4. USER ACCEPTANCE EVENTS (Learning from user behavior)
-- ====================================================================

-- Track which suggestions users actually accept
CREATE TABLE IF NOT EXISTS accept_events (
  id SERIAL PRIMARY KEY,
  input TEXT NOT NULL,
  selected TEXT NOT NULL,
  rejected TEXT[], -- suggestions that were shown but not selected
  context_word TEXT, -- previous word if available
  session_id TEXT,
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_accept_events_input ON accept_events(input);
CREATE INDEX idx_accept_events_selected ON accept_events(selected);
CREATE INDEX idx_accept_events_created_at ON accept_events(created_at DESC);
CREATE INDEX idx_accept_events_context ON accept_events(context_word) WHERE context_word IS NOT NULL;

COMMENT ON TABLE accept_events IS 'User acceptance history for improving suggestions';
COMMENT ON COLUMN accept_events.input IS 'English/Tanglish input typed by user';
COMMENT ON COLUMN accept_events.selected IS 'Tamil suggestion user actually selected';
COMMENT ON COLUMN accept_events.rejected IS 'Other suggestions that were shown but not picked';
COMMENT ON COLUMN accept_events.context_word IS 'Previous Tamil word for context analysis';

-- ====================================================================
-- 5. MATERIALIZED VIEW FOR ACCEPTANCE FREQUENCY
-- ====================================================================

-- Aggregate acceptance events for faster lookups
CREATE MATERIALIZED VIEW IF NOT EXISTS acceptance_frequency AS
SELECT 
  input,
  selected,
  COUNT(*) as count,
  MAX(created_at) as last_used
FROM accept_events
GROUP BY input, selected
HAVING COUNT(*) >= 2 -- Only include patterns with 2+ acceptances
ORDER BY input, count DESC;

CREATE UNIQUE INDEX idx_acceptance_frequency_lookup ON acceptance_frequency(input, selected);
CREATE INDEX idx_acceptance_frequency_count ON acceptance_frequency(count DESC);

COMMENT ON MATERIALIZED VIEW acceptance_frequency IS 'Aggregated user acceptance patterns (refresh periodically)';

-- ====================================================================
-- 6. HELPER FUNCTIONS
-- ====================================================================

-- Function to refresh acceptance frequency view
CREATE OR REPLACE FUNCTION refresh_acceptance_frequency()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY acceptance_frequency;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_acceptance_frequency() IS 'Refresh acceptance frequency materialized view (call periodically via cron)';

-- Function to record acceptance event
CREATE OR REPLACE FUNCTION record_acceptance(
  p_input TEXT,
  p_selected TEXT,
  p_rejected TEXT[] DEFAULT NULL,
  p_context_word TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO accept_events (input, selected, rejected, context_word, session_id, user_id)
  VALUES (p_input, p_selected, p_rejected, p_context_word, p_session_id, p_user_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_acceptance IS 'Convenience function to record user acceptance event';

-- ====================================================================
-- 7. PERFORMANCE MONITORING TABLE
-- ====================================================================

-- Track suggestion engine performance metrics
CREATE TABLE IF NOT EXISTS suggest_metrics (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  latency_ms NUMERIC(10,2) NOT NULL,
  phonetic_candidates INTEGER NOT NULL,
  pool_size INTEGER NOT NULL,
  returned_count INTEGER NOT NULL,
  cache_hit BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_suggest_metrics_created_at ON suggest_metrics(created_at DESC);
CREATE INDEX idx_suggest_metrics_latency ON suggest_metrics(latency_ms);

COMMENT ON TABLE suggest_metrics IS 'Performance metrics for monitoring suggestion engine';

-- ====================================================================
-- 8. TRIGGERS FOR UPDATED_AT
-- ====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tamil_words_updated_at BEFORE UPDATE ON tamil_words
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tamil_bigrams_updated_at BEFORE UPDATE ON tamil_bigrams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phonetic_rules_updated_at BEFORE UPDATE ON phonetic_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- 9. INITIAL STATISTICS
-- ====================================================================

-- Ensure statistics are up to date for query planner
ANALYZE tamil_words;
ANALYZE tamil_bigrams;
ANALYZE phonetic_rules;
ANALYZE accept_events;

-- ====================================================================
-- SCHEMA VERSION & METADATA
-- ====================================================================

CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  description TEXT
);

INSERT INTO schema_version (version, description) 
VALUES ('1.0.0', 'Initial production schema for Tamil auto-suggestion engine')
ON CONFLICT (version) DO NOTHING;

-- ====================================================================
-- END OF SCHEMA
-- ====================================================================
