#!/usr/bin/env python3
"""Rebuild the live ingest tables from the flat HTML archive in data/threads.

Usage:
  python3 scripts/reingest_all_threads.py --dry-run
  python3 scripts/reingest_all_threads.py --yes
  python3 scripts/reingest_all_threads.py --yes --limit 5

Steps (when not dry-run):
  1. Back up threads, restaurants, and mentions via db_backup.backup()
  2. TRUNCATE the three ingest tables
  3. Re-run reddit_pipeline.ingest() for every *.html in data/threads/

If ingest fails after the purge, processing stops and the backup path is printed
so you can restore with:
  python3 scripts/db_backup.py restore data/backups/db-backup-<timestamp>.json
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp

ROOT = Path(__file__).resolve().parents[1]
THREADS_ROOT = ROOT / "data" / "threads"
PURGE_SQL = "TRUNCATE mentions, restaurants, threads RESTART IDENTITY CASCADE"


def discover_html_files(threads_root: Path = THREADS_ROOT) -> list[Path]:
    """Return sorted HTML files from the flat thread archive."""
    return sorted(threads_root.glob("*.html"))


def purge_ingest_tables() -> None:
    """Remove all rows from threads, restaurants, and mentions."""
    conn = b._connect()
    try:
        with conn.cursor() as cur:
            cur.execute(PURGE_SQL)
        conn.commit()
    finally:
        conn.close()


def reingest_all(
    *,
    threads_root: Path | None = None,
    limit: int | None = None,
    dry_run: bool = False,
    confirmed: bool = False,
) -> int:
    """Back up, purge, and re-ingest every archived thread HTML file."""
    archive_root = threads_root if threads_root is not None else THREADS_ROOT
    html_files = discover_html_files(archive_root)
    if not html_files:
        print(f"No .html files found in {threads_root}", file=sys.stderr)
        return 1

    print(f"Found {len(html_files)} thread HTML file(s) in {archive_root}:")
    for path in html_files:
        print(f"  {path.name}")

    if dry_run:
        print("Dry run — no backup, purge, or ingest performed.")
        return 0

    if not confirmed:
        print("Refusing to modify the database without --yes.", file=sys.stderr)
        return 2

    print("\nCreating database backup...")
    backup_path = b.backup()
    print(f"Backup saved: {backup_path}")

    print("\nPurging ingest tables...")
    purge_ingest_tables()
    print("Purge complete.")

    os.environ["DATABASE_URL"] = b._url()

    successes: list[str] = []
    for index, html_path in enumerate(html_files, start=1):
        print(f"\n[{index}/{len(html_files)}] Ingesting {html_path.name}...")
        try:
            rp.ingest(html_path, limit=limit)
        except Exception as exc:  # noqa: BLE001
            print(
                f"\nERROR ingesting {html_path.name}: {exc}",
                file=sys.stderr,
            )
            print(
                f"\nIngest stopped after {len(successes)} success(es). "
                f"Restore from backup:\n"
                f"  python3 scripts/db_backup.py restore {backup_path}",
                file=sys.stderr,
            )
            return 1

        successes.append(html_path.name)
        print(f"  OK: {html_path.name}")

    print(
        f"\nRe-ingest complete: {len(successes)}/{len(html_files)} thread(s). "
        f"Backup: {backup_path}"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild ingest tables from data/threads/*.html"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List archived HTML files without backup, purge, or ingest",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required to perform backup, purge, and ingest",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process only the first N top-level comments per thread (testing)",
    )
    args = parser.parse_args(argv)

    return reingest_all(
        limit=args.limit,
        dry_run=args.dry_run,
        confirmed=args.yes,
    )


if __name__ == "__main__":
    sys.exit(main())
