#!/usr/bin/env python3
"""Local, resumable Reddit work queue. No network, model or database access."""
import argparse
from collections import Counter
from contextlib import contextmanager
import fcntl
import json
import math
import os
from pathlib import Path
import re
import tempfile
import time
from urllib.parse import urlsplit
import uuid

STATES = {'queued', 'running', 'failed', 'complete', 'skipped', 'rejected'}
POST_ID = re.compile(r'^[a-z0-9]{3,12}$')
SUBREDDIT = re.compile(r'^[a-z0-9_]{2,32}$')


def canonical_post(value, subreddit=None):
    if not isinstance(value, str):
        raise ValueError('Expected a Reddit post URL, fullname or ID')
    value = value.strip()
    supplied_subreddit = subreddit.lower() if isinstance(subreddit, str) and subreddit else None
    if '://' in value:
        parsed = urlsplit(value)
        if parsed.scheme not in {'http', 'https'} or parsed.username or parsed.password or parsed.port:
            raise ValueError('Unsupported Reddit URL')
        host = (parsed.hostname or '').lower()
        if host == 'redd.it':
            parts = parsed.path.strip('/').split('/')
            if len(parts) != 1:
                raise ValueError('Expected a Reddit post URL')
            post_id = parts[0].lower()
        elif host in {'reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com'}:
            match = re.match(r'^/r/([A-Za-z0-9_]+)/comments/([A-Za-z0-9]+)(?:/|$)', parsed.path)
            if not match:
                raise ValueError('Expected a Reddit post URL')
            url_subreddit, post_id = (x.lower() for x in match.groups())
            if supplied_subreddit and supplied_subreddit != url_subreddit:
                raise ValueError('Conflicting subreddit identity')
            supplied_subreddit = url_subreddit
        else:
            raise ValueError('Expected an official Reddit post URL')
    else:
        post_id = value.lower().removeprefix('t3_')
    if not POST_ID.fullmatch(post_id):
        raise ValueError('Invalid Reddit post ID')
    if supplied_subreddit and not SUBREDDIT.fullmatch(supplied_subreddit):
        raise ValueError('Invalid subreddit')
    url = f'https://www.reddit.com/r/{supplied_subreddit}/comments/{post_id}/' if supplied_subreddit else f'https://redd.it/{post_id}'
    return {'post_id': post_id, 'subreddit': supplied_subreddit, 'url': url}


def audit_posts(document):
    if not isinstance(document, dict) or not isinstance(document.get('actionable_unchecked'), list):
        raise ValueError('Expected an audit snapshot with actionable_unchecked')
    records = [dict(record) for record in document['actionable_unchecked']]
    metadata = document.get('tracker_metadata', {})
    for key, state in [('intentionally_skipped', 'skipped'), ('rejected', 'rejected')]:
        records.extend({**record, 'state': state} for record in metadata.get(key, []))
    return records


