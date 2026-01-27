#!/usr/bin/env python3
"""
Generate SQL to add alternate spellings for common transliteration variations.
Focuses on high-frequency words with t/d, th/dh variations.
"""

import sys

def main():
    print("BEGIN;")
    print("-- Add alternate spellings for common transliteration variations")
    print()
    
    # Most critical: natakam -> nadagam
    print("-- Fix: natakam (நாடகம்) -> nadagam")
    print("UPDATE tamil_words")
    print("SET alternate_spellings = '[\"nadagam\", \"nathakam\", \"nadakam\"]'::jsonb")
    print("WHERE transliteration = 'natakam';")
    print()
    
    # tamizh/thamizh variations
    print("-- Fix: tamizh/thamizh (தமிழ்) variations")
    print("UPDATE tamil_words")
    print("SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || '[\"thamizh\", \"damizh\"]'::jsonb")
    print("WHERE transliteration = 'tamizh'")
    print("  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb);")
    print()
    
    print("UPDATE tamil_words")
    print("SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) || '[\"tamizh\", \"damizh\"]'::jsonb")
    print("WHERE transliteration = 'thamizh'")
    print("  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb);")
    print()
    
    # Common pattern: words ending in -am with 't' -> add 'd' variant
    print("-- Add t->d variations for common words ending in -am (frequency > 50)")
    print("UPDATE tamil_words")
    print("SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) ||")
    print("  jsonb_build_array(REPLACE(transliteration, 't', 'd'))")
    print("WHERE transliteration LIKE '%t%am'")
    print("  AND transliteration NOT LIKE '%th%'")
    print("  AND frequency > 50")
    print("  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb)")
    print("LIMIT 2000;")
    print()
    
    # Reverse: d->t
    print("-- Add d->t variations for common words ending in -am (frequency > 50)")
    print("UPDATE tamil_words")
    print("SET alternate_spellings = COALESCE(alternate_spellings, '[]'::jsonb) ||")
    print("  jsonb_build_array(REPLACE(transliteration, 'd', 't'))")
    print("WHERE transliteration LIKE '%d%am'")
    print("  AND transliteration NOT LIKE '%dh%'")
    print("  AND frequency > 50")
    print("  AND (alternate_spellings IS NULL OR alternate_spellings = '[]'::jsonb)")
    print("LIMIT 2000;")
    print()
    
    # Clean up duplicates
    print("-- Remove duplicate alternates")
    print("UPDATE tamil_words")
    print("SET alternate_spellings = (")
    print("  SELECT jsonb_agg(DISTINCT elem ORDER BY elem)")
    print("  FROM jsonb_array_elements_text(alternate_spellings) elem")
    print("  WHERE elem != ''")
    print(")")
    print("WHERE alternate_spellings IS NOT NULL")
    print("  AND alternate_spellings != '[]'::jsonb;")
    print()
    
    print("COMMIT;")

if __name__ == "__main__":
    main()
