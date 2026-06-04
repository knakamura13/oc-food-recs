#!/usr/bin/env python3
"""Deduplicate restaurants in the database by merging similar entries.

Usage:
  python3 scripts/dedupe_restaurants.py            # dry run
  python3 scripts/dedupe_restaurants.py --apply    # write changes to the DB
"""
import sys
import os
from typing import Any

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

    # Fetch all restaurants
    cur.execute("SELECT id, name, slug, location, lat, lng FROM restaurants ORDER BY id")
    cols = [d[0] for d in cur.description]
    restaurants = [dict(zip(cols, r)) for r in cur.fetchall()]

    merged_count = 0
    canonical_map: dict[int, int] = {} # duplicate_id -> canonical_id
    processed_ids: set[int] = set()

    print(f"Checking {len(restaurants)} restaurants for duplicates...")

    for i, r1 in enumerate(restaurants):
        if r1['id'] in processed_ids:
            continue

        norm1 = rp.normalize_name(r1['name'])

        for j in range(i + 1, len(restaurants)):
            r2 = restaurants[j]
            if r2['id'] in processed_ids:
                continue

            norm2 = rp.normalize_name(r2['name'])

            if norm1 == norm2:
                # Same normalized name. Check for location/proximity.
                loc_match = bool(r1.get("location")) and r1.get("location") == r2.get("location")
                dist_match = False
                if r1.get("lat") is not None and r1.get("lng") is not None and \
                   r2.get("lat") is not None and r2.get("lng") is not None:
                    dlat = float(r1["lat"]) - float(r2["lat"])
                    dlng = float(r1["lng"]) - float(r2["lng"])
                    # ~200m threshold
                    if (dlat**2 + dlng**2)**0.5 < 0.002:
                        dist_match = True

                if loc_match or dist_match:
                    # Found a duplicate! r2 is the duplicate, r1 is canonical.
                    print(f"  Match found: '{r1['name']}' (ID: {r1['id']}) and '{r2['name']}' (ID: {r2['id']})")
                    canonical_map[r2['id']] = r1['id']
                    processed_ids.add(r2['id'])
                    merged_count += 1

        processed_ids.add(r1['id'])

    if not canonical_map:
        print("No duplicates found.")
        conn.close()
        return 0

    print(f"\nFound {len(canonical_map)} duplicates to merge.")

    if not apply:
        print("(dry run -- pass --apply to write changes to the DB)")
        conn.close()
        return 0

    # Perform the merge
    print("Applying merges...")
    for dup_id, can_id in canonical_map.items():
        # 1. Update mentions to point to the canonical restaurant
        cur.execute(
            "UPDATE mentions SET restaurant_id = %s WHERE restaurant_id = %s",
            (can_id, dup_id)
        )
        # 2. Delete the duplicate restaurant
        cur.execute("DELETE FROM restaurants WHERE id = %s", (dup_id,))
        print(f"  Merged ID {dup_id} into {can_id}")

    conn.commit()
    conn.close()
    print("\nDeduplication complete.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
