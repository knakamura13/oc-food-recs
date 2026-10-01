#!/usr/bin/env python3
"""Backfill `mentions.names_restaurant` for existing rows.

For every mention, sets the column to whether the comment body names the restaurant
(`reddit_pipeline.names_restaurant`, a port of `namesRestaurant()` in
src/lib/restaurants/top-comment-snippet.ts). Idempotent: only rows whose stored value
differs from the computed one are written, so it is also safe to re-run after the
stoplist changes.

Usage:
  python3 scripts/backfill_names_restaurant.py            # dry run: counts only, no writes
  python3 scripts/backfill_names_restaurant.py --apply    # write changes

Reads DATABASE_URL from environment or .env (via db_backup).
"""
from __future__ import annotations
import argparse, os, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

UPDATE_BATCH = 1000


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = ap.parse_args()

    import db_backup as b
    import reddit_pipeline as rp

    conn = b._connect()
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'mentions' AND column_name = 'names_restaurant'"
    )
    has_column = cur.fetchone() is not None
    if not has_column and args.apply:
        sys.exit("mentions.names_restaurant does not exist: run `npm run db:migrate` first")
    current_expr = "m.names_restaurant" if has_column else "NULL::boolean"
    cur.execute(
        f"SELECT m.id, m.role, m.body, {current_expr}, r.name "
        "FROM mentions m JOIN restaurants r ON r.id = m.restaurant_id ORDER BY m.id"
    )
    counts: Counter = Counter()
    changes: list[tuple[bool, int]] = []
    for mid, role, body, current, name in cur.fetchall():
        value = rp.names_restaurant(body or "", name)
        counts[(role, value)] += 1
        if current is not value:
            changes.append((value, mid))

    print("mentions by role / names_restaurant (computed):")
    for role in sorted({r for r, _ in counts}):
        print(f"  {role:12s} true={counts[(role, True)]:5d}  false={counts[(role, False)]:5d}")
    print(f"  {'total':12s} true={sum(v for (_, t), v in counts.items() if t):5d}  "
          f"false={sum(v for (_, t), v in counts.items() if not t):5d}")
    print(f"rows needing a write: {len(changes)}")

    if not args.apply:
        print("dry run: no changes written (pass --apply to write)")
        return 0

    for i in range(0, len(changes), UPDATE_BATCH):
        cur.executemany(
            "UPDATE mentions SET names_restaurant = %s WHERE id = %s",
            changes[i : i + UPDATE_BATCH],
        )
    conn.commit()
    print(f"applied: {len(changes)} rows updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
