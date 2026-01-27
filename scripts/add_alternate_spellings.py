#!/usr/bin/env python3
"""
Add alternate spellings to tamil_words based on common transliteration variations.
This handles cases like "natakam" vs "nadagam", "thamizh" vs "tamizh", etc.
"""

import json
import re
import sys

# Common transliteration variations
# Maps: original_char -> [alternate_chars]
VARIATIONS = {
    't': ['d', 'th'],  # natakam -> nadagam, natakam -> nathakam
    'd': ['t', 'th'],  # nadagam -> natakam, nadagam -> nadhagam
    'th': ['t', 'd', 'dh'],  # thamizh -> tamizh, thamizh -> damizh, thamizh -> dhamizh
    'dh': ['d', 't', 'th'],  # dhamizh -> damizh, dhamizh -> thamizh
    'p': ['b'],  # patam -> batam
    'b': ['p'],  # batam -> patam
    'k': ['g'],  # kovil -> govil
    'g': ['k'],  # govil -> kovil
    'c': ['s', 'ch'],  # cari -> sari, cari -> chari
    's': ['c', 'sh'],  # sari -> cari, sari -> shari
    'ch': ['c', 's'],  # chari -> cari, chari -> shari
    'sh': ['s', 'c'],  # shari -> sari, shari -> chari
    'r': ['R'],  # r -> R (rare)
    'l': ['L', 'zh'],  # l -> L, l -> zh
    'zh': ['l', 'L'],  # zh -> l, zh -> L
}

def generate_variations(word: str) -> list[str]:
    """Generate alternate spellings for a word based on common variations."""
    variations = set()
    
    # Generate variations by replacing each character
    for i, char in enumerate(word):
        if char in VARIATIONS:
            for alt in VARIATIONS[char]:
                variant = word[:i] + alt + word[i+1:]
                variations.add(variant)
    
    # Also try common multi-char replacements
    replacements = [
        ('aa', 'a'), ('a', 'aa'),
        ('ee', 'i'), ('i', 'ee'),
        ('oo', 'u'), ('u', 'oo'),
        ('ai', 'ay'), ('ay', 'ai'),
        ('au', 'aw'), ('aw', 'au'),
    ]
    
    for old, new in replacements:
        if old in word:
            variations.add(word.replace(old, new, 1))
    
    return sorted([v for v in variations if v != word and len(v) >= 2])

def sql_escape(s: str) -> str:
    return s.replace("'", "''")

def main():
    # Read from stdin or file
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            words = [line.strip().split('\t') for line in f if line.strip() and not line.startswith('#')]
    else:
        print("Usage: python3 add_alternate_spellings.py <input.tsv>")
        print("Input format: transliteration\\tfrequency")
        sys.exit(1)
    
    updates = []
    for row in words:
        if len(row) < 1:
            continue
        translit = row[0].strip().lower()
        if not translit:
            continue
        
        variations = generate_variations(translit)
        if not variations:
            continue
        
        # Limit to top 5 variations to avoid too many alternates
        variations = variations[:5]
        
        alt_json = json.dumps(variations, ensure_ascii=False)
        updates.append((translit, alt_json))
    
    if not updates:
        print("No updates to generate.")
        return
    
    # Generate SQL UPDATE statements
    print("BEGIN;")
    print("-- Adding alternate spellings for transliteration variations")
    print()
    
    batch = []
    for translit, alt_json in updates:
        escaped_translit = sql_escape(translit)
        escaped_alt = sql_escape(alt_json)
        
        # Update existing alternate_spellings by merging with new ones
        # Use JSONB array concatenation to merge
        batch.append(f"""
UPDATE tamil_words 
SET alternate_spellings = (
    SELECT jsonb_agg(DISTINCT elem)
    FROM (
        SELECT jsonb_array_elements_text(
            COALESCE(alternate_spellings::jsonb, '[]'::jsonb) || '{alt_json}'::jsonb
        ) AS elem
    ) sub
)
WHERE transliteration = '{escaped_translit}' 
  AND (alternate_spellings IS NULL OR alternate_spellings = '[]' OR alternate_spellings = '');
""")
        
        if len(batch) >= 100:
            print("".join(batch))
            batch = []
    
    if batch:
        print("".join(batch))
    
    print("COMMIT;")
    print(f"-- Updated {len(updates)} words with alternate spellings")

if __name__ == "__main__":
    main()
