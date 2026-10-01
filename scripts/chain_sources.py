"""Cached acquisition for issue #200. Exported Reddit evidence stays in ignored output."""

from __future__ import annotations

import concurrent.futures
import hashlib
import ipaddress
import json
import re
import socket
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import duckdb
import psycopg
import requests
from bs4 import BeautifulSoup
from psycopg.rows import dict_row

from chain_scorer import (
    brand_matches,
    distance_m,
    name_tokens,
    validate_scratch_dsn,
    website_domain,
)

RELEASE = '2026-09-23.1'
OVERTURE = f's3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*'
NSI_PATHS = [
    f'data/brands/amenity/{x}.json'
    for x in ['restaurant', 'fast_food', 'cafe', 'ice_cream', 'bar', 'pub']
] + [
    f'data/brands/shop/{x}.json'
    for x in [
        'bakery',
        'pastry',
        'coffee',
        'deli',
        'confectionery',
        'tea',
        'chocolate',
        'beverages',
    ]
]
WORDS = {
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
    'ten': 10,
    'eleven': 11,
    'twelve': 12,
    'thirteen': 13,
    'fourteen': 14,
    'fifteen': 15,
    'sixteen': 16,
    'seventeen': 17,
    'eighteen': 18,
    'nineteen': 19,
    'twenty': 20,
}
COUNT_RE = re.compile(
    r'\b(\d{1,5}|'
    + '|'.join(WORDS)
    + r')\s+(?:(?:restaurant|current|total|operating|different|global|worldwide|classic|distinct|unique|retail)\s+){0,2}(?:locations?|branches?|restaurants?|stores?|outlets?)\b',
    re.I,
)


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    import tempfile

    with tempfile.NamedTemporaryFile(
        mode='w',
        encoding='utf-8',
        dir=path.parent,
        prefix=path.name + '.',
        suffix='.tmp',
        delete=False,
    ) as f:
        json.dump(value, f, ensure_ascii=False, indent=2, default=str)
        f.write('\n')
        tmp = Path(f.name)
    tmp.replace(path)


def place_matches(restaurant, place):
    a, b = name_tokens(restaurant['name']), name_tokens(place.get('name') or '')
    same = a == b
    qualified_prefix = min(len(a), len(b)) >= 2 and (
        a[: len(b)] == b or b[: len(a)] == a
    )
    if not same and not qualified_prefix:
        return False
    if restaurant.get('lat') is not None and restaurant.get('lng') is not None:
        if place.get('lat') is None or place.get('lon') is None:
            return False
        return (
            distance_m(
                (float(restaurant['lat']), float(restaurant['lng'])),
                (place['lat'], place['lon']),
            )
            <= 250
        )
    return (
        same
        and bool(restaurant.get('location'))
        and name_tokens(restaurant['location']) == name_tokens(place.get('city') or '')
    )


def explicit_location_counts(text):
    return [
        int(m.group(1)) if m.group(1).isdigit() else WORDS[m.group(1).lower()]
        for m in COUNT_RE.finditer(text)
    ]


def grounded_count(result, sources):
    count, quote, index = result.get('count'), result.get('quote'), result.get('source')
    return (
        isinstance(count, int)
        and not isinstance(count, bool)
        and count > 0
        and isinstance(index, int)
        and 0 <= index < len(sources)
        and isinstance(quote, str)
        and len(quote.strip()) >= 12
        and quote in sources[index]
        and count in explicit_location_counts(quote)
    )


def model_evidence(kind, result, sources):
    if kind == 'S6' and result.get('decision') not in {'chain', 'independent'}:
        return []
    if not grounded_count(result, sources):
        return []
    if kind == 'S6' and (result['decision'] == 'chain') != (result['count'] >= 6):
        return []
    return [
        {
            'kind': kind,
            'count': result['count'],
            'scope': 'worldwide',
            'identity_verified': result.get('identity_verified') is True,
            'complete': result.get('complete') is True,
            'supported': True,
            'quote': result['quote'],
            'source': result['source'],
        }
    ]