class Queue:
    def __init__(self, path):
        self.path = Path(path)

    def _read(self):
        if not self.path.exists():
            return {'schema_version': 1, 'posts': {}}
        try:
            document = json.loads(self.path.read_text())
        except (ValueError, UnicodeError) as exc:
            raise ValueError('Queue file is malformed; refusing to overwrite it') from exc
        if not isinstance(document, dict) or document.get('schema_version') != 1 or not isinstance(document.get('posts'), dict):
            raise ValueError('Unsupported queue schema')
        for post_id, record in document['posts'].items():
            if not isinstance(record, dict) or record.get('post_id') != post_id or record.get('state') not in STATES or type(record.get('attempts')) is not int or record['attempts'] < 0:
                raise ValueError('Invalid queue record')
            canonical_post(post_id, record.get('subreddit'))
            if record['state'] == 'running':
                lease = record.get('lease_until')
                token = record.get('claim_token')
                if not isinstance(token, str) or not re.fullmatch(r'[a-f0-9]{32}', token) or type(lease) not in (int, float) or not math.isfinite(lease):
                    raise ValueError('Invalid running claim')
        return document

    def _save(self, document):
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', dir=self.path.parent, prefix=f'.{self.path.name}.', delete=False) as stream:
                temporary = Path(stream.name)
                json.dump(document, stream, indent=2, sort_keys=True)
                stream.write('\n')
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    @contextmanager
    def _transaction(self, write=True):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.with_suffix(self.path.suffix + '.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                document = self._read()
                yield document
                if write:
                    self._save(document)
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def snapshot(self):
        with self._transaction(write=False) as document:
            return document

    def import_posts(self, records):
        added = 0
        with self._transaction() as document:
            for raw in records:
                if not isinstance(raw, dict):
                    raise ValueError('Expected a post record')
                state = raw.get('state', 'queued')
                if not isinstance(state, str) or state not in {'queued', 'skipped', 'rejected'}:
                    raise ValueError('Imports may only queue or preserve intentional skips/rejections')
                identity = canonical_post(raw.get('url') or raw.get('canonical_url') or raw.get('post_id'), raw.get('subreddit'))
                if raw.get('post_id') and canonical_post(raw['post_id'])['post_id'] != identity['post_id']:
                    raise ValueError('Conflicting post identity')
                post_id = identity['post_id']
                existing = document['posts'].get(post_id)
                if existing:
                    if existing.get('subreddit') and identity['subreddit'] and existing['subreddit'] != identity['subreddit']:
                        raise ValueError('Conflicting subreddit identity')
                    if state in {'skipped', 'rejected'}:
                        if existing['state'] == 'running':
                            raise ValueError('Cannot skip or reject a running claim; resolve its ownership first')
                        if existing['state'] in {'queued', 'failed'}:
                            existing['state'] = state
                    if identity['subreddit'] and not existing.get('subreddit'):
                        existing.update(identity)
                    existing['capture_present'] = existing.get('capture_present', False) or raw.get('capture_present', False) is True
                    continue
                document['posts'][post_id] = {**identity, 'state': state, 'attempts': 0, 'capture_present': raw.get('capture_present') is True}
                added += 1
        return added

    @staticmethod
    def _clock(now):
        return time.time() if now is None else now

    @staticmethod
    def _lease(seconds):
        if type(seconds) is not int or seconds <= 0:
            raise ValueError('Lease must be a positive number of seconds')
        return seconds

    @staticmethod
    def _owned(record, token, now):
        if record['state'] != 'running' or not isinstance(token, str) or token != record.get('claim_token') or now >= record.get('lease_until', 0):
            raise ValueError('Claim is stale, expired or not owned by this worker')

    def claim(self, post_id, *, now=None, lease_seconds=1800):
        seconds = self._lease(lease_seconds)
        with self._transaction() as document:
            now = self._clock(now)
            record = document['posts'][canonical_post(post_id)['post_id']]
            if record['state'] not in {'queued', 'failed'}:
                raise ValueError('Post is not queued or retryable')
            record.update(state='running', claim_token=uuid.uuid4().hex, lease_until=now + seconds, updated_at=now, attempts=record['attempts'] + 1)
            return dict(record)

    def renew(self, post_id, token, *, now=None, lease_seconds=1800):
        seconds = self._lease(lease_seconds)
        with self._transaction() as document:
            now = self._clock(now)
            record = document['posts'][canonical_post(post_id)['post_id']]
            self._owned(record, token, now)
            record.update(lease_until=now + seconds, updated_at=now)

    def finish(self, post_id, token, result, *, now=None):
        post_id = canonical_post(post_id)['post_id']
        if not isinstance(result, dict) or not isinstance(result.get('thread_id'), str) or not re.fullmatch(r'[A-Za-z0-9_]{2,32}-[a-z0-9]{3,12}', result['thread_id']) or result['thread_id'].rsplit('-', 1)[-1].lower() != post_id:
            raise ValueError('Completion requires a matching verified thread result')
        if any(type(result.get(key)) is not int or result[key] < 0 for key in ('restaurants', 'mentions')):
            raise ValueError('Completion requires nonnegative restaurant and mention counts')
        with self._transaction() as document:
            now = self._clock(now)
            record = document['posts'][post_id]
            self._owned(record, token, now)
            if record.get('subreddit') and result['thread_id'].rsplit('-', 1)[0].lower() != record['subreddit']:
                raise ValueError('Result does not match the queued subreddit')
            record.update(state='complete', result={key: result[key] for key in ('thread_id', 'restaurants', 'mentions')}, updated_at=now)
            record.pop('claim_token', None)
            record.pop('lease_until', None)
            record.pop('error', None)

    def fail(self, post_id, token, error, *, now=None):
        if not isinstance(error, str) or not error.strip():
            raise ValueError('Failure needs a diagnostic reason without credentials/source text')
        with self._transaction() as document:
            now = self._clock(now)
            record = document['posts'][canonical_post(post_id)['post_id']]
            self._owned(record, token, now)
            record.update(state='failed', error=error[:500], updated_at=now)
            record.pop('claim_token', None)
            record.pop('lease_until', None)

    def recover(self, *, now=None):
        recovered = []
        with self._transaction() as document:
            now = self._clock(now)
            for post_id, record in document['posts'].items():
                if record['state'] == 'running' and now >= record['lease_until']:
                    record.update(state='failed', error='Previous claim lease expired; explicit retry required', updated_at=now)
                    record.pop('claim_token', None)
                    record.pop('lease_until', None)
                    recovered.append(post_id)
        return recovered


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--queue', type=Path, default=Path('output/ingestion/queue.json'))
    commands = parser.add_subparsers(dest='command', required=True)
    importing = commands.add_parser('import')
    importing.add_argument('--audit', type=Path)
    importing.add_argument('--urls', type=Path, help='One public Reddit thread URL per line')
    commands.add_parser('status')
    commands.add_parser('recover')
    for name in ('claim', 'renew', 'finish', 'fail'):
        command = commands.add_parser(name)
        command.add_argument('post_id')
        if name != 'claim':
            command.add_argument('--token', required=True)
        if name in {'claim', 'renew'}:
            command.add_argument('--lease-seconds', type=int, default=1800)
        if name == 'finish':
            command.add_argument('--thread-id', required=True)
            command.add_argument('--restaurants', type=int, required=True)
            command.add_argument('--mentions', type=int, required=True)
        if name == 'fail':
            command.add_argument('--reason', required=True)
    args = parser.parse_args(argv)
    queue = Queue(args.queue)
    try:
        if args.command == 'import':
            if bool(args.audit) == bool(args.urls):
                raise ValueError('Choose exactly one of --audit or --urls')
            records = audit_posts(json.loads(args.audit.read_text())) if args.audit else [{'url': line.strip()} for line in args.urls.read_text().splitlines() if line.strip() and not line.lstrip().startswith('#')]
            result = {'added': queue.import_posts(records)}
        elif args.command == 'status':
            result = {'counts': dict(Counter(record['state'] for record in queue.snapshot()['posts'].values()))}
        elif args.command == 'recover':
            result = {'recovered': queue.recover()}
        elif args.command == 'claim':
            result = queue.claim(args.post_id, lease_seconds=args.lease_seconds)
        elif args.command == 'renew':
            queue.renew(args.post_id, args.token, lease_seconds=args.lease_seconds)
            result = {'renewed': args.post_id}
        elif args.command == 'finish':
            queue.finish(args.post_id, args.token, {'thread_id': args.thread_id, 'restaurants': args.restaurants, 'mentions': args.mentions})
            result = {'complete': args.post_id}
        else:
            queue.fail(args.post_id, args.token, args.reason)
            result = {'failed': args.post_id}
    except (ValueError, KeyError, OSError) as exc:
        parser.exit(1, f'Queue operation failed: {exc}\n')
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
