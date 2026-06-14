#!/usr/bin/env python3
"""
Audit comment_date coverage in the mentions table.

Reports NULL vs populated counts and breakdown by comment_id prefix (migrated-* legacy rows).

Run:
    DATABASE_URL=postgres://... python3 scripts/audit_comment_dates.py
"""
from __future__ import annotations

import os
import sys

try:
    import psycopg
except ImportError:
    print(
        "psycopg is not installed. Run: pip install 'psycopg[binary]>=3.2'",
        file=sys.stderr,
    )
    sys.exit(1)


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM mentions")
            total = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM mentions WHERE comment_date IS NOT NULL")
            populated = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*) FROM mentions
                WHERE comment_date IS NULL AND comment_id LIKE 'migrated-%'
                """
            )
            migrated_null = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*) FROM mentions
                WHERE comment_date IS NULL AND comment_id NOT LIKE 'migrated-%'
                """
            )
            backfillable_null = cur.fetchone()[0]

    null_count = total - populated
    print(f"mentions total:           {total}")
    print(f"comment_date populated:   {populated}")
    print(f"comment_date NULL:        {null_count}")
    print(f"  migrated-* (expected):  {migrated_null}")
    print(f"  backfillable NULL:      {backfillable_null}")
    if total:
        pct = 100 * populated // total
        print(f"coverage:                 {pct}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
