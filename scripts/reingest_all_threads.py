#!/usr/bin/env python3
"""Rebuild the live ingest tables from saved Reddit thread HTML files.

Usage:
  python3 scripts/reingest_all_threads.py --dry-run
  python3 scripts/reingest_all_threads.py --yes
  python3 scripts/reingest_all_threads.py --yes --limit 5

Steps (when not dry-run):
  1. Back up threads, restaurants, and mentions via db_backup.backup()
  2. TRUNCATE the three ingest tables
  3. Re-run reddit_pipeline.ingest() for every *.html in data/threads/, or
     data/uningested-threads/ when the threads archive is empty

If ingest fails after the purge, processing stops and the backup path is printed
so you can restore with:
  python3 scripts/db_backup.py restore data/backups/db-backup-<timestamp>.json
"""
from __future__ import annotations

import argparse
import os
import sys
import tqdm
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp

ROOT = Path(__file__).resolve().parents[1]
THREADS_ROOT = ROOT / "data" / "threads"
UNINGESTED_ROOT = ROOT / "data" / "uningested-threads"
PURGE_SQL = "TRUNCATE mentions, restaurants, threads RESTART IDENTITY CASCADE"


def discover_html_files(
    threads_root: Path = THREADS_ROOT,
    uningested_root: Path = UNINGESTED_ROOT,
) -> tuple[list[Path], Path]:
    """Return sorted HTML files and the directory they came from.

    Prefer the flat archive in data/threads/. When that directory has no HTML
    files, fall back to data/uningested-threads/.
    """
    thread_files = sorted(threads_root.glob("*.html"))
    if thread_files:
        return thread_files, threads_root

    uningested_files = sorted(uningested_root.glob("*.html"))
    if uningested_files:
        return uningested_files, uningested_root

    return [], threads_root


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
    uningested_root: Path | None = None,
    limit: int | None = None,
    dry_run: bool = False,
    confirmed: bool = False,
) -> int:
    """Back up, purge, and re-ingest every archived thread HTML file."""
    resolved_threads_root = threads_root if threads_root is not None else THREADS_ROOT
    resolved_uningested_root = (
        uningested_root if uningested_root is not None else UNINGESTED_ROOT
    )
    html_files, source_root = discover_html_files(
        resolved_threads_root,
        resolved_uningested_root,
    )

    if not html_files:
        print(
            f"No .html files found in {resolved_threads_root} "
            f"or {resolved_uningested_root}."
        )
    else:
        if source_root == resolved_uningested_root:
            print(
                f"No .html files found in {resolved_threads_root}; "
                f"using {resolved_uningested_root} instead."
            )
        print(f"Found {len(html_files)} thread HTML file(s) in {source_root}:")
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
    pbar = tqdm.tqdm(html_files, desc="Re-ingesting", unit="thread")
    for index, html_path in enumerate(pbar, start=1):
        pbar.set_postfix_str(html_path.name)
        try:
            rp.ingest(html_path, limit=limit)
        except Exception as exc:  # noqa: BLE001
            pbar.close()
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

    if html_files:
        print(
            f"\nRe-ingest complete: {len(successes)}/{len(html_files)} thread(s). "
            f"Backup: {backup_path}"
        )
    else:
        print(
            f"\nRe-ingest complete: database rebuilt with no thread HTML to ingest. "
            f"Backup: {backup_path}"
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Rebuild ingest tables from data/threads/*.html, "
            "or data/uningested-threads/*.html when the archive is empty"
        )
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
