"""Fail-closed ingestion of reviewed, source-bound restaurant scope.

The publication manifest is also the ingestion contract. Never infer scope from
an unreviewed comment or copy a reviewed source to another restaurant.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

MANIFEST_PATH = Path(__file__).resolve().parents[1] / 'data' / 'restaurant-curation.json'


class CurationError(ValueError):
    """A reviewed identity assertion no longer matches the ingest or database."""


def _require(condition, message):
    if not condition:
        raise CurationError(message)


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _https_url(value):
    if not _text(value):
        return False
    try:
        parsed = urlsplit(value)
        return parsed.scheme == 'https' and bool(parsed.hostname)
    except ValueError:
        return False


def identity(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())


def validate_manifest(value):
    _require(isinstance(value, dict) and set(value) == {'version', 'restaurants'}
             and type(value['version']) is int and value['version'] == 1
             and isinstance(value['restaurants'], list), 'Invalid curation manifest')
    slugs, source_keys = set(), set()
    for record in value['restaurants']:
        _require(isinstance(record, dict) and set(record) == {'slug', 'name', 'scope', 'locations', 'evidence_urls', 'sources'}, 'Invalid curation record fields')
        _require(_text(record['slug']) and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', record['slug']) and record['slug'] not in slugs, 'Invalid or duplicate curation slug')
        slugs.add(record['slug'])
        _require(_text(record['name']) and record['scope'] == 'multiple_locations', 'Invalid curation scope')
        _require(isinstance(record['locations'], list) and len(record['locations']) >= 2, 'Multiple locations required')
        for location in record['locations']:
            _require(isinstance(location, dict) and set(location) == {'city', 'street'} and all(_text(v) for v in location.values()), 'Invalid reviewed location')
        _require(len({(loc['city'].strip(), loc['street'].strip()) for loc in record['locations']}) == len(record['locations']), 'Duplicate reviewed location')
        _require(isinstance(record['evidence_urls'], list) and bool(record['evidence_urls']) and all(_https_url(u) for u in record['evidence_urls']), 'Invalid evidence URLs')
        _require(isinstance(record['sources'], list) and bool(record['sources']), 'Reviewed sources required')
        for source in record['sources']:
            _require(isinstance(source, dict) and set(source) == {'thread_id', 'comment_id', 'role', 'body_sha256', 'names_restaurant'}, 'Invalid source fields')
            _require(_text(source['thread_id']) and _text(source['comment_id']) and source['role'] in ('primary', 'endorsement') and (source['names_restaurant'] is None or type(source['names_restaurant']) is bool) and isinstance(source['body_sha256'], str) and re.fullmatch(r'[a-f0-9]{64}', source['body_sha256']), 'Invalid reviewed source')
            key = (source['thread_id'], source['comment_id'])
            _require(key not in source_keys, 'Duplicate reviewed source')
            source_keys.add(key)
    return value['restaurants']


def load_manifest():
    return validate_manifest(json.loads(MANIFEST_PATH.read_text()))


def comments(candidate):
    for comment in candidate.get('primary_comments') or [candidate['primary_comment']]:
        yield comment, 'primary'
    for comment in candidate.get('endorsements', []):
        yield comment, 'endorsement'


def matches_source(comment, role, source):
    return role == source['role'] and hashlib.sha256(comment['body'].encode('utf-8')).hexdigest() == source['body_sha256']


def partition(thread_id, candidates, records):
    """Route only exact reviewed candidates, before generic dedupe/slug logic."""
    active = {identity(r['name']): r for r in records if any(s['thread_id'] == thread_id for s in r['sources'])}
    expected = {r['slug']: {s['comment_id']: s for s in r['sources'] if s['thread_id'] == thread_id} for r in active.values()}
    seen = {slug: set() for slug in expected}
    ordinary, scoped = [], []
    for candidate in candidates:
        record = active.get(identity(candidate['name']))
        if record is None:
            ordinary.append(candidate)
            continue
        slug = record['slug']
        if not any(comment['id'] in expected[slug] for comment, _ in comments(candidate)):
            ordinary.append(candidate)
            continue
        for comment, role in comments(candidate):
            source = expected[slug].get(comment['id'])
            _require(source is not None and matches_source(comment, role, source), 'Reviewed source missing, changed, or unreviewed source attached')
            _require(comment['id'] not in seen[slug], 'Duplicate reviewed input source')
            seen[slug].add(comment['id'])
        masked = copy.deepcopy(candidate)
        for key in ('location', 'street', 'lat', 'lng'):
            masked[key] = None
        scoped.append((masked, slug))
    for slug, sources in expected.items():
        _require(seen[slug] == set(sources), 'Reviewed input source missing; refusing thread cleanup')
    return ordinary, scoped


def verify_database(cur, thread_id, records):
    """Lock and validate the source assertions; preserve unrelated attachments.

    Returns target IDs, original relevance flags, and cleanup-protected mention
    IDs. All checks happen inside the caller transaction before any writes.
    """
    active = [r for r in records if any(s['thread_id'] == thread_id for s in r['sources'])]
    if not active:
        return {}, {}, []
    cur.execute('LOCK TABLE restaurants, mentions IN SHARE ROW EXCLUSIVE MODE')
    targets, flags, protected = {}, {}, []
    for record in active:
        cur.execute('SELECT id, name FROM restaurants WHERE slug = %s', (record['slug'],))
        rows = cur.fetchall()
        _require(len(rows) == 1, 'Reviewed target missing or duplicated')
        row = rows[0]
        target_id, name = (row['id'], row['name']) if isinstance(row, dict) else row
        _require(identity(name) == identity(record['name']), 'Reviewed target name changed')
        targets[record['slug']] = target_id
        sources = {s['comment_id']: s for s in record['sources'] if s['thread_id'] == thread_id}
        cur.execute('''SELECT m.id, m.restaurant_id, r.slug, r.name, m.comment_id,
                              m.body, m.role, m.names_restaurant
                       FROM mentions m JOIN restaurants r ON r.id = m.restaurant_id
                       WHERE m.thread_id = %s AND (m.comment_id = ANY(%s) OR m.restaurant_id = %s)''',
                    (thread_id, list(sources), target_id))
        found = set()
        for row in cur.fetchall():
            values = tuple(row[k] for k in ('id', 'restaurant_id', 'slug', 'name', 'comment_id', 'body', 'role', 'names_restaurant')) if isinstance(row, dict) else row
            mention_id, restaurant_id, slug, name, comment_id, body, role, flag = values
            if restaurant_id == target_id:
                source = sources.get(comment_id)
                _require(source is not None and matches_source({'body': body}, role, source) and flag is source['names_restaurant'], 'Reviewed stored source changed or unexpected attachment')
                _require(comment_id not in found, 'Duplicate reviewed stored source')
                found.add(comment_id)
            else:
                _require(identity(name) != identity(record['name']), 'Reviewed source attached to conflicting restaurant')
                protected.append(mention_id)
            flags[(slug, comment_id)] = flag
        _require(found == set(sources), 'Reviewed stored source missing')
    return targets, flags, protected
