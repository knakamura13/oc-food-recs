#!/usr/bin/env python3
"""
Backfill comment_date for existing mentions rows by re-parsing the raw HTML thread files.

The HTML parser extracts the `created` attribute from <shreddit-comment> tags, which is
an ISO 8601 timestamp matching Reddit's publish time.  The DB `comment_id` for HTML-parsed
threads uses the full `thingid` (e.g. `t1_abc123`), so the lookup is a direct match.

Rows with `migrated-*` comment_ids are legacy endorsements that never had a timestamp
in the source data — they will remain NULL after this run.

Run:
    DATABASE_URL=postgres://... python3 scripts/backfill_comment_dates.py

Dry-run (print stats without writing):
    DATABASE_URL=postgres://... python3 scripts/backfill_comment_dates.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("beautifulsoup4 is not installed. Run: pip install beautifulsoup4", file=sys.stderr)
    sys.exit(1)

try:
    import psycopg
except ImportError:
    print("psycopg is not installed. Run: pip install 'psycopg[binary]>=3.2'", file=sys.stderr)
    sys.exit(1)

THREADS_ROOT = Path(__file__).parent.parent / "data" / "threads"


def parse_comment_date(created_utc: Any) -> datetime | None:
    """Convert a Reddit created_utc value (Unix float or ISO 8601 string) to a tz-aware datetime."""
    if not created_utc:
        return None
    val = str(created_utc).strip()
    if not val:
        return None
    try:
        return datetime.fromtimestamp(float(val), tz=timezone.utc)
    except (ValueError, OSError, OverflowError):
        pass
    try:
        return datetime.fromisoformat(val.replace('+0000', '+00:00').replace('Z', '+00:00'))
    except ValueError:
        return None


def extract_dates_from_html(html_path: Path) -> dict[str, datetime]:
    """Return a mapping of comment_id → publish datetime parsed from a thread HTML file."""
    soup = BeautifulSoup(html_path.read_text(encoding='utf-8', errors='replace'), 'html.parser')
    result: dict[str, datetime] = {}
    for tag in soup.find_all('shreddit-comment'):
        thingid = tag.get('thingid', '')
        created = tag.get('created', '')
        if not thingid or not created:
            continue
        dt = parse_comment_date(created)
        if dt:
            result[thingid] = dt
    return result


def collect_html_files() -> list[Path]:
    """
    Find all raw HTML thread files.  Two layouts are supported:
      - data/threads/<id>.html              (flat, older ingests)
      - data/threads/<id>/raw/thread.html   (folder-based, newer ingests)
    """
    files: list[Path] = []
    for entry in THREADS_ROOT.iterdir():
        if entry.is_file() and entry.suffix == '.html':
            files.append(entry)
        elif entry.is_dir():
            candidate = entry / 'raw' / 'thread.html'
            if candidate.exists():
                files.append(candidate)
    return files


def build_date_map() -> dict[str, datetime]:
    """Parse all available HTML files and merge into one comment_id → datetime map."""
    html_files = collect_html_files()
    date_map: dict[str, datetime] = {}
    for path in html_files:
        dates = extract_dates_from_html(path)
        date_map.update(dates)
        print(f'  {path.name}: {len(dates)} timestamps extracted')
    return date_map


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='Print stats without writing to DB')
    args = parser.parse_args()

    database_url = __import__('os').environ.get('DATABASE_URL')
    if not database_url:
        print('DATABASE_URL is not set', file=sys.stderr)
        return 1

    print('Building comment_id → date map from HTML files...')
    date_map = build_date_map()
    print(f'Total unique comment timestamps found: {len(date_map)}')

    if not date_map:
        print('No timestamps found — nothing to do.')
        return 0

    if args.dry_run:
        print('Dry run — skipping DB writes.')
        return 0

    print('\nConnecting to database...')
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            # Fetch all mentions that still lack a comment_date.
            cur.execute('SELECT id, comment_id FROM mentions WHERE comment_date IS NULL')
            rows = cur.fetchall()
            print(f'Mentions with NULL comment_date: {len(rows)}')

            updated = 0
            skipped = 0
            for mention_id, comment_id in rows:
                dt = date_map.get(comment_id)
                if dt is None:
                    skipped += 1
                    continue
                cur.execute(
                    'UPDATE mentions SET comment_date = %s WHERE id = %s',
                    (dt, mention_id),
                )
                updated += 1

        conn.commit()

    print(f'\nDone:  {updated} rows updated,  {skipped} rows left NULL (legacy migrated-* IDs or missing HTML)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
