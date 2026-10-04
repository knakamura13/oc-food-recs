"""Reviewed identity-bound evidence, shared by ingest and exclusion backfills.

This ledger is a human-audited policy input, not a model response format. A new
entry requires local identity and worldwide count source review in a PR.
"""
from datetime import date, datetime, timezone
from functools import lru_cache
import json
from pathlib import Path
import re

MAX_AGE_DAYS = 90


def identity(value):
	"""Exact tokens, preserving word boundaries; no brand-prefix matching."""
	if not isinstance(value, str):
		return ''
	return ' '.join(re.findall(r'[a-z0-9]+', value.casefold().replace('’', "'")))


@lru_cache(maxsize=1)
def reviewed_entries():
	return json.loads(Path(__file__).with_name('chain_policy_evidence.json').read_text())['entries']


def decision(restaurant, *, entries=None, today=None):
	"""Unknown unless fresh, reviewed evidence matches all three identity fields."""
	today = today or datetime.now(timezone.utc).date()
	key = tuple(identity(restaurant.get(field)) for field in ('name', 'location', 'street'))
	if not all(key):
		return 'unknown'
	decisions = set()
	for entry in reviewed_entries() if entries is None else entries:
		if not isinstance(entry, dict):
			continue
		if key != tuple(identity(entry.get(field)) for field in ('name', 'location', 'street')):
			continue
		try:
			age = (today - date.fromisoformat(entry['checked_at'])).days
		except (KeyError, TypeError, ValueError):
			continue
		count = entry.get('location_count')
		if not 0 <= age <= MAX_AGE_DAYS or type(count) is not int or count < 1:
			continue
		if not all(isinstance(entry.get(field), str) and entry[field].startswith('https://')
				for field in ('local_source', 'count_source')):
			continue
		kind = entry.get('count_kind')
		if kind not in ('worldwide_lower_bound', 'complete_worldwide'):
			continue
		if count >= 6:
			decisions.add('chain')
		elif kind == 'complete_worldwide':
			decisions.add('independent')
	return decisions.pop() if len(decisions) == 1 else 'unknown'