def snapshot(dsn):
    params = validate_scratch_dsn(dsn)
    address = '::1' if params['host'] == '::1' else '127.0.0.1'
    with psycopg.connect(
        dsn,
        hostaddr=address,
        options='-c default_transaction_read_only=on',
        row_factory=dict_row,
    ) as c:
        identity = c.execute(
            "SELECT current_database() AS db, current_setting('transaction_read_only') AS readonly, host(inet_server_addr()) AS address"
        ).fetchone()
        if (
            not identity['db'].endswith('_scratch')
            or identity['readonly'] != 'on'
            or not ipaddress.ip_address(identity['address']).is_private
        ):
            raise ValueError(
                'Database identity is not a read-only loopback scratch restore'
            )
        tables = c.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
        ).fetchall()
        hashes = {}
        for t in tables:
            q = psycopg.sql.SQL(
                'SELECT row_to_json(t)::text AS value FROM {} t ORDER BY row_to_json(t)::text'
            ).format(psycopg.sql.Identifier(t['tablename']))
            rows = c.execute(q).fetchall()
            hashes[t['tablename']] = {
                'count': len(rows),
                'sha256': hashlib.sha256(
                    '\n'.join(r['value'] for r in rows).encode()
                ).hexdigest(),
            }
        restaurants = c.execute(
            "SELECT id,name,slug,location,street,lat,lng,status,exclusion_reason FROM restaurants ORDER BY id"
        ).fetchall()
        mentions = c.execute(
            "SELECT m.id,m.restaurant_id,m.body,m.permalink,t.title AS thread_title FROM mentions m JOIN threads t ON t.id=m.thread_id WHERE coalesce(m.body,'')<>'' ORDER BY m.id"
        ).fetchall()
        return {
            'identity': identity,
            'fingerprint': hashes,
            'restaurants': restaurants,
            'mentions': mentions,
        }


def nsi_brands(data):
    brands = []
    for item in data.get('items', []):
        include = item.get('locationSet', {}).get('include', [])
        if not any(
            (
                isinstance(v, str)
                and (v in {'001', '019', '021', 'us'} or v.startswith('us-'))
            )
            or isinstance(v, list)
            for v in include
        ):
            continue
        tags = item.get('tags', {})
        brand = tags.get('brand') or tags.get('name') or item.get('displayName')
        if brand:
            brands.append(
                {
                    'name': brand,
                    'source': 'NSI',
                    'id': item.get('id'),
                    'wikidata': tags.get('brand:wikidata'),
                }
            )
    return brands


def download_nsi(cache):
    manifest_path = cache / 'nsi.json'
    if manifest_path.exists():
        return json.loads(manifest_path.read_text())
    commit = requests.get(
        'https://api.github.com/repos/osmlab/name-suggestion-index/commits/main',
        timeout=30,
    )
    commit.raise_for_status()
    sha = commit.json()['sha']
    brands = []
    for path in NSI_PATHS:
        url = f'https://raw.githubusercontent.com/osmlab/name-suggestion-index/{sha}/{path}'
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        write_json(cache / 'nsi' / Path(path).name, data)
        brands.extend(nsi_brands(data))
    result = {'commit': sha, 'paths': NSI_PATHS, 'brands': brands}
    write_json(manifest_path, result)
    return result


def overture_connection():
    c = duckdb.connect()
    c.execute(
        "SET memory_limit='1GB'; SET max_temp_directory_size='2GB'; SET threads=4; INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';"
    )
    return c


def local_places(cache):
    path = cache / 'overture-local.parquet'
    if not path.exists():
        c = overture_connection()
        c.execute(
            f"COPY (SELECT id,names.primary AS name,websites,phones,confidence,operating_status,bbox.xmin AS lon,bbox.ymin AS lat,addresses[1].locality AS city FROM read_parquet('{OVERTURE}',hive_partitioning=1) WHERE bbox.xmin BETWEEN -119 AND -116 AND bbox.ymin BETWEEN 32.5 AND 34.8 AND taxonomy.hierarchy[1]='food_and_drink' AND operating_status IS DISTINCT FROM 'permanently_closed') TO '{path}' (FORMAT PARQUET)"
        )
        c.close()
    c = duckdb.connect()
    cursor = c.execute('SELECT * FROM read_parquet(?)', [str(path)])
    names = [x[0] for x in cursor.description]
    rows = [dict(zip(names, r)) for r in cursor.fetchall()]
    c.close()
    return rows


