#!/usr/bin/env python3
"""
Explore Tamil Wikipedia stub-meta-history XML dump.

Stub-meta-history contains: page titles, revision metadata (id, timestamp, contributor, etc.),
but NOT the actual page content. So we can extract page titles (good for vocabulary)
without processing full article text.

Usage:
  python scripts/explore_tawiki_stub_meta_history.py "tawiki-latest-stub-meta-history 2.xml"
  python scripts/explore_tawiki_stub_meta_history.py tawiki-latest-stub-meta-history1.xml.gz --sample 50
  python scripts/explore_tawiki_stub_meta_history.py tawiki-*.xml --output titles.csv --main-namespace-only
"""

import argparse
import gzip
import bz2
import os
import re
import sys
from xml.etree import ElementTree as ET

# Tamil Unicode range (optional: filter titles that contain Tamil)
TAMIL_RE = re.compile(r"[\u0B80-\u0BFF]+")


def open_maybe_compressed(path: str):
    if path.endswith(".bz2"):
        return bz2.open(path, "rt", encoding="utf-8", errors="replace")
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "rt", encoding="utf-8", errors="replace")


def _get_title_and_ns(page_elem):
    """Extract title and namespace from a <page> element (namespace-agnostic)."""
    title, ns_val = "", 0
    for e in page_elem.iter():
        if e.tag.endswith("}title") or e.tag == "title":
            if e.text:
                title = e.text.strip()
        if e.tag.endswith("}ns") or e.tag == "ns":
            if e.text:
                try:
                    ns_val = int(e.text)
                except ValueError:
                    pass
    return (ns_val, title)


def iter_pages(filepath: str):
    """Stream pages from a stub-meta-history XML file. Yields (namespace, title)."""
    with open_maybe_compressed(filepath) as f:
        for _event, elem in ET.iterparse(f, events=("end",)):
            if elem.tag.endswith("page") or elem.tag == "page":
                ns_val, title = _get_title_and_ns(elem)
                yield (ns_val, title)
            elem.clear()


def main():
    parser = argparse.ArgumentParser(
        description="Explore tawiki stub-meta-history XML: list page titles and optionally export for tamil_words import."
    )
    parser.add_argument(
        "file",
        nargs="?",
        default=None,
        help="Path to tawiki-latest-stub-meta-history*.xml or .xml.gz or .xml.bz2",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=20,
        help="Number of sample titles to print (default 20)",
    )
    parser.add_argument(
        "--main-namespace-only",
        action="store_true",
        help="Only include main namespace (ns=0) pages",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Write titles to CSV: tamil_text,transliteration (for import-tamil-words). Transliteration = title with spaces to underscores, lowercased.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max pages to process (0 = no limit)",
    )
    args = parser.parse_args()

    path = args.file
    if not path or not os.path.isfile(path):
        print("Usage: python explore_tawiki_stub_meta_history.py <path-to-stub-meta-history.xml>", file=sys.stderr)
        print("  File not found or not given. Use full path, e.g.:", file=sys.stderr)
        print('  python scripts/explore_tawiki_stub_meta_history.py "/path/to/tawiki-latest-stub-meta-history 2.xml"', file=sys.stderr)
        sys.exit(1)

    print(f"[EXPLORE] Reading: {path}")
    print("[EXPLORE] Format: stub-meta-history = page titles + revision metadata (no article text)")
    print()

    samples = []
    total = 0
    ns_counts = {}
    titles_with_tamil = 0
    out_rows = []

    for ns_val, title in iter_pages(path):
        if not title:
            continue
        if args.main_namespace_only and ns_val != 0:
            continue
        total += 1
        ns_counts[ns_val] = ns_counts.get(ns_val, 0) + 1
        if TAMIL_RE.search(title):
            titles_with_tamil += 1
        if len(samples) < args.sample:
            samples.append((ns_val, title))
        if args.output:
            # Transliteration for CSV: title with spaces, lowercased; tamil_text = title with _ -> space
            tamil_display = title.replace("_", " ")
            translit = tamil_display.lower().replace(" ", "_")
            out_rows.append((tamil_display, translit))
        if args.limit and total >= args.limit:
            break

    print(f"[EXPLORE] Total pages: {total}")
    print(f"[EXPLORE] Namespaces: {dict(sorted(ns_counts.items()))}")
    print(f"[EXPLORE] Titles containing Tamil script: {titles_with_tamil}")
    print()
    print(f"[EXPLORE] Sample titles (first {len(samples)}):")
    for ns_val, title in samples:
        display = title.replace("_", " ")
        print(f"  ns={ns_val}  {display[:60]}")
    print()

    if args.output and out_rows:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write("tamil_text,transliteration\n")
            for tamil, translit in out_rows:
                tamil_esc = tamil.replace('"', '""')
                translit_esc = translit.replace('"', '""')
                f.write(f'"{tamil_esc}","{translit_esc}"\n')
        print(f"[EXPLORE] Wrote {len(out_rows)} titles to {args.output}")
        print("  Import with: go run ./cmd/import-tamil-words -file=" + args.output + " -format=csv -source=tawiki_stub")


if __name__ == "__main__":
    main()
