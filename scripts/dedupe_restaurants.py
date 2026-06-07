#!/usr/bin/env python3
"""Deduplicate restaurants in the database by merging similar entries.

Usage:
  python3 scripts/dedupe_restaurants.py            # dry run
  python3 scripts/dedupe_restaurants.py --apply    # write changes to the DB
"""
import sys
import os
from collections import defaultdict, deque
from typing import Any

# Ensure we can import from the scripts directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp

def get_connected_components(nodes: list[int], adjacency: dict[int, list[int]]) -> list[list[int]]:
    visited = set()
    components = []
    for node in nodes:
        if node not in visited:
            component = []
            queue = deque([node])
            visited.add(node)
            while queue:
                current = queue.popleft()
                component.append(current)
                for neighbor in adjacency.get(current, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(component)
    return components

def main() -> int:
    apply = "--apply" in sys.argv[1:]
    try:
        conn = b._connect()
    except SystemExit:
        print("DATABASE_URL not set or connection failed. Skipping DB operations.")
        return 0
    cur = conn.cursor()

    # Fetch all restaurants
    cur.execute("SELECT id, name, slug, location, lat, lng FROM restaurants ORDER BY id")
    cols = [d[0] for d in cur.description]
    restaurants = [dict(zip(cols, r)) for r in cur.fetchall()]
    id_to_restaurant = {r['id']: r for r in restaurants}

    # Fetch mention counts for each restaurant
    cur.execute("SELECT restaurant_id, COUNT(*) FROM mentions GROUP BY restaurant_id")
    mention_counts = dict(cur.fetchall())

    print(f"Checking {len(restaurants)} restaurants for duplicates...")

    adjacency = defaultdict(list)
    for i, r1 in enumerate(restaurants):
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
        print(f"\nGroup (Winner: '{winner['name']}' ID {winner_id}, {mention_counts.get(winner_id, 0)} mentions):")
        for rid in losers:
            loser = id_to_restaurant[rid]
            print(f"  - '{loser['name']}' (ID {rid}, {mention_counts.get(rid, 0)} mentions)")
            merges.append((rid, winner_id))

    if not apply:
        print("\n(dry run -- pass --apply to write changes to the DB)")
        conn.close()
        return 0

    # Perform the merge
    print("\nApplying merges...")
    for loser_id, winner_id in merges:
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
        print(f"  Merged ID {loser_id} into {winner_id}")

    conn.commit()
    conn.close()
    print("\nDeduplication complete.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
