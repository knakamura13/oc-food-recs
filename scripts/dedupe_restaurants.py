#!/usr/bin/env python3
"""Deduplicate restaurants in the database by merging similar entries.

Usage:
  python3 scripts/dedupe_restaurants.py                         # dry run (high-confidence only)
  python3 scripts/dedupe_restaurants.py --apply                 # merge high-confidence groups
  python3 scripts/dedupe_restaurants.py --min-confidence all    # merge all is_match groups
  python3 scripts/dedupe_restaurants.py --apply --min-confidence all
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from typing import Any

import tqdm

# Ensure we can import from the scripts directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp


def get_connected_components(
    nodes: list[int], adjacency: dict[int, list[int]]
) -> list[list[int]]:
    return rp.get_connected_components(nodes, adjacency)


def _merge_winner_fields(
    winner: dict[str, Any], loser: dict[str, Any]
) -> dict[str, Any]:
    """Apply upsert-equivalent field merge rules from loser onto winner."""
    merged = dict(winner)
    if len(loser["name"]) > len(merged["name"]):
        merged["name"] = loser["name"]
    for field in ("location", "cuisine", "lat", "lng"):
        if merged.get(field) is None and loser.get(field) is not None:
            merged[field] = loser[field]
    return merged


def _pair_matches(
    r1: dict[str, Any],
    r2: dict[str, Any],
    *,
    all_restaurants: list[dict[str, Any]],
    min_confidence: str,
) -> bool:
    if min_confidence == "all":
        return rp.is_match(r1, r2, all_restaurants=all_restaurants)
    return rp.is_high_confidence_match(r1, r2, all_restaurants=all_restaurants)


def _group_confidence(
    group: list[int],
    id_to_restaurant: dict[int, dict[str, Any]],
    all_restaurants: list[dict[str, Any]],
) -> str:
    members = [id_to_restaurant[rid] for rid in group]
    for i, r1 in enumerate(members):
        for r2 in members[i + 1 :]:
            if not rp.is_high_confidence_match(r1, r2, all_restaurants=all_restaurants):
                return "low"
    return "high"


def _format_distance(r1: dict[str, Any], r2: dict[str, Any]) -> str:
    distance = rp._coord_distance_deg(r1, r2)
    if distance is None:
        return "n/a"
    meters = distance * 111_000
    return f"{meters:.0f}m"


def _print_group_summary(
    group: list[int],
    id_to_restaurant: dict[int, dict[str, Any]],
    mention_counts: dict[int, int],
    confidence: str,
) -> None:
    def winner_key(rid: int) -> tuple[int, int, int]:
        r = id_to_restaurant[rid]
        return (mention_counts.get(rid, 0), len(r["name"]), -rid)

    sorted_group = sorted(group, key=winner_key, reverse=True)
    winner_id = sorted_group[0]
    winner = id_to_restaurant[winner_id]
    losers = [id_to_restaurant[rid] for rid in sorted_group[1:]]

    print(
        f"\n  [{confidence}] keep id={winner_id} “{winner['name']}” ({mention_counts.get(winner_id, 0)} mentions)"
    )
    for loser in losers:
        print(
            f"      merge id={loser['id']} “{loser['name']}” "
            f"({mention_counts.get(loser['id'], 0)} mentions, "
            f"dist={_format_distance(winner, loser)}, "
            f"score={rp._name_score(winner['name'], loser['name']):.2f})"
        )


def _flag_duplicate_candidates(cur: Any, restaurant_ids: list[int]) -> None:
    if not restaurant_ids:
        return
    cur.execute(
        """
        UPDATE restaurants
        SET status = 'pending_review',
            exclusion_reason = 'duplicate_candidate',
            updated_at = now()
        WHERE id = ANY(%s)
          AND status = 'active'
          AND reviewed_at IS NULL
        """,
        (restaurant_ids,),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Deduplicate restaurants in Postgres.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write merges (and pending_review flags) to the DB.",
    )
    parser.add_argument(
        "--min-confidence",
        choices=("high", "all"),
        default="high",
        help="Merge only high-confidence groups (default) or all is_match groups.",
    )
    args = parser.parse_args()

    try:
        conn = b._connect()
    except SystemExit:
        print("DATABASE_URL not set or connection failed. Skipping DB operations.")
        return 0
    cur = conn.cursor()

    cur.execute(
        "SELECT id, name, slug, location, cuisine, lat, lng FROM restaurants ORDER BY id"
    )
    cols = [d[0] for d in cur.description]
    restaurants = [dict(zip(cols, r)) for r in cur.fetchall()]
    id_to_restaurant = {r["id"]: r for r in restaurants}

    cur.execute("SELECT restaurant_id, COUNT(*) FROM mentions GROUP BY restaurant_id")
    mention_counts = dict(cur.fetchall())

    print(f"Checking {len(restaurants)} restaurants for duplicates...")

    adjacency: dict[int, list[int]] = defaultdict(list)
    for i, r1 in tqdm.tqdm(
        enumerate(restaurants),
        total=len(restaurants),
        desc="Comparing",
        unit="restaurant",
    ):
        for j in range(i + 1, len(restaurants)):
            r2 = restaurants[j]
            if _pair_matches(
                r1,
                r2,
                all_restaurants=restaurants,
                min_confidence=args.min_confidence,
            ):
                adjacency[r1["id"]].append(r2["id"])
                adjacency[r2["id"]].append(r1["id"])

    components = get_connected_components([r["id"] for r in restaurants], adjacency)
    groups = [c for c in components if len(c) > 1]

    if not groups:
        print("No duplicates found.")
        conn.close()
        return 0

    high_groups: list[list[int]] = []
    low_groups: list[list[int]] = []
    for group in groups:
        confidence = _group_confidence(group, id_to_restaurant, restaurants)
        if confidence == "high":
            high_groups.append(group)
        else:
            low_groups.append(group)

    print(
        f"\nFound {len(groups)} duplicate group(s): {len(high_groups)} high-confidence, {len(low_groups)} for review."
    )

    merges: list[tuple[int, int]] = []
    for group in high_groups:
        _print_group_summary(group, id_to_restaurant, mention_counts, "high")

        def winner_key(rid: int) -> tuple[int, int, int]:
            r = id_to_restaurant[rid]
            return (mention_counts.get(rid, 0), len(r["name"]), -rid)

        sorted_group = sorted(group, key=winner_key, reverse=True)
        winner_id = sorted_group[0]
        for rid in sorted_group[1:]:
            merges.append((rid, winner_id))

    for group in low_groups:
        _print_group_summary(group, id_to_restaurant, mention_counts, "review")

    if not args.apply:
        if low_groups:
            print(
                f"\n{len(low_groups)} low-confidence group(s) would be flagged pending_review on --apply."
            )
        print("\n(dry run -- pass --apply to write changes to the DB)")
        conn.close()
        return 0

    if low_groups:
        review_ids = sorted({rid for group in low_groups for rid in group})
        _flag_duplicate_candidates(cur, review_ids)
        print(
            f"\nFlagged {len(review_ids)} restaurant(s) as duplicate_candidate for admin review."
        )

    if not merges:
        conn.commit()
        conn.close()
        print("\nNo high-confidence merges to apply.")
        return 0

    print(f"\nApplying {len(merges)} high-confidence merge(s)...")
    winner_fields = {r["id"]: dict(r) for r in restaurants}
    for loser_id, winner_id in tqdm.tqdm(merges, desc="Merging", unit="restaurant"):
        loser = id_to_restaurant[loser_id]
        winner_fields[winner_id] = _merge_winner_fields(winner_fields[winner_id], loser)

        cur.execute(
            """
            DELETE FROM mentions m1
            WHERE restaurant_id = %s
            AND EXISTS (
                SELECT 1 FROM mentions m2
                WHERE m2.restaurant_id = %s
                AND m2.thread_id = m1.thread_id
                AND m2.comment_id = m1.comment_id
            )
            """,
            (loser_id, winner_id),
        )

        cur.execute(
            "UPDATE mentions SET restaurant_id = %s WHERE restaurant_id = %s",
            (winner_id, loser_id),
        )

        cur.execute("DELETE FROM restaurants WHERE id = %s", (loser_id,))

    for winner_id in {winner for _, winner in merges}:
        fields = winner_fields[winner_id]
        cur.execute(
            """
            UPDATE restaurants
            SET name = CASE WHEN length(%s) > length(name) THEN %s ELSE name END,
                location = COALESCE(location, %s),
                cuisine = COALESCE(cuisine, %s),
                lat = COALESCE(lat, %s),
                lng = COALESCE(lng, %s),
                updated_at = now()
            WHERE id = %s
            """,
            (
                fields["name"],
                fields["name"],
                fields.get("location"),
                fields.get("cuisine"),
                fields.get("lat"),
                fields.get("lng"),
                winner_id,
            ),
        )

    conn.commit()
    conn.close()
    print("\nDeduplication complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
