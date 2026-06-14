#!/usr/bin/env python3
"""
Backfill permalink for existing mentions rows by re-parsing raw HTML thread files.

The HTML parser reads the `permalink` attribute from <shreddit-comment> tags.

Run:
    DATABASE_URL=postgres://... python3 scripts/backfill_permalinks.py

Dry-run:
    DATABASE_URL=postgres://... python3 scripts/backfill_permalinks.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print(
        "beautifulsoup4 is not installed. Run: pip install beautifulsoup4",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    import psycopg
    import tqdm
except ImportError:
    print(
        "psycopg and tqdm required. Run: pip install 'psycopg[binary]>=3.2' tqdm",
        file=sys.stderr,
    )
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from backfill_comment_dates import collect_html_files  # noqa: E402


def extract_permalinks_from_html(html_path: Path) -> dict[str, str]:
    soup = BeautifulSoup(
        html_path.read_text(encoding="utf-8", errors="replace"), "html.parser"
    )
    result: dict[str, str] = {}
    for tag in soup.find_all("shreddit-comment"):
        thingid = tag.get("thingid", "")
        permalink = tag.get("permalink", "")
        if not thingid or not permalink:
            continue
        url = (
            permalink
            if permalink.startswith("http")
            else f"https://www.reddit.com{permalink}"
        )
        result[thingid] = url
    return result


def build_permalink_map() -> dict[str, str]:
    permalink_map: dict[str, str] = {}
    for path in tqdm.tqdm(collect_html_files(), desc="Parsing HTML", unit="file"):
        permalink_map.update(extract_permalinks_from_html(path))
    return permalink_map


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="Print stats without writing to DB"
    )
    args = parser.parse_args()

    database_url = __import__("os").environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1

    print("Building comment_id → permalink map from HTML files...")
    permalink_map = build_permalink_map()
    print(f"Total unique permalinks found: {len(permalink_map)}")

    if not permalink_map:
        print("No permalinks found — nothing to do.")
        return 0

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, comment_id FROM mentions WHERE permalink IS NULL")
            rows = cur.fetchall()
            print(f"Mentions with NULL permalink: {len(rows)}")

            if args.dry_run:
                would_update = sum(1 for _, cid in rows if cid in permalink_map)
                print(f"Dry run — would update {would_update} rows.")
                return 0

            updated = 0
            skipped = 0
            for mention_id, comment_id in tqdm.tqdm(
                rows, desc="Updating DB", unit="row"
            ):
                url = permalink_map.get(comment_id)
                if url is None:
                    skipped += 1
                    continue
                cur.execute(
                    "UPDATE mentions SET permalink = %s WHERE id = %s",
                    (url, mention_id),
                )
                updated += 1
        conn.commit()

    print(f"\nDone: {updated} rows updated, {skipped} rows left NULL")
    return 0


if __name__ == "__main__":
    sys.exit(main())
