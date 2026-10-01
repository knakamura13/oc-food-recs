#!/usr/bin/env python3
"""Back-fill `restaurants.street` from addresses already stored in `geocode_cache`.

The geocode cache keeps the geocoder's fully formatted address in `detail`, e.g.
  "Cafe Rae, 1421 N El Camino Real, San Clemente, CA 92672, USA"
For active restaurants with a null/empty street this script:
  1. Finds cache rows whose name segment (the key prefix before the first "|")
     matches the restaurant name after normalization,
  2. Parses the street out of `detail`,
  3. Sets `street` only when the match is unambiguous.

Ambiguous rows are never written: several cache rows with different streets, a
city that disagrees with the restaurant's `location`, or a geocoded place name
that does not resemble the restaurant name. The admin geocode review queue
(/admin/geocode) is driven purely by "restaurant has no lat/lng", so there is no
flag to set for ambiguity; ambiguous rows that already lack coordinates are
already in that queue (counted in the summary) and the rest are listed in the
output (and in --report) for manual follow-up.

Never touches a non-empty street or a row with reviewed_at set.

Usage:
  python3 scripts/backfill_streets.py                 # dry run: summary + samples, no writes
  python3 scripts/backfill_streets.py --apply         # write streets to DB
  python3 scripts/backfill_streets.py --report out.tsv  # also dump every decision to a TSV

Reads DATABASE_URL from environment or .env (via db_backup).
"""
from __future__ import annotations
import argparse, re, sys, os
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_STATE_ZIP = re.compile(r"^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$")
_UNIT_TAIL = re.compile(
    r"\s*(?:,?\s*(?:#\s*\S+|(?:suite|ste|unit|apt|bldg|building|space|spc|floor|fl)\b\.?\s*\S*))+$",
    re.IGNORECASE,
)
_UNIT_ONLY = re.compile(
    r"^(?:#\s*\S+|(?:suite|ste|unit|apt|bldg|building|space|spc|floor|fl)\b\.?\s*\S*)$",
    re.IGNORECASE,
)
_STREETISH = re.compile(
    r"^\d|\b(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|pkwy|parkway|"
    r"hwy|highway|ct|court|pl|place|cir|circle|plz|plaza|fwy|freeway|trl|trail|sq|square)\b\.?",
    re.IGNORECASE,
)
_STOP = {"the", "and", "of", "restaurant", "cafe", "grill", "kitchen", "house"}


def normalize_name(name: str) -> str:
    """Lowercase, '&' -> 'and', drop everything but letters/digits."""
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower().replace("&", "and"))


def parse_detail(detail: str | None) -> tuple[str | None, str | None, str | None]:
    """Split a Google-style 'Place, Street, City, ST ZIP, USA' string.

    Returns (place, street, city); each is None when absent. Returns all None for
    anything that is not that shape (Nominatim display names, 'google: ...' failure
    markers, manual coordinates). Trailing unit designators ('#320', 'Suite A')
    are dropped from the street.
    """
    if not detail:
        return None, None, None
    parts = [p.strip() for p in detail.split(",") if p.strip()]
    if parts and parts[-1] in ("USA", "United States"):
        parts.pop()
    if len(parts) < 3 or not _STATE_ZIP.match(parts[-1]):
        return None, None, None
    city = parts[-2]
    head = parts[:-2]  # [place, street, unit...] or just [place]
    place = head[0]
    # The place name itself may contain commas ("Katella Deli, Deli and Restaurant"),
    # so take the first remaining part that actually looks like a street.
    middle = [p for p in head[1:] if not _UNIT_ONLY.match(p) and _STREETISH.search(p)]
    if not middle:
        return place, None, city
    street = _UNIT_TAIL.sub("", middle[0]).strip()
    if not street or not re.search(r"[A-Za-z]", street):
        return place, None, city
    return place, street, city


def names_resemble(restaurant: str, place: str | None) -> bool:
    """Loose sanity check that the geocoded place is the same business."""
    if not place:
        return False
    a, b = normalize_name(restaurant), normalize_name(place)
    if a and b and (a in b or b in a):
        return True

    def toks(s: str) -> set[str]:
        return {t for t in re.findall(r"[a-z0-9]+", s.lower().replace("&", "and")) if len(t) > 2 and t not in _STOP}

    return bool(toks(restaurant) & toks(place))


