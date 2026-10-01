#!/usr/bin/env python3
"""Deterministic identity and policy rules for issue #200; no database mutations."""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from typing import Any
from urllib.parse import urlsplit

import psycopg.conninfo
import tldextract

THRESHOLD = 6
GENERIC_TOKENS = {
    'bar',
    'cafe',
    'coffee',
    'pizza',
    'burger',
    'burgers',
    'taco',
    'tacos',
    'golden',
    'dragon',
    'sunrise',
    'buona',
    'tim',
    'costa',
    'restaurant',
    'grill',
}
PLATFORM_DOMAINS = {
    'toasttab.com',
    'toast.site',
    'square.site',
    'squareup.com',
    'wix.com',
    'wixsite.com',
    'squarespace.com',
    'weebly.com',
    'wordpress.com',
    'godaddysites.com',
    'sites.google.com',
    'google.com',
    'facebook.com',
    'instagram.com',
    'yelp.com',
    'tripadvisor.com',
    'doordash.com',
    'ubereats.com',
    'grubhub.com',
    'seamless.com',
    'chownow.com',
    'clover.com',
    'order.online',
    'menufy.com',
    'food-order.net',
    'postmates.com',
    'restaurantji.com',
    'linktr.ee',
    'business.site',
    'mapquest.com',
    'foursquare.com',
    'olo.com',
    'eatchownow.com',
    'singleplatform.com',
    'eat24hour.com',
    'skytab.com',
    'twitter.com',
    'x.com',
    'poi.place',
    'hub.biz',
    'areaguides.net',
    'cafe-inspector.com',
    'cafes-guide.com',
    'cafes-nearby.com',
    'cafes-usa.com',
    'ocregister.com',
    'yahoo.com',
    'telemundo.com',
    'visitnewportbeach.com',
}
_SUFFIX = tldextract.TLDExtract(suffix_list_urls=(), include_psl_private_domains=True)


def name_tokens(name: str) -> tuple[str, ...]:
    name = ''.join(
        c
        for c in unicodedata.normalize('NFKD', name.casefold())
        if not unicodedata.combining(c)
    )
    name = re.sub(r"['’`&]", '', name)
    tokens = re.findall(r'[a-z0-9]+', name)
    if tokens and tokens[0] == 'the':
        tokens = tokens[1:]
    return tuple(t for t in tokens if t != 'and')


def brand_matches(name: str, brand: str) -> bool:
    left, right = name_tokens(name), name_tokens(brand)
    if not left or not right or len(left) < len(right):
        return False
    if len(right) == 1 and right[0] in GENERIC_TOKENS:
        return False
    return left[: len(right)] == right


def website_domain(url: str) -> str | None:
    parsed = urlsplit(url if '://' in url else 'https://' + url)
    host = (parsed.hostname or '').lower().strip('.')
    if parsed.scheme not in {'http', 'https'} or not host or host == 'localhost':
        return None
    if re.fullmatch(r'[\d.]+', host) or ':' in host:
        return None
    for domain in PLATFORM_DOMAINS:
        if host == domain or host.endswith('.' + domain):
            return None
    domain = _SUFFIX(host).top_domain_under_public_suffix
    return domain or None


def validate_scratch_dsn(dsn: str) -> dict[str, str]:
    """Require a named loopback scratch DB; do not consult DATABASE_URL or .env."""
    try:
        params = psycopg.conninfo.conninfo_to_dict(dsn)
    except Exception as exc:
        raise ValueError('Invalid scratch DSN') from exc
    if params.get('host') not in {'localhost', '127.0.0.1', '::1'}:
        raise ValueError('Scratch database host must be loopback')
    if params.get('hostaddr') and params['hostaddr'] not in {'127.0.0.1', '::1'}:
        raise ValueError('Scratch hostaddr must be loopback')
    if 'service' in params or not params.get('dbname', '').endswith('_scratch'):
        raise ValueError(
            'Require an explicit *_scratch database without a service override'
        )
    return params


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, math.radians(b[1] - a[1])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 6371000 * 2 * math.asin(min(1, math.sqrt(h)))


def distinct_locations(coords: list[tuple[float, float]], radius_m: float = 60) -> int:
    """Use meter-sized spherical Cartesian cells, including poles and antimeridian."""
    if radius_m <= 0:
        raise ValueError('Location deduplication radius must be positive')
    centers: list[tuple[float, float]] = []
    cells: dict[tuple[int, int, int], list[tuple[float, float]]] = {}
    for coord in sorted(set(coords)):
        lat, lon = (math.radians(v) for v in coord)
        xyz = (
            6371000 * math.cos(lat) * math.cos(lon),
            6371000 * math.cos(lat) * math.sin(lon),
            6371000 * math.sin(lat),
        )
        cell = tuple(math.floor(v / radius_m) for v in xyz)
        neighbors = [
            p
            for dz in (-1, 0, 1)
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
            for p in cells.get((cell[0] + dx, cell[1] + dy, cell[2] + dz), [])
        ]
        if any(distance_m(coord, p) <= radius_m for p in neighbors):
            continue
        centers.append(coord)
        cells.setdefault(cell, []).append(coord)
    return len(centers)


def decide(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    positive, negative = [], []
    for item in evidence:
        count = item.get('count')
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            continue
        if not item.get('identity_verified') or item.get('scope') != 'worldwide':
            continue
        if item.get('kind') in {'S4', 'S5', 'S6'} and not item.get('supported', True):
            continue
        if count >= THRESHOLD:
            positive.append(item)
        elif item.get('complete'):
            negative.append(item)
    if positive and negative:
        return {'decision': 'unknown', 'signals': [], 'conflict': True}
    decisive = positive or negative
    return {
        'decision': 'chain' if positive else 'independent' if negative else 'unknown',
        'signals': sorted({e['kind'] for e in decisive}),
        'conflict': False,
    }


def summarize(
    rows: list[dict[str, Any]], expected_chains: set[int] | None = None
) -> dict[str, Any]:
    expected = expected_chains or set()
    flagged = {r['id'] for r in rows if r['decision'] == 'chain'}
    return {
        'rows': len(rows),
        'decisions': dict(Counter(r['decision'] for r in rows)),
        'signals': dict(Counter(s for r in rows for s in r['signals'])),
        'chain_recall': len(flagged & expected) / len(expected) if expected else None,
        'expected_chains': len(expected),
        'missed_chain_ids': sorted(expected - flagged),
    }
