#!/usr/bin/env python3
"""Restore exact restaurant coordinates from a DB backup by name(+city) match.

After a from-scratch re-ingest, freshly-extracted restaurant names often miss
OpenStreetMap's POI coverage (and the accumulated geocode cache), so map pins
regress. This backfills lat/lng for currently-ungeocoded restaurants from a
prior backup (see db_backup.py):
  tier 1 -- exact name+city match (highest confidence)
  tier 2 -- unambiguous name match (the name maps to exactly one coord in backup)

Usage:
  python3 scripts/geocode_carryover.py <backup.json>           # dry run
  python3 scripts/geocode_carryover.py <backup.json> --apply   # write to the DB

Reads DATABASE_URL via db_backup (env or .env). Safe to re-run: only rows that
are currently ungeocoded are considered.
"""
from __future__ import annotations
import sys, os, json, re, unicodedata, tqdm

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as b


def nk(s) -> str:
    """Normalize a name/location to a comparison key (lowercase alphanumerics)."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    backup_path = args[0]
    apply = "--apply" in args[1:]

    bk = json.load(open(backup_path, encoding="utf-8"))
    namecity: dict[str, tuple] = {}
    byname: dict[str, set] = {}
    for r in bk["restaurants"]["rows"]:
        lat, lng = r.get("lat"), r.get("lng")
        if lat is None or lng is None:
            continue
        nm = nk(r["name"])
        namecity[nm + "|" + nk(r.get("location"))] = (lat, lng)
        byname.setdefault(nm, set()).add((round(float(lat), 6), round(float(lng), 6)))
    byname_one = {k: next(iter(v)) for k, v in byname.items() if len(v) == 1}

    conn = b._connect()
    cur = conn.cursor()
    cur.execute("SELECT id, name, location FROM restaurants WHERE lat IS NULL OR lng IS NULL")
    rows = cur.fetchall()
    updates = []
    t1 = t2 = 0
    for rid, name, loc in tqdm.tqdm(rows, desc="Matching", unit="restaurant"):
        nm = nk(name)
        key = nm + "|" + nk(loc)
        if key in namecity:
            updates.append((namecity[key][0], namecity[key][1], rid)); t1 += 1
        elif nm in byname_one:
            la, ln = byname_one[nm]; updates.append((la, ln, rid)); t2 += 1
    print(f"ungeocoded={len(rows)}  matches: name+city={t1}, unambiguous-name={t2}, total={len(updates)}")

    if not apply:
        print("(dry run -- pass --apply to write)")
        conn.close()
        return 0

    if updates:
        cur.executemany(
            "UPDATE restaurants SET lat=%s, lng=%s, updated_at=now() WHERE id=%s", updates
        )
        conn.commit()
    cur.execute("SELECT count(*) FROM restaurants WHERE lat IS NOT NULL AND lng IS NOT NULL")
    geo = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM restaurants")
    tot = cur.fetchone()[0]
    print(f"APPLIED {len(updates)} updates. geocoded now: {geo}/{tot} ({100 * geo // tot}%)")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
