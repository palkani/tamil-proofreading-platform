-- Migration: Handwriting OCR daily usage tracking
-- Run this once in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Usage table: one row per (ip, date)
CREATE TABLE IF NOT EXISTS handwriting_ocr_usage (
  ip         TEXT    NOT NULL,
  usage_date DATE    NOT NULL DEFAULT CURRENT_DATE,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, usage_date)
);

-- 2. Atomic increment function — inserts or increments, returns the new count.
--    Using a single statement avoids race conditions (no read-then-write).
CREATE OR REPLACE FUNCTION increment_ocr_usage(p_ip TEXT, p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO handwriting_ocr_usage (ip, usage_date, count)
  VALUES (p_ip, p_date, 1)
  ON CONFLICT (ip, usage_date)
  DO UPDATE SET count = handwriting_ocr_usage.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

-- 3. Disable Row Level Security for server-side access with the service role key.
--    (If you only call this from your Express backend using the anon key you may
--     need to add a policy instead — see comment below.)
ALTER TABLE handwriting_ocr_usage DISABLE ROW LEVEL SECURITY;

-- Optional: if you prefer RLS ON with an anon-key policy:
-- ALTER TABLE handwriting_ocr_usage ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service_all" ON handwriting_ocr_usage USING (true) WITH CHECK (true);

-- 4. Index to speed up date-range queries (cleanup jobs, analytics)
CREATE INDEX IF NOT EXISTS idx_ocr_usage_date ON handwriting_ocr_usage (usage_date);
