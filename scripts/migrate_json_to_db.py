"""
One-shot migration: read the current src/lib/data/generated/restaurants.json
and the data/threads/<id>/manifest.json files, populate threads/restaurants/mentions.

Idempotent: re-runs upsert by primary key / unique constraint, no rows are deleted.

Run:
    DATABASE_URL=postgres://... python3 scripts/migrate_json_to_db.py

Verify:
    psql $DATABASE_URL -c "SELECT COUNT(*) FROM restaurants"  # expect ~339
    psql $DATABASE_URL -c "SELECT COUNT(DISTINCT thread_id) FROM mentions"  # expect 2
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    print("psycopg is not installed. Run: pip install 'psycopg[binary]>=3.2'", file=sys.stderr)
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parent.parent
GENERATED_JSON = REPO_ROOT / "src" / "lib" / "data" / "generated" / "restaurants.json"
THREADS_ROOT = REPO_ROOT / "data" / "threads"

# Extract <post_id> from a Reddit permalink like:
#   https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/oe04j5u/
PERMALINK_POST_ID_RE = re.compile(r"/comments/([a-z0-9]+)/", re.IGNORECASE)


def slugify(value: str) -> str:
    """Mirror of the TS slugify in src/lib/restaurants/stores.svelte.ts:15."""
    lowered = value.lower()
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", lowered))


def assign_slugs(restaurants: list[dict[str, Any]]) -> list[tuple[dict[str, Any], str]]:
    """Mirror of the TS slug-collision logic in src/lib/restaurants/data.ts."""
    used: set[str] = set()
    out: list[tuple[dict[str, Any], str]] = []
    for r in restaurants:
        base = slugify(r["name"])
        slug = base
        n = 2
        while slug in used:
            slug = f"{base}-{n}"
            n += 1
        used.add(slug)
        out.append((r, slug))
    return out


def synthesize_endorsement_id(thread_id: str, author: str, body: str) -> str:
    """Stable hash-based comment_id for legacy endorsements (the old JSON didn't keep these)."""
    digest = hashlib.sha256(f"{thread_id}|{author}|{body[:200]}".encode()).hexdigest()[:16]
    return f"migrated-{digest}"


def extract_post_id_from_permalink(permalink: str | None) -> str | None:
    if not permalink:
        return None
    match = PERMALINK_POST_ID_RE.search(permalink)
    return match.group(1) if match else None


def load_thread_manifests() -> dict[str, dict[str, Any]]:
    """Return {thread_id: manifest_json} for every thread folder on disk."""
    manifests: dict[str, dict[str, Any]] = {}
    for thread_dir in sorted(THREADS_ROOT.iterdir()):
        if not thread_dir.is_dir():
            continue
        manifest_path = thread_dir / "manifest.json"
        if not manifest_path.exists():
            continue
        manifest = json.loads(manifest_path.read_text())
        manifests[manifest["id"]] = manifest
    return manifests


def build_thread_lookup(manifests: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Map Reddit post_id -> our thread_id (e.g. '1sb0qo7' -> 'orangecounty-1sb0qo7')."""
    return {m["post_id"]: m["id"] for m in manifests.values()}


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set. See .env.example.", file=sys.stderr)
        return 1

    if not GENERATED_JSON.exists():
        print(f"Source JSON not found: {GENERATED_JSON}", file=sys.stderr)
        return 1

    dataset = json.loads(GENERATED_JSON.read_text())
    manifests = load_thread_manifests()
    post_id_to_thread_id = build_thread_lookup(manifests)

    print(f"Source: {GENERATED_JSON}")
    print(f"Found {len(dataset['restaurants'])} restaurants, {len(manifests)} thread manifests on disk")

    threads_inserted = 0
    restaurants_inserted = 0
    mentions_inserted = 0
    ambiguous_attributions = 0

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # 1. Threads — upsert from manifests
            for thread_id, manifest in manifests.items():
                cur.execute(
                    """
                    INSERT INTO threads (id, subreddit, post_id, url, title, comment_count, max_depth, included_in_publish)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        subreddit = EXCLUDED.subreddit,
                        post_id = EXCLUDED.post_id,
                        url = EXCLUDED.url,
                        title = EXCLUDED.title,
                        comment_count = EXCLUDED.comment_count,
                        max_depth = EXCLUDED.max_depth,
                        included_in_publish = EXCLUDED.included_in_publish
                    """,
                    (
                        thread_id,
                        manifest["subreddit"],
                        manifest["post_id"],
                        manifest["url"],
                        manifest["title"],
                        manifest.get("comment_count", 0),
                        manifest.get("max_depth", 0),
                        manifest.get("include_in_publish", True),
                    ),
                )
                threads_inserted += 1

            # 2. Restaurants — assign collision-safe slugs, insert in JSON order (which is aggregate_score DESC)
            for restaurant, slug in assign_slugs(dataset["restaurants"]):
                cur.execute(
                    """
                    INSERT INTO restaurants (name, slug, location, cuisine, lat, lng)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        location = EXCLUDED.location,
                        cuisine = EXCLUDED.cuisine,
                        lat = EXCLUDED.lat,
                        lng = EXCLUDED.lng,
                        updated_at = now()
                    RETURNING id
                    """,
                    (
                        restaurant["name"],
                        slug,
                        restaurant.get("location"),
                        restaurant.get("cuisine"),
                        restaurant.get("lat"),
                        restaurant.get("lng"),
                    ),
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError(f"INSERT did not return a row for {restaurant['name']!r}")
                restaurant_id = row["id"]
                restaurants_inserted += 1

                # 3. Primary mention — derive thread_id from the permalink
                primary = restaurant["primary_comment"]
                primary_post_id = extract_post_id_from_permalink(primary.get("permalink"))
                primary_thread_id = post_id_to_thread_id.get(primary_post_id) if primary_post_id else None
                if not primary_thread_id:
                    # Fall back to the restaurant's first source_thread
                    source_threads = restaurant.get("source_threads", [])
                    primary_thread_id = source_threads[0] if source_threads else None
                if not primary_thread_id:
                    print(f"  ! Skipping {restaurant['name']!r}: cannot determine thread for primary comment", file=sys.stderr)
                    continue

                cur.execute(
                    """
                    INSERT INTO mentions (restaurant_id, thread_id, comment_id, permalink, author, body, score, role, classification)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'primary', NULL)
                    ON CONFLICT (thread_id, comment_id) DO UPDATE SET
                        restaurant_id = EXCLUDED.restaurant_id,
                        permalink = EXCLUDED.permalink,
                        author = EXCLUDED.author,
                        body = EXCLUDED.body,
                        score = EXCLUDED.score
                    """,
                    (
                        restaurant_id,
                        primary_thread_id,
                        primary["id"],
                        primary.get("permalink"),
                        primary["author"],
                        primary["body"],
                        primary["score"],
                    ),
                )
                mentions_inserted += 1

                # 4. Endorsements — legacy data lacks comment_ids and permalinks
                # Attribute to the restaurant's home thread (primary_thread_id). For
                # cross-thread restaurants this may misattribute endorsements that originated
                # in a different thread; log and proceed.
                source_threads = restaurant.get("source_threads", [])
                if len(source_threads) > 1:
                    ambiguous_attributions += 1

                for endorsement in restaurant.get("endorsements", []):
                    synth_id = synthesize_endorsement_id(
                        primary_thread_id,
                        endorsement["author"],
                        endorsement["body"],
                    )
                    cur.execute(
                        """
                        INSERT INTO mentions (restaurant_id, thread_id, comment_id, permalink, author, body, score, role, classification)
                        VALUES (%s, %s, %s, NULL, %s, %s, %s, 'endorsement', %s)
                        ON CONFLICT (thread_id, comment_id) DO UPDATE SET
                            restaurant_id = EXCLUDED.restaurant_id,
                            author = EXCLUDED.author,
                            body = EXCLUDED.body,
                            score = EXCLUDED.score,
                            classification = EXCLUDED.classification
                        """,
                        (
                            restaurant_id,
                            primary_thread_id,
                            synth_id,
                            endorsement["author"],
                            endorsement["body"],
                            endorsement["score"],
                            endorsement.get("type"),
                        ),
                    )
                    mentions_inserted += 1

        conn.commit()

    print()
    print(f"Migration complete:")
    print(f"  threads:      {threads_inserted}")
    print(f"  restaurants:  {restaurants_inserted}")
    print(f"  mentions:     {mentions_inserted}")
    if ambiguous_attributions:
        print(f"  ! {ambiguous_attributions} restaurants had endorsements attributed to their primary thread")
        print(f"    (these will not break — only cosmetically misattribute legacy cross-thread endorsements)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
