#!/usr/bin/env python3
"""Seed / refresh the ``excluded_brands`` registry from scripts/exclusions_seed.json.

Idempotent: upserts on ``normalized_name`` (= normalize_name(brand_name)), so re-running
just refreshes reason/group_name and adds any new brands. It never deletes rows you added
via the admin UI.

Usage:
  python3 scripts/seed_exclusions.py            # upsert seed rows into the DB
  python3 scripts/seed_exclusions.py --dry-run  # print what would be loaded, write nothing
"""
import json
import os
import sys
from pathlib import Path
from typing import Any

# Ensure we can import sibling scripts.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp

SEED_PATH = Path(__file__).resolve().parent / "exclusions_seed.json"


def load_seed() -> list[dict[str, Any]]:
    """Parse the seed file into normalized, de-duplicated registry rows."""
    data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    brands = data.get("brands", []) if isinstance(data, dict) else data
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in brands:
        name = (entry.get("brand_name") or "").strip()
        if not name:
            continue
        norm = rp.normalize_name(name)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        rows.append(
            {
                "brand_name": name,
                "reason": entry.get("reason") or "chain",
                "group_name": entry.get("group_name"),
                "normalized_name": norm,
            }
        )
    return rows


def main() -> int:
    dry_run = "--dry-run" in sys.argv[1:]
    rows = load_seed()
    print(f"Loaded {len(rows)} brands from {SEED_PATH.name}")

    if dry_run:
        for r in rows:
            group = f"  ({r['group_name']})" if r["group_name"] else ""
            print(f"  {r['reason']:16} {r['brand_name']}{group}")
        print("\n(dry run -- run without --dry-run to upsert)")
        return 0

    try:
        conn = b._connect()
    except SystemExit:
        print("DATABASE_URL not set or connection failed. Skipping DB operations.")
        return 0

    with conn.cursor() as cur:
        for r in rows:
            cur.execute(
                """
                INSERT INTO excluded_brands (brand_name, reason, group_name, normalized_name)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (normalized_name) DO UPDATE SET
                    brand_name = EXCLUDED.brand_name,
                    reason = EXCLUDED.reason,
                    group_name = EXCLUDED.group_name
                """,
                (r["brand_name"], r["reason"], r["group_name"], r["normalized_name"]),
            )
    conn.commit()
    conn.close()
    print(f"Upserted {len(rows)} brands into excluded_brands.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