def match_places(restaurants, places):
    grid = defaultdict(list)
    city_names = defaultdict(list)
    for p in places:
        grid[(int(p['lat'] * 100), int(p['lon'] * 100))].append(p)
        city_names[(name_tokens(p['name']), name_tokens(p.get('city') or ''))].append(p)
    matched = {}
    for r in restaurants:
        if r['lat'] is not None and r['lng'] is not None:
            cell = (int(float(r['lat']) * 100), int(float(r['lng']) * 100))
            candidates = [
                p
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
                for p in grid[(cell[0] + dy, cell[1] + dx)]
            ]
        else:
            candidates = city_names[
                (name_tokens(r['name']), name_tokens(r['location'] or ''))
            ]
        matched[r['id']] = [p for p in candidates if place_matches(r, p)]
    return matched


def global_places(cache, restaurants, matches):
    """Scan globally, retaining relevant website/name/phone rows rather than the full extract."""
    path = cache / 'overture-global.parquet'
    domains = sorted(
        {
            website_domain(w)
            for pp in matches.values()
            for p in pp
            for w in p.get('websites') or []
        }
        - {None}
    )
    names = sorted(
        {' '.join(name_tokens(r['name'])) for r in restaurants}
        | {' '.join(name_tokens(p['name'])) for pp in matches.values() for p in pp}
    )
    phones = sorted(
        {
            phone
            for pp in matches.values()
            for p in pp
            for phone in p.get('phones') or []
        }
    )
    signature = hashlib.sha256(
        json.dumps([RELEASE, 'static-domain-v2', domains, names, phones]).encode()
    ).hexdigest()
    meta = cache / 'overture-global.json'
    if path.exists() and (
        not meta.exists() or json.loads(meta.read_text())['signature'] != signature
    ):
        raise ValueError(
            'Global cache belongs to a different restaurant/source selection'
        )
    if not path.exists():
        c = overture_connection()
        c.execute('CREATE TEMP TABLE target_names(name VARCHAR)')
        c.executemany('INSERT INTO target_names VALUES (?)', [(n,) for n in names])
        norm = "trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(strip_accents(names.primary)), '[’''`&]', '', 'g'), '[^a-z0-9]+', ' ', 'g'), '^the |\\band\\b', ' ', 'g'), ' +', ' ', 'g'))"
        domain_pattern = (
            '(?i)(?:https?://)?(?:[a-z0-9-]+[.])*(?:'
            + '|'.join(re.escape(d) for d in domains)
            + ')(?:[/: ]|$)'
        )
        escaped_pattern = domain_pattern.replace("'", "''")
        query = f"""SELECT id,names.primary AS name,websites,phones,confidence,operating_status,bbox.xmin AS lon,bbox.ymin AS lat,addresses[1].locality AS city
          FROM read_parquet('{OVERTURE}',hive_partitioning=1)
          WHERE taxonomy.hierarchy[1]='food_and_drink' AND operating_status IS DISTINCT FROM 'permanently_closed'
          AND ({norm} IN (SELECT name FROM target_names)
               OR regexp_matches(array_to_string(websites,' '),'{escaped_pattern}'))"""
        start = time.time()
        partial = path.with_suffix('.partial.parquet')
        c.execute(f"COPY ({query}) TO '{partial}' (FORMAT PARQUET)")
        c.close()
        partial.replace(path)
        write_json(
            meta,
            {
                'release': RELEASE,
                'scope': 'worldwide',
                'signature': signature,
                'seconds': round(time.time() - start, 2),
                'domains': len(domains),
                'names': len(names),
                'phones': len(phones),
                'query': query,
            },
        )
    c = duckdb.connect()
    cur = c.execute('SELECT * FROM read_parquet(?)', [str(path)])
    keys = [x[0] for x in cur.description]
    rows = [dict(zip(keys, r)) for r in cur.fetchall()]
    c.close()
    return rows


def public_url(url):
    host = urlsplit(url).hostname
    if (
        urlsplit(url).scheme not in {'http', 'https'}
        or not host
        or urlsplit(url).username
    ):
        raise ValueError('Only public HTTP URLs are allowed')
    addresses = socket.getaddrinfo(host, None)
    if not addresses or any(
        not ipaddress.ip_address(a[4][0]).is_global for a in addresses
    ):
        raise ValueError('Website resolves to a nonpublic address')


