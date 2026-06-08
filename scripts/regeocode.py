#!/usr/bin/env python3
"""Re-geocode currently-unmapped restaurants in the DB with the improved geocoder.

Uses the tiered DB-backed geocoder (Google -> Nominatim -> Mapbox) and parallelizes
requests.
"""
from __future__ import annotations
import sys, os, concurrent.futures, tqdm

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b
import reddit_pipeline as rp


def main() -> int:
    apply = "--apply" in sys.argv[1:]

    conn = b._connect()
    cur = conn.cursor()
    # Fetch unmapped restaurants and their most-frequent subreddit for fallback city hints.
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
    closed_ids: list[int] = []
    total_committed = pending = total_closed = 0

    def _flush() -> None:
        nonlocal total_committed, total_closed
        if not batch and not closed_ids:
            return
        if batch:
            cur.executemany(
                "UPDATE restaurants SET lat=%s, lng=%s, location=COALESCE(%s, location), updated_at=now() WHERE id=%s",
                batch,
            )
            total_committed += len(batch)
        if closed_ids:
            cur.execute("DELETE FROM restaurants WHERE id = ANY(%s)", (closed_ids,))
            total_closed += len(closed_ids)
        conn.commit()
        print(f"  ... committed {total_committed} updates, removed {total_closed} closed so far")
        batch.clear()
        closed_ids.clear()

    def _regeocode_worker(rid, name, location, subreddit):
        # Tier 1: use the existing extracted location.
        lat, lng, detail, geocoded_city = rp.default_geocode(name, location)

        # Tier 2 / Tier 3: fallback when location is missing or unrecognized.
        if lat is None and detail == "missing location":
            sub_city = rp._subreddit_city(subreddit)
            if sub_city:
                # Subreddit-implied city (e.g. r/Anaheim -> Anaheim).
                lat, lng, detail, geocoded_city = rp.default_geocode(name, sub_city)
            else:
                # Name-only OC-bounded retry.
                lat, lng, detail, geocoded_city = rp.default_geocode(
                    name, None, allow_name_only=True
                )
        return rid, lat, lng, detail, geocoded_city, location

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(_regeocode_worker, rid, name, loc, sub): (rid, name)
            for rid, name, loc, sub in rows
        }
        pbar = tqdm.tqdm(
            concurrent.futures.as_completed(futures),
            total=len(rows),
            desc="Geocoding",
            unit="restaurant",
        )
        for future in pbar:
            try:
                rid, lat, lng, detail, geocoded_city, location = future.result()
                if rp._is_closed_permanently_detail(detail):
                    closed_ids.append(rid)
                    if apply:
                        if len(closed_ids) >= BATCH_SIZE:
                            _flush()
                    continue
                if lat is not None:
                    canonical = geocoded_city or rp.normalize_location(location)
                    pending += 1
                    if apply:
                        batch.append((lat, lng, canonical, rid))
                        if len(batch) >= BATCH_SIZE:
                            _flush()
            except Exception as exc:
                rid, name = futures[future]
                print(f"Error geocoding {name} (id={rid}): {exc}", file=sys.stderr)
    pbar.close()

    if apply:
        _flush()
    else:
        print("(dry run -- pass --apply to write)")

    print(f"newly resolved: {total_committed if apply else pending}")
    print(f"permanently closed removed: {total_closed if apply else len(closed_ids)}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
