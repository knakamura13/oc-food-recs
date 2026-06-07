#!/usr/bin/env python3
"""Deduplicate restaurants in the database by merging similar entries.

Usage:
  python3 scripts/dedupe_restaurants.py            # dry run
  python3 scripts/dedupe_restaurants.py --apply    # write changes to the DB
"""
import sys
import os
import tqdm
from collections import defaultdict
from typing import Any

# Ensure we can import from the scripts directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp


def get_connected_components(nodes: list[int], adjacency: dict[int, list[int]]) -> list[list[int]]:
    return rp.get_connected_components(nodes, adjacency)


def _merge_winner_fields(winner: dict[str, Any], loser: dict[str, Any]) -> dict[str, Any]:
    """Apply upsert-equivalent field merge rules from loser onto winner."""
    merged = dict(winner)
    if len(loser["name"]) > len(merged["name"]):
        merged["name"] = loser["name"]
    for field in ("location", "cuisine", "lat", "lng"):
        if merged.get(field) is None and loser.get(field) is not None:
            merged[field] = loser[field]
    return merged


def main() -> int:
    apply = "--apply" in sys.argv[1:]
    try:
        conn = b._connect()
    except SystemExit:
        print("DATABASE_URL not set or connection failed. Skipping DB operations.")
        return 0
    cur = conn.cursor()

    # Fetch all restaurants
    cur.execute("SELECT id, name, slug, location, cuisine, lat, lng FROM restaurants ORDER BY id")
    cols = [d[0] for d in cur.description]
    restaurants = [dict(zip(cols, r)) for r in cur.fetchall()]
    id_to_restaurant = {r['id']: r for r in restaurants}

    # Fetch mention counts for each restaurant
    cur.execute("SELECT restaurant_id, COUNT(*) FROM mentions GROUP BY restaurant_id")
    mention_counts = dict(cur.fetchall())

    print(f"Checking {len(restaurants)} restaurants for duplicates...")

    adjacency = defaultdict(list)
    for i, r1 in tqdm.tqdm(enumerate(restaurants), total=len(restaurants), desc="Comparing", unit="restaurant"):
        for j in range(i + 1, len(restaurants)):
            r2 = restaurants[j]
            if rp.is_match(r1, r2):
                adjacency[r1['id']].append(r2['id'])
                adjacency[r2['id']].append(r1['id'])

    components = get_connected_components([r['id'] for r in restaurants], adjacency)
    groups = [c for c in components if len(c) > 1]

    if not groups:
        print("No duplicates found.")
        conn.close()
        return 0

    print(f"\nFound {len(groups)} groups of duplicates to merge.")

    merges = []
    for group in groups:
        # Selection logic: Highest mention count, then longest name
        def winner_key(rid):
            r = id_to_restaurant[rid]
            return (mention_counts.get(rid, 0), len(r['name']), -rid)

        sorted_group = sorted(group, key=winner_key, reverse=True)
        winner_id = sorted_group[0]
        losers = sorted_group[1:]

        winner = id_to_restaurant[winner_id]
        for rid in losers:
            merges.append((rid, winner_id))

    if not apply:
        print("\n(dry run -- pass --apply to write changes to the DB)")
        conn.close()
        return 0

    # Perform the merge
    print("\nApplying merges...")
    winner_fields = {r["id"]: dict(r) for r in restaurants}
    for loser_id, winner_id in tqdm.tqdm(merges, desc="Merging", unit="restaurant"):
        loser = id_to_restaurant[loser_id]
        winner_fields[winner_id] = _merge_winner_fields(winner_fields[winner_id], loser)

        # 1. Handle unique constraint violations in mentions:
        # (thread_id, comment_id, restaurant_id) must be unique.
        # Find mentions of the loser that already exist for the winner.
        cur.execute("""
            DELETE FROM mentions m1
            WHERE restaurant_id = %s
            AND EXISTS (
                SELECT 1 FROM mentions m2
                WHERE m2.restaurant_id = %s
                AND m2.thread_id = m1.thread_id
                AND m2.comment_id = m1.comment_id
            )
        """, (loser_id, winner_id))

        # 2. Reassign remaining mentions to the winner
        cur.execute(
            "UPDATE mentions SET restaurant_id = %s WHERE restaurant_id = %s",
            (winner_id, loser_id)
        )

        # 3. Delete the duplicate restaurant
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
