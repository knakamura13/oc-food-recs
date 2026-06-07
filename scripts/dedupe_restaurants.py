#!/usr/bin/env python3
"""Deduplicate restaurants in the database by merging similar entries.

Usage:
  python3 scripts/dedupe_restaurants.py            # dry run
  python3 scripts/dedupe_restaurants.py --apply    # write changes to the DB
"""
import sys
import os
from collections import defaultdict

# Ensure we can import from the scripts directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp

def main() -> int:
    apply = "--apply" in sys.argv[1:]
    try:
        conn = b._connect()
    except SystemExit:
        print("DATABASE_URL not set or connection failed. Skipping DB operations.")
        return 0
    cur = conn.cursor()

    # Fetch restaurants and their mention counts
    cur.execute("""
        SELECT r.id, r.name, r.slug, r.location, r.lat, r.lng,
               (SELECT COUNT(*) FROM mentions m WHERE m.restaurant_id = r.id) as mention_count
        FROM restaurants r
        ORDER BY r.id
    """)
    cols = [d[0] for d in cur.description]
    restaurants = [dict(zip(cols, r)) for r in cur.fetchall()]

    print(f"Checking {len(restaurants)} restaurants for duplicates...")

    # Build an adjacency list of matches
    adj = defaultdict(set)
    for i, r1 in enumerate(restaurants):
        for j in range(i + 1, len(restaurants)):
            r2 = restaurants[j]

            if rp.is_name_match(r1['name'], r2['name']):
                loc_match = bool(r1.get("location")) and r1.get("location") == r2.get("location")
                dist_match = False
                if r1.get("lat") is not None and r1.get("lng") is not None and                    r2.get("lat") is not None and r2.get("lng") is not None:
                    dlat = float(r1["lat"]) - float(r2["lat"])
                    dlng = float(r1["lng"]) - float(r2["lng"])
                    if (dlat**2 + dlng**2)**0.5 < 0.002:
                        dist_match = True

                if loc_match or dist_match:
                    adj[r1['id']].add(r2['id'])
                    adj[r2['id']].add(r1['id'])

    # Find connected components (groups)
    groups = []
    visited = set()
    restaurant_map = {r['id']: r for r in restaurants}

    for r in restaurants:
        if r['id'] not in visited:
            component = []
            stack = [r['id']]
            visited.add(r['id'])
            while stack:
                curr = stack.pop()
                component.append(restaurant_map[curr])
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        stack.append(neighbor)
            if len(component) > 1:
                groups.append(component)

    if not groups:
        print("No duplicates found.")
        conn.close()
        return 0

    print(f"\nFound {len(groups)} groups of duplicates.")

    canonical_map: dict[int, int] = {}

    for group in groups:
        # Canonical is one with most mentions, then longest name
        group.sort(key=lambda x: (x['mention_count'], len(x['name'])), reverse=True)

        canonical = group[0]
        duplicates = group[1:]

        print(f"  Canonical: '{canonical['name']}' (ID: {canonical['id']}, Mentions: {canonical['mention_count']})")
        for dup in duplicates:
            print(f"    - Merging: '{dup['name']}' (ID: {dup['id']}, Mentions: {dup['mention_count']})")
            canonical_map[dup['id']] = canonical['id']

    if not apply:
        print("\n(dry run -- pass --apply to write changes to the DB)")
        conn.close()
        return 0

    # Perform the merge
    print("\nApplying merges...")
    for dup_id, can_id in canonical_map.items():
        # Update mentions manually to avoid unique violations
        cur.execute(\"\"\"
            UPDATE mentions m
            SET restaurant_id = %s
            WHERE restaurant_id = %s
              AND NOT EXISTS (
                  SELECT 1 FROM mentions m2
                  WHERE m2.thread_id = m.thread_id
                    AND m2.comment_id = m.comment_id
                    AND m2.restaurant_id = %s
              )
        \"\"\", (can_id, dup_id, can_id))

        cur.execute("DELETE FROM mentions WHERE restaurant_id = %s", (dup_id,))
        cur.execute("DELETE FROM restaurants WHERE id = %s", (dup_id,))
        print(f"  Merged ID {dup_id} into {can_id}")

    conn.commit()
    conn.close()
    print("\nDeduplication complete.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