def classify(name: str, location: str | None, candidates: list[tuple[str | None, str | None]],
             norm_city=lambda s: (s or "").strip().lower()):
    """Decide one restaurant.

    candidates: list of (detail, geocoded_city) for name-matching cache rows.
    Returns ('set', street, note) | ('ambiguous', None, reason) | ('none', None, reason).
    """
    parsed = []
    for detail, gcity in candidates:
        place, street, city = parse_detail(detail)
        if street:
            parsed.append((place, street, city or gcity))
    if not parsed:
        return "none", None, "no parseable street in cache"

    want = norm_city(location)
    in_city = [p for p in parsed if not want or norm_city(p[2]) == want]
    if not in_city:
        return "ambiguous", None, f"city mismatch: {location!r} vs {sorted({p[2] for p in parsed})}"

    streets = {p[1].lower() for p in in_city}
    if len(streets) > 1:
        return "ambiguous", None, f"multiple streets: {sorted(streets)}"

    place, street, _ = in_city[0]
    if not names_resemble(name, place):
        return "ambiguous", None, f"place name mismatch: {place!r}"
    return "set", street, ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write streets to DB (default: dry run)")
    ap.add_argument("--report", metavar="FILE", help="write every decision to a TSV file")
    ap.add_argument("--samples", type=int, default=8, help="samples to print per bucket")
    args = ap.parse_args()

    import db_backup as b
    import reddit_pipeline as rp

    conn = b._connect()
    cur = conn.cursor()

    cur.execute(
        "SELECT query, detail, geocoded_city FROM geocode_cache "
        "WHERE lat IS NOT NULL AND detail IS NOT NULL"
    )
    by_name: dict[str, list[tuple[str | None, str | None]]] = defaultdict(list)
    for query, detail, gcity in cur.fetchall():
        by_name[normalize_name(query.split("|", 1)[0])].append((detail, gcity))

    cur.execute(
        "SELECT id, name, location, lat, lng FROM restaurants "
        "WHERE status = 'active' AND reviewed_at IS NULL "
        "AND (street IS NULL OR btrim(street) = '') ORDER BY name"
    )
    rows = cur.fetchall()
    print(f"active street-less restaurants (not reviewed): {len(rows)}")

    def city_key(s):
        return (rp.normalize_location(s) or (s or "")).strip().lower()

    buckets: dict[str, list] = {"set": [], "ambiguous": [], "none": []}
    for rid, name, location, lat, lng in rows:
        kind, street, note = classify(name, location, by_name.get(normalize_name(name), []), city_key)
        buckets[kind].append((rid, name, location, street, note, lat is None or lng is None))

    written = 0
    if args.apply and buckets["set"]:
        cur.executemany(
            "UPDATE restaurants SET street = %s, updated_at = now() "
            "WHERE id = %s AND (street IS NULL OR btrim(street) = '') "
            "AND reviewed_at IS NULL AND status = 'active'",
            [(street, rid) for rid, _n, _l, street, _note, _q in buckets["set"]],
        )
        written = cur.rowcount if cur.rowcount >= 0 else len(buckets["set"])
        conn.commit()

    if args.report:
        with open(args.report, "w") as fh:
            fh.write("decision\tid\tname\tlocation\tstreet\tnote\tin_review_queue\n")
            for kind, items in buckets.items():
                for rid, name, loc, street, note, queued in items:
                    fh.write(f"{kind}\t{rid}\t{name}\t{loc or ''}\t{street or ''}\t{note}\t{queued}\n")

    for kind, label in (("set", "would set" if not args.apply else "set"),
                        ("ambiguous", "ambiguous"), ("none", "no match")):
        items = buckets[kind]
        print(f"\n{label}: {len(items)}")
        for rid, name, loc, street, note, _q in items[: args.samples]:
            print(f"  #{rid} {name} [{loc}] -> {street or note}")

    queued = sum(1 for it in buckets["ambiguous"] if it[5])
    print(
        f"\nsummary: {len(buckets['set'])} {'set' if args.apply else 'would-set'}, "
        f"{len(buckets['ambiguous'])} ambiguous ({queued} already in /admin/geocode queue: no coordinates), "
        f"{len(buckets['none'])} no-match"
    )
    if args.apply:
        print(f"APPLIED {written} street updates.")
    else:
        print("(dry run -- pass --apply to write)")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
