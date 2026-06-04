#!/usr/bin/env python3
"""Back-fill canonical OC city names for restaurants that already have coordinates.

When the pipeline stored a raw LLM location string ("BP", "San Juan", "Disneyland",
etc.) before the normalize_location hardening, the lat/lng is correct but the
location column is wrong or missing.  This script:
  1. Queries every restaurant that has lat/lng,
  2. Reverse-geocodes each one via Nominatim to get the authoritative city,
  3. Updates location when a canonical OC city is found AND it differs from
     what is already stored.

Run backfill_cities BEFORE regeocode: backfill_cities corrects existing
coordinates, regeocode adds coordinates for currently-unmapped rows.

Usage:
  python3 scripts/backfill_cities.py           # dry run (hits Nominatim, no DB writes)
  python3 scripts/backfill_cities.py --apply   # write updated location values to DB

Rate-limited to Nominatim's ~1 req/s policy.
Reads DATABASE_URL from environment or .env (via db_backup).
"""
from __future__ import annotations
import sys, os, json, time, urllib.request, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp

NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
_MIN_INTERVAL_S = 1.1  # slightly over 1 req/s to stay within Nominatim's policy
_last_ts = 0.0


def _reverse_geocode_city(lat: float, lng: float) -> str | None:
    """Return the canonical OC city for (lat, lng) via Nominatim reverse, or None."""
    global _last_ts
    wait = _MIN_INTERVAL_S - (time.monotonic() - _last_ts)
    if wait > 0:
        time.sleep(wait)
    _last_ts = time.monotonic()

    params = urllib.parse.urlencode({
        "lat": lat, "lon": lng, "format": "json", "zoom": 14,
    })
    req = urllib.request.Request(
        f"{NOMINATIM_REVERSE_URL}?{params}", headers=rp.HEADERS
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            hit = json.loads(resp.read())
    except Exception as exc:
        print(f"  reverse geocode error ({lat:.4f},{lng:.4f}): {exc}", file=sys.stderr)
        return None

    # Prefer structured address fields; fall back to scanning display_name.
    addr = hit.get("address") or {}
    raw = (addr.get("city") or addr.get("town") or addr.get("village") or
           addr.get("suburb") or addr.get("hamlet") or "")
    return rp.normalize_location(raw) or rp._city_from_address_string(hit.get("display_name", ""))


def main() -> int:
    apply = "--apply" in sys.argv[1:]

    conn = b._connect()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, location, lat, lng "
        "FROM restaurants WHERE lat IS NOT NULL AND lng IS NOT NULL "
        "ORDER BY name"
    )
    rows = cur.fetchall()
    print(f"geocoded restaurants to check: {len(rows)}")

    updates: list[tuple[str, int]] = []
    no_match = 0
    for rid, name, current_city, lat, lng in rows:
        new_city = _reverse_geocode_city(lat, lng)
        if new_city is None:
            no_match += 1
            continue
        if new_city != current_city:
            updates.append((new_city, rid))
            print(f"  {name!r}: {current_city!r} -> {new_city!r}")

    already_correct = len(rows) - no_match - len(updates)
    print(
        f"\nsummary: {len(updates)} to update, "
        f"{already_correct} already correct, "
        f"{no_match} no OC city found in address"
    )

    if not apply:
        print("(dry run -- pass --apply to write)")
        conn.close()
        return 0

    if updates:
        cur.executemany(
            "UPDATE restaurants SET location=%s, updated_at=now() WHERE id=%s",
            updates,
        )
        conn.commit()
    print(f"APPLIED {len(updates)} location updates.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
