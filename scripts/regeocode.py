#!/usr/bin/env python3
"""Re-geocode currently-unmapped restaurants in the DB with the improved geocoder.

default_geocode now normalizes the location (expand abbreviations, first-of-multi-city,
neighborhood/street -> city) and no longer caches negative results. This script:
  1. purges negative entries from the on-disk geocode cache (so they're retried),
  2. for each unmapped restaurant, runs default_geocode in tiers:
       T1: LLM-extracted location (when normalize_location recognizes it),
       T2: most-frequent subreddit's implied city (when T1 returns "missing location"
           and the subreddit maps to a known OC city — mirrors build_thread),
       T3: name-only OC-bounded query (when T1 returns "missing location" and no
           subreddit hint is available — e.g. r/orangecounty + empty LLM location);
           _mapbox_accept's score>=0.85 floor keeps fuzzy false positives bounded
           but generic names ("Taco Shop") can still drift, so inspect dry-run
           output before --apply,
  3. updates lat, lng, AND location for each newly-resolved hit.

Usage:
  python3 scripts/regeocode.py            # dry run (still hits Nominatim, no DB writes)
  python3 scripts/regeocode.py --apply    # write lat/lng/location to the DB

Network calls are rate-limited to Nominatim's ~1 req/s; ~N-with-location seconds.
"""
from __future__ import annotations
import sys, os, json, tqdm

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp


def purge_negative_cache() -> int:
    path = rp.GEOCODE_CACHE_PATH
    if not path.exists():
        return 0
    cache = json.loads(path.read_text(encoding="utf-8"))
    negatives = [k for k, v in cache.items() if not v or v[0] is None]
    for k in negatives:
        del cache[k]
    path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    rp._geocode_cache = None  # force reload on next default_geocode
    return len(negatives)


def main() -> int:
    apply = "--apply" in sys.argv[1:]
    print(f"purged {purge_negative_cache()} negative cache entries")

    conn = b._connect()
    cur = conn.cursor()
    # Also fetch each restaurant's most-frequent subreddit (via mentions → threads).
    # When the LLM-extracted location is unrecognized — and normalize_location returns
    # None — we retry default_geocode with the subreddit's implied city, mirroring
    # what build_thread does for fresh ingests.
    cur.execute(
        """
        SELECT r.id, r.name, r.location,
               (SELECT t.subreddit
                FROM mentions m
                JOIN threads t ON t.id = m.thread_id
                WHERE m.restaurant_id = r.id
                GROUP BY t.subreddit
                ORDER BY COUNT(*) DESC, t.subreddit
                LIMIT 1) AS subreddit
        FROM restaurants r
        WHERE r.lat IS NULL OR r.lng IS NULL
        ORDER BY r.id
        """
    )
    rows = cur.fetchall()
    print(f"unmapped restaurants: {len(rows)}")

    BATCH_SIZE = 25
    batch: list[tuple] = []
    total_committed = pending = 0

    def _flush() -> None:
        nonlocal total_committed
        if not batch:
            return
        cur.executemany(
            "UPDATE restaurants SET lat=%s, lng=%s, location=COALESCE(%s, location), updated_at=now() WHERE id=%s",
            batch,
        )
        conn.commit()
        total_committed += len(batch)
        print(f"  ... committed {total_committed} updates so far")
        batch.clear()

    retried_subreddit = retried_name_only = 0
    pbar = tqdm.tqdm(rows, desc="Geocoding", unit="restaurant")
    for rid, name, location, subreddit in pbar:
        # Tier 1: use the LLM-extracted city (if any).
        lat, lng, detail, geocoded_city = rp.default_geocode(name, location)

        # Tier 2 / Tier 3: only fire when normalize_location returned None — other
        # failure modes (no in-OC hit, outside-bounds, etc.) have already been tried
        # with a valid city hint, so retrying with a different city won't help.
        if lat is None and detail == "missing location":
            sub_city = rp._subreddit_city(subreddit)
            if sub_city:
                # Tier 2: subreddit-implied city (e.g. r/Anaheim → Anaheim).
                lat, lng, detail, geocoded_city = rp.default_geocode(name, sub_city)
                if lat is not None:
                    retried_subreddit += 1
                    detail = f"(via r/{subreddit}) {detail}"
            else:
                # Tier 3: no city signal anywhere (e.g. r/orangecounty + empty location).
                # Name-only OC-bounded retry; _mapbox_accept's score>=0.85 floor keeps
                # fuzzy false-positives bounded. Inspect the output before --apply if
                # the restaurant name is generic.
                lat, lng, detail, geocoded_city = rp.default_geocode(
                    name, None, allow_name_only=True
                )
                if lat is not None:
                    retried_name_only += 1
                    detail = f"(name-only OC bbox) {detail}"

        if lat is not None:
            canonical = geocoded_city or rp.normalize_location(location)
            pending += 1
            if apply:
                batch.append((lat, lng, canonical, rid))
                if len(batch) >= BATCH_SIZE:
                    _flush()
    pbar.close()

    if apply:
        _flush()
    else:
        print("(dry run -- pass --apply to write)")

    print(
        f"newly resolved: {total_committed if apply else pending} "
        f"({retried_subreddit} via subreddit, {retried_name_only} via name-only)"
    )

    if apply:
        cur.execute("SELECT count(*) FROM restaurants WHERE lat IS NOT NULL AND lng IS NOT NULL")
        geo = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM restaurants")
        tot = cur.fetchone()[0]
        print(f"APPLIED. mapped now: {geo}/{tot} ({100 * geo // tot}%)")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