def website_text(url, cache):
    key = hashlib.sha256(url.encode()).hexdigest()
    path = cache / 'websites' / f'{key}.json'
    if path.exists():
        return json.loads(path.read_text())
    result = {'requested_url': url}
    try:
        for _ in range(5):
            public_url(url)
            with requests.get(
                url,
                timeout=(8, 15),
                allow_redirects=False,
                stream=True,
                headers={'User-Agent': 'OCFoodRecs-research/1.0'},
            ) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers['Location'])
                    continue
                response.raise_for_status()
                if not any(
                    t in response.headers.get('Content-Type', '').lower()
                    for t in ['html', 'text']
                ):
                    raise ValueError('Nontext website')
                chunks = []
                size = 0
                for chunk in response.iter_content(65536):
                    chunks.append(chunk)
                    size += len(chunk)
                    if size >= 1_000_000:
                        break
                soup = BeautifulSoup(b''.join(chunks), 'html.parser')
                for el in soup(['script', 'style', 'nav', 'footer', 'noscript']):
                    el.decompose()
                text = soup.get_text(' ', strip=True)
                links = [
                    urljoin(url, a['href'])
                    for a in soup.find_all('a', href=True)
                    if re.search(
                        r'location|about|our.story',
                        a.get_text(' ', strip=True) + ' ' + a['href'],
                        re.I,
                    )
                    and website_domain(urljoin(url, a['href'])) == website_domain(url)
                ]
                result.update(
                    {
                        'url': url,
                        'text': text[:30000],
                        'links': sorted(set(links))[:6],
                        'truncated': len(text) > 30000 or size >= 1_000_000,
                        'fetched_at': time.time(),
                    }
                )
                break
        else:
            raise ValueError('Too many redirects')
    except Exception as e:
        result['error'] = f'{type(e).__name__}: {e}'
    write_json(path, result)
    return result


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def atp_food_feature(feature):
    props = feature.get('properties') or {}
    return props.get('amenity') in {
        'restaurant',
        'fast_food',
        'cafe',
        'ice_cream',
        'bar',
        'pub',
        'food_court',
    } or props.get('shop') in {
        'bakery',
        'pastry',
        'coffee',
        'deli',
        'confectionery',
        'tea',
        'chocolate',
        'beverages',
    }


def atp_places(zip_path, cache, restaurants):
    import ijson
    import zipfile

    path = cache / 'atp.json'
    if path.exists():
        return json.loads(path.read_text())
    from collections import Counter

    candidates = defaultdict(list)
    for r in restaurants:
        tokens = name_tokens(r['name'])
        if tokens:
            candidates[tokens[0]].append(r)
    names = set()
    relevant = []
    food_rows = 0
    total = 0
    spiders = Counter()
    errors = []
    start = time.time()
    with zipfile.ZipFile(zip_path) as z:
        files = [
            f
            for f in z.infolist()
            if f.filename.endswith('.geojson') and f.file_size > 0
        ]
        for index, file in enumerate(files):
            try:
                with z.open(file) as stream:
                    for feature in ijson.items(stream, 'features.item'):
                        total += 1
                        if not atp_food_feature(feature):
                            continue
                        food_rows += 1
                        p = feature['properties']
                        brand = p.get('brand') or p.get('name')
                        if not isinstance(brand, str) or not brand:
                            continue
                        names.add(brand)
                        tokens = name_tokens(brand)
                        if not tokens or not any(
                            brand_matches(r['name'], brand)
                            for r in candidates[tokens[0]]
                        ):
                            continue
                        geometry = feature.get('geometry') or {}
                        coords = geometry.get('coordinates')
                        if geometry.get('type') != 'Point' or not coords:
                            continue
                        relevant.append(
                            {
                                'id': str(feature.get('id')),
                                'name': p.get('name') or brand,
                                'brand': brand,
                                'lat': float(coords[1]),
                                'lon': float(coords[0]),
                                'city': p.get('addr:city'),
                                'websites': [p['website']] if p.get('website') else [],
                                'phones': [p['phone']] if p.get('phone') else [],
                                'source': p.get('@source_uri'),
                                'spider': p.get('@spider'),
                            }
                        )
                        spiders[p.get('@spider')] += 1
            except ijson.JSONError as exc:
                errors.append({'file': file.filename, 'error': str(exc)[:300]})
                print('ATP malformed file', file.filename, flush=True)
            if index % 500 == 0:
                print(
                    f'ATP {index}/{len(files)} spiders, {food_rows} food rows, {len(relevant)} relevant',
                    flush=True,
                )
    result = {
        'run': '2026-09-26-13-32-25',
        'zip_sha256': file_sha256(zip_path),
        'total_features': total,
        'food_features': food_rows,
        'brands': sorted(names),
        'places': relevant,
        'spiders': dict(spiders),
        'parse_errors': errors,
        'seconds': round(time.time() - start, 2),
    }
    write_json(path, result)
    return result
