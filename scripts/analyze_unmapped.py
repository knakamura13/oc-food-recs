#!/usr/bin/env python3
"""Read-only diagnostic: classify the unmapped-restaurant pool by failure mode.

Given the DB rows where lat/lng are NULL, prints how each restaurant looks to
the geocoder pipeline so we can decide what kind of fallback (if any) would
help.  No DB writes, no network calls.

Categories (each restaurant falls into one):
  CITY_OK           normalize_location(location) recognized a city → geocoder
                    tried with that city and just failed to find the place.
                    (No script-level fallback can help; either restaurant name
                    is wrong/closed/obscure, or it needs manual review.)
  SUBREDDIT_FALLBACK  location unrecognized but _subreddit_city(top_subreddit)
                    is a known OC city → would be picked up by regeocode's
                    existing subreddit-fallback retry.
  NO_CITY_SIGNAL    location unrecognized AND no usable subreddit hint
                    (top subreddit is r/orangecounty or absent) → would need
                    a name-only OC-bounded retry to have any chance.

Usage:
  python3 scripts/analyze_unmapped.py [--sample N]   # N example rows per category, default 10

Reads DATABASE_URL from env or .env (via db_backup).
"""
from __future__ import annotations
import sys, os
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp


def _arg_int(flag: str, default: int) -> int:
    """Tiny flag parser to avoid argparse for a one-shot script."""
    try:
        i = sys.argv.index(flag)
        return int(sys.argv[i + 1])
    except (ValueError, IndexError):
        return default


def main() -> int:
    sample_size = _arg_int("--sample", 10)

    conn = b._connect()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT r.id, r.name, r.location,
               (SELECT t.subreddit
                FROM mentions m
                JOIN threads t ON t.id = m.thread_id
                WHERE m.restaurant_id = r.id
                GROUP BY t.subreddit
                ORDER BY COUNT(*) DESC, t.subreddit
                LIMIT 1) AS top_subreddit
        FROM restaurants r
        WHERE r.lat IS NULL OR r.lng IS NULL
        ORDER BY r.id
        """
    )
    rows = cur.fetchall()
    conn.close()

    total = len(rows)
    print(f"unmapped restaurants: {total}\n")

    buckets: dict[str, list[tuple]] = {
        "CITY_OK": [],
        "SUBREDDIT_FALLBACK": [],
        "NO_CITY_SIGNAL": [],
    }
    sub_total: Counter[str] = Counter()
    sub_in_no_signal: Counter[str] = Counter()
    sub_in_fallback: Counter[str] = Counter()

    for rid, name, location, sub in rows:
        norm = rp.normalize_location(location)
        sub_city = rp._subreddit_city(sub) if sub else None
        sub_total[sub or "(none)"] += 1

        if norm:
            buckets["CITY_OK"].append((name, location, sub, norm))
        elif sub_city:
            buckets["SUBREDDIT_FALLBACK"].append((name, location, sub, sub_city))
            sub_in_fallback[sub or "(none)"] += 1
        else:
            buckets["NO_CITY_SIGNAL"].append((name, location, sub, None))
            sub_in_no_signal[sub or "(none)"] += 1

    print("breakdown by failure mode:")
    for cat, rows_ in buckets.items():
        pct = (100 * len(rows_) // total) if total else 0
        print(f"  {cat:<22s} {len(rows_):4d}  ({pct:>2d}%)")
    print()

    print("top subreddits across unmapped pool:")
    for sub, n in sub_total.most_common(15):
        mapped = "->" + (rp._subreddit_city(sub) or "(none)") if sub != "(none)" else "(no subreddit)"
        print(f"  {n:4d}  {sub:<25s} {mapped}")
    print()

    if sub_in_no_signal:
        print("subreddits driving NO_CITY_SIGNAL (these rows are unreachable today):")
        for sub, n in sub_in_no_signal.most_common(10):
            print(f"  {n:4d}  {sub}")
        print()

    for cat, rows_ in buckets.items():
        if not rows_:
            continue
        print(f"=== sample {cat} (first {min(sample_size, len(rows_))} of {len(rows_)}) ===")
        for name, location, sub, hint in rows_[:sample_size]:
            print(
                f"  name={name!r:<40s}  "
                f"location={(location or '')!r:<25s}  "
                f"r/{sub or '?':<18s}  "
                f"hint={hint!r}"
            )
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
