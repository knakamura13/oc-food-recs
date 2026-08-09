#!/usr/bin/env python3
"""Read-only diagnostic: find likely duplicate restaurant pairs for manual audit.

Finds pairs within ~50m with fuzzy name similarity that are not already merged
(s separate slug rows). Does not write to the database.

Usage:
  python3 scripts/find_duplicate_candidates.py
  python3 scripts/find_duplicate_candidates.py --csv duplicates.csv
  python3 scripts/find_duplicate_candidates.py --min-score 0.80 --max-distance-m 75

Reads DATABASE_URL from env or .env (via db_backup).
"""
from __future__ import annotations

import csv
import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp


def _arg_value(flag: str) -> str | None:
    try:
        index = sys.argv.index(flag)
        return sys.argv[index + 1]
    except (ValueError, IndexError):
        return None


def _arg_float(flag: str, default: float) -> float:
    value = _arg_value(flag)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _distance_m(r1: dict[str, Any], r2: dict[str, Any]) -> float | None:
    distance = rp._coord_distance_deg(r1, r2)
    if distance is None:
        return None
    return distance * 111_000


def main() -> int:
    csv_path = _arg_value("--csv")
    min_score = _arg_float("--min-score", 0.75)
    max_distance_m = _arg_float("--max-distance-m", 50.0)
    max_distance_deg = max_distance_m / 111_000

    conn = b._connect()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, name, slug, location, lat, lng
        FROM restaurants
        WHERE lat IS NOT NULL AND lng IS NOT NULL
        ORDER BY id
        """
    )
    cols = [d[0] for d in cur.description]
    restaurants = [dict(zip(cols, row)) for row in cur.fetchall()]

    cur.execute("SELECT restaurant_id, COUNT(*) FROM mentions GROUP BY restaurant_id")
    mention_counts = dict(cur.fetchall())
    conn.close()

    pairs: list[dict[str, Any]] = []
    for i, r1 in enumerate(restaurants):
        for r2 in restaurants[i + 1 :]:
            distance = rp._coord_distance_deg(r1, r2)
            if distance is None or distance > max_distance_deg:
                continue
            score = rp._name_score(r1["name"], r2["name"])
            if score < min_score:
                continue
            if rp.is_match(r1, r2, all_restaurants=restaurants):
                continue
            pairs.append(
                {
                    "id_a": r1["id"],
                    "name_a": r1["name"],
                    "slug_a": r1["slug"],
                    "mentions_a": mention_counts.get(r1["id"], 0),
                    "id_b": r2["id"],
                    "name_b": r2["name"],
                    "slug_b": r2["slug"],
                    "mentions_b": mention_counts.get(r2["id"], 0),
                    "distance_m": round(_distance_m(r1, r2) or 0),
                    "name_score": round(score, 3),
                    "high_confidence": rp.is_high_confidence_match(
                        r1, r2, all_restaurants=restaurants
                    ),
                }
            )

    pairs.sort(key=lambda row: (-row["name_score"], row["distance_m"]))

    print(
        f"Found {len(pairs)} near-miss pair(s) "
        f"(score >= {min_score}, within {max_distance_m:.0f}m, not is_match)."
    )
    for row in pairs[:25]:
        print(
            f"  {row['distance_m']}m score={row['name_score']:.2f} "
            f"“{row['name_a']}” ({row['slug_a']}) vs "
            f"“{row['name_b']}” ({row['slug_b']})"
        )
    if len(pairs) > 25:
        print(f"  ... and {len(pairs) - 25} more")

    if csv_path:
        fieldnames = (
            list(pairs[0].keys())
            if pairs
            else [
                "id_a",
                "name_a",
                "slug_a",
                "mentions_a",
                "id_b",
                "name_b",
                "slug_b",
                "mentions_b",
                "distance_m",
                "name_score",
                "high_confidence",
            ]
        )
        with open(csv_path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(pairs)
        print(f"\nWrote {len(pairs)} row(s) to {csv_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
