#!/usr/bin/env python3
"""
Build a Tamil IME corpus from Wikimedia dump data.
Default source: tawiki latest all-titles-in-ns0 (small, fast).
Outputs a SQL file for tamil_words with romanized transliteration.
"""

import argparse
import bz2
import gzip
import os
import re
import sys
import tempfile
import urllib.request
from collections import Counter

TAMIL_WORD_RE = re.compile(r"[\u0B80-\u0BFF]+")

INDEP_VOWELS = {
    "அ": "a",
    "ஆ": "a",
    "இ": "i",
    "ஈ": "i",
    "உ": "u",
    "ஊ": "u",
    "எ": "e",
    "ஏ": "e",
    "ஐ": "ai",
    "ஒ": "o",
    "ஓ": "o",
    "ஔ": "au",
    "ஃ": "h",
}

VOWEL_SIGNS = {
    "ா": "a",
    "ி": "i",
    "ீ": "i",
    "ு": "u",
    "ூ": "u",
    "ெ": "e",
    "ே": "e",
    "ை": "ai",
    "ொ": "o",
    "ோ": "o",
    "ௌ": "au",
}

PULLI = "்"

CONSONANTS = {
    "க": "k",
    "ங": "ng",
    "ச": "c",
    "ஜ": "j",
    "ஞ": "ny",
    "ட": "t",
    "ண": "n",
    "த": "t",
    "ந": "n",
    "ப": "p",
    "ம": "m",
    "ய": "y",
    "ர": "r",
    "ல": "l",
    "வ": "v",
    "ழ": "zh",
    "ள": "l",
    "ற": "r",
    "ன": "n",
    "ஷ": "sh",
    "ஸ": "s",
    "ஹ": "h",
    "ஶ": "sh",
}


def romanize_tamil(word: str) -> str:
    if not word:
        return ""
    out = []
    i = 0
    while i < len(word):
        ch = word[i]
        if ch in INDEP_VOWELS:
            out.append(INDEP_VOWELS[ch])
        elif ch in CONSONANTS:
            base = CONSONANTS[ch]
            next_ch = word[i + 1] if i + 1 < len(word) else ""
            if next_ch in VOWEL_SIGNS:
                out.append(base + VOWEL_SIGNS[next_ch])
                i += 1
            elif next_ch == PULLI:
                out.append(base)
                i += 1
            else:
                out.append(base + "a")
        elif ch in VOWEL_SIGNS:
            # Skip dangling vowel signs.
            pass
        else:
            # Ignore non-Tamil symbols.
            pass
        i += 1
    return "".join(out).lower()


def open_maybe_compressed(path: str):
    if path.endswith(".bz2"):
        return bz2.open(path, "rt", encoding="utf-8", errors="ignore")
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="ignore")
    return open(path, "rt", encoding="utf-8", errors="ignore")


def download_to_temp(url: str) -> str:
    tmp_dir = tempfile.mkdtemp(prefix="tawiki_")
    filename = os.path.basename(url)
    dest = os.path.join(tmp_dir, filename)
    print(f"[CORPUS] Downloading: {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"[CORPUS] Saved: {dest}")
    return dest


def collect_words(stream, max_words: int, min_len: int, max_len: int) -> Counter:
    counts = Counter()
    for line in stream:
        for token in TAMIL_WORD_RE.findall(line):
            w = token.strip()
            if not w:
                continue
            if len(w) < min_len or len(w) > max_len:
                continue
            counts[w] += 1
            if len(counts) >= max_words:
                return counts
    return counts


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def write_sql(path: str, entries: list[tuple[str, str, int]], source: str):
    with open(path, "w", encoding="utf-8") as f:
        f.write("BEGIN;\n")
        batch = []
        for tamil, roman, freq in entries:
            if not tamil or not roman:
                continue
            batch.append(
                f"('{sql_escape(tamil)}','{sql_escape(roman)}','[]',{freq},'common','{sql_escape(source)}',false)"
            )
            if len(batch) >= 500:
                f.write(
                    "INSERT INTO tamil_words (tamil_text, transliteration, alternate_spellings, frequency, category, source, is_verified) VALUES\n"
                )
                f.write(",\n".join(batch))
                f.write(
                    "\nON CONFLICT (transliteration) DO UPDATE SET frequency = GREATEST(tamil_words.frequency, EXCLUDED.frequency);\n"
                )
                batch = []
        if batch:
            f.write(
                "INSERT INTO tamil_words (tamil_text, transliteration, alternate_spellings, frequency, category, source, is_verified) VALUES\n"
            )
            f.write(",\n".join(batch))
            f.write(
                "\nON CONFLICT (transliteration) DO UPDATE SET frequency = GREATEST(tamil_words.frequency, EXCLUDED.frequency);\n"
            )
        f.write("COMMIT;\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-url",
        default="https://dumps.wikimedia.org/tawiki/latest/tawiki-latest-all-titles-in-ns0.gz",
        help="Wikimedia dump URL",
    )
    parser.add_argument("--max-words", type=int, default=100000)
    parser.add_argument("--min-len", type=int, default=2)
    parser.add_argument("--max-len", type=int, default=20)
    parser.add_argument("--output", default="backend/seed_corpus_wiki.sql")
    parser.add_argument("--source-tag", default="tawiki_titles")
    args = parser.parse_args()

    path = download_to_temp(args.source_url)
    with open_maybe_compressed(path) as f:
        counts = collect_words(f, args.max_words, args.min_len, args.max_len)

    roman_map = {}
    for tamil, freq in counts.most_common(args.max_words):
        roman = romanize_tamil(tamil)
        if not roman:
            continue
        prev = roman_map.get(roman)
        if prev is None or freq > prev[1]:
            roman_map[roman] = (tamil, freq)

    entries = [(t, r, freq) for r, (t, freq) in roman_map.items()]
    entries.sort(key=lambda x: x[2], reverse=True)

    if not entries:
        print("[CORPUS] No entries produced. Exiting.")
        sys.exit(1)

    print(f"[CORPUS] Unique romanizations: {len(entries)}")
    write_sql(args.output, entries, args.source_tag)
    print(f"[CORPUS] SQL written: {args.output}")


if __name__ == "__main__":
    main()
