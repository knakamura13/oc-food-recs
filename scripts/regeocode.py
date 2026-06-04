#!/usr/bin/env python3
"""Re-geocode currently-unmapped restaurants in the DB with the improved geocoder.

default_geocode now normalizes the location (expand abbreviations, first-of-multi-city,
neighborhood/street -> city) and no longer caches negative results. This script:
  1. purges negative entries from the on-disk geocode cache (so they're retried),
  2. runs default_geocode over every restaurant missing lat/lng,
  3. updates lat, lng, AND location for each newly-resolved hit.

Usage:
  python3 scripts/regeocode.py            # dry run (still hits Nominatim, no DB writes)
  python3 scripts/regeocode.py --apply    # write lat/lng/location to the DB

Network calls are rate-limited to Nominatim's ~1 req/s; ~N-with-location seconds.
"""
from __future__ import annotations
import sys, os, json

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
    cur.execute("SELECT id, name, location FROM restaurants WHERE lat IS NULL OR lng IS NULL")
    rows = cur.fetchall()
    print(f"unmapped restaurants: {len(rows)}")

    hits = []
    for rid, name, location in rows:
        lat, lng, detail, geocoded_city = rp.default_geocode(name, location)
        if lat is not None:
            canonical = geocoded_city or rp.normalize_location(location)
            hits.append((lat, lng, canonical, rid, name, detail))
    print(f"newly resolved (exact): {len(hits)}")
    for lat, lng, canonical, _rid, name, detail in hits[:30]:
        print(f"  + {name!r} -> {lat:.4f},{lng:.4f}  city={canonical!r}  {detail[:40]}")

    if not apply:
        print("(dry run -- pass --apply to write)")
        conn.close()
        return 0

    if hits:
        cur.executemany(
            "UPDATE restaurants SET lat=%s, lng=%s, location=COALESCE(%s, location), updated_at=now() WHERE id=%s",
            [(lat, lng, canonical, rid) for lat, lng, canonical, rid, _n, _d in hits],
        )
        conn.commit()
    cur.execute("SELECT count(*) FROM restaurants WHERE lat IS NOT NULL AND lng IS NOT NULL")
    geo = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM restaurants")
    tot = cur.fetchone()[0]
    print(f"APPLIED. mapped now: {geo}/{tot} ({100 * geo // tot}%)")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
