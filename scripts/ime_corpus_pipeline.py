#!/usr/bin/env python3
"""
IME corpus pipeline (offline).

Turns Tamil text corpora into TSV seed files used by the IME suggest system:
- seed_words.tsv:  "word<TAB>frequency"
- seed_phrases.tsv:"phrase<TAB>frequency"  (2-3 grams by default)
- seed_bigrams.tsv:"word<TAB>next_word<TAB>frequency"

This script is intentionally dependency-free (std lib only).

Usage:
  python scripts/ime_corpus_pipeline.py \
    --input path/to/corpus.txt \
    --outdir data \
    --top-words 50000 \
    --top-bigrams 200000 \
    --top-phrases 50000
"""

from __future__ import annotations

import argparse
import collections
import os
import re
from typing import Iterable, List, Tuple


TAMIL_TOKEN_RE = re.compile(r"[\u0B80-\u0BFF]+")


def iter_tokens(paths: List[str]) -> Iterable[str]:
    for p in paths:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                for tok in TAMIL_TOKEN_RE.findall(line):
                    if tok:
                        yield tok


def write_tsv(path: str, rows: Iterable[Tuple[str, int]], header: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(header.strip() + "\n")
        for k, v in rows:
            f.write(f"{k}\t{v}\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", action="append", required=True, help="Input corpus text file (repeatable)")
    ap.add_argument("--outdir", default="data", help="Output directory (default: data)")
    ap.add_argument("--top-words", type=int, default=50_000)
    ap.add_argument("--top-bigrams", type=int, default=200_000)
    ap.add_argument("--top-phrases", type=int, default=50_000)
    ap.add_argument("--phrase-n", type=int, default=3, help="Max phrase length in tokens (2..4 recommended)")
    args = ap.parse_args()

    if args.phrase_n < 2:
        raise SystemExit("--phrase-n must be >= 2")

    unigram = collections.Counter()
    bigram = collections.Counter()
    phrase = collections.Counter()

    prev = None
    window: List[str] = []

    for tok in iter_tokens(args.input):
        unigram[tok] += 1

        if prev is not None:
            bigram[(prev, tok)] += 1
        prev = tok

        # rolling window for phrases
        window.append(tok)
        if len(window) > args.phrase_n:
            window.pop(0)

        # record 2..N-grams ending at current token
        for n in range(2, min(len(window), args.phrase_n) + 1):
            g = " ".join(window[-n:])
            phrase[g] += 1

    outdir = args.outdir
    write_tsv(
        os.path.join(outdir, "seed_words.tsv"),
        ((w, c) for w, c in unigram.most_common(args.top_words)),
        "# word\tfrequency",
    )
    write_tsv(
        os.path.join(outdir, "seed_bigrams.tsv"),
        ((f"{a}\t{b}", c) for (a, b), c in bigram.most_common(args.top_bigrams)),
        "# word\tnext_word\tfrequency",
    )

    # write phrases as "phrase<TAB>freq"
    phrase_rows = phrase.most_common(args.top_phrases)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "seed_phrases.tsv"), "w", encoding="utf-8") as f:
        f.write("# phrase\tfrequency\n")
        for ph, c in phrase_rows:
            f.write(f"{ph}\t{c}\n")

    print(f"Wrote: {outdir}/seed_words.tsv, {outdir}/seed_bigrams.tsv, {outdir}/seed_phrases.tsv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


