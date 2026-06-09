#!/usr/bin/env python3
"""Re-apply chain / corporate-group exclusions across the existing restaurants corpus.

For every restaurant WHERE ``reviewed_at IS NULL`` (i.e. not human-locked in the admin UI),
recompute the publish status from the registry + multi-city density and update
``status`` / ``exclusion_reason``. Human-reviewed rows are never touched.

Run this:
  * once after the first seed, to classify the pre-existing corpus, and
  * whenever you add brands to ``excluded_brands`` (re-ingest alone won't retro-apply,
    because the ingest ON CONFLICT path intentionally leaves existing statuses alone).

Note: the LLM ``chain_suspect`` and optional Google location-count signals are ingest-time
only and not stored, so this sweep applies the registry + density signals (the deterministic
ones). It only ever sets 'excluded' (registry) or 'pending_review' (density) -- never hides
a row that a human has reviewed.

Usage:
  python3 scripts/apply_exclusions.py            # dry run (default)
  python3 scripts/apply_exclusions.py --apply    # write changes to the DB
"""
import os
import sys
import tqdm

# Ensure we can import sibling scripts.
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

    registry = rp._load_excluded_brands(cur)
    if not registry:
        print(
            "excluded_brands is empty (or the table is missing). "
            "Seed it first: python3 scripts/seed_exclusions.py"
        )
    print(f"Loaded {len(registry)} registry brands.")

    cur.execute(
        "SELECT id, name, location, status, exclusion_reason "
        "FROM restaurants WHERE reviewed_at IS NULL ORDER BY id"
    )
    cols = [d[0] for d in cur.description]
    restaurants = [dict(zip(cols, r)) for r in cur.fetchall()]
    print(f"Evaluating {len(restaurants)} non-human-locked restaurants...")

    # Density is computed across the rows under consideration (corpus-wide).
    city_counts = rp.batch_city_counts(restaurants)

    changes = []
    for r in restaurants:
        new_status, new_reason = rp.classify_restaurant_status(
            r, registry=registry, city_counts=city_counts
        )
        cur_status = r["status"] or "active"
        if new_status != cur_status or new_reason != r.get("exclusion_reason"):
            changes.append((r, new_status, new_reason))

    excluded = sum(1 for _, s, _ in changes if s == "excluded")
    review = sum(1 for _, s, _ in changes if s == "pending_review")
    active = sum(1 for _, s, _ in changes if s == "active")
    print(
        f"{len(changes)} rows would change "
        f"({excluded} -> excluded, {review} -> pending_review, {active} -> active)."
    )
    for r, s, reason in changes[:50]:
        print(f"  {(r['status'] or 'active'):14} -> {s:14} {(reason or ''):22} {r['name']}")
    if len(changes) > 50:
        print(f"  ... and {len(changes) - 50} more")

    if not apply:
        print("\n(dry run -- pass --apply to write changes)")
        conn.close()
        return 0

    for r, s, reason in tqdm.tqdm(changes, desc="Updating", unit="restaurant"):
        # The `reviewed_at IS NULL` guard is repeated here to stay safe under concurrency.
        cur.execute(
            "UPDATE restaurants SET status = %s, exclusion_reason = %s, updated_at = now() "
            "WHERE id = %s AND reviewed_at IS NULL",
            (s, reason, r["id"]),
        )
    conn.commit()
    conn.close()
    print(f"\nApplied {len(changes)} status changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
