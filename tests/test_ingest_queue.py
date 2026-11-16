import fcntl
import importlib.util
import multiprocessing
from pathlib import Path
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'ingest_queue.py'


def load_queue():
    spec = importlib.util.spec_from_file_location('ingest_queue', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def import_one(path, post_id):
    load_queue().Queue(Path(path)).import_posts([{'post_id': post_id, 'subreddit': 'Anaheim'}])


def finish_after_lock_wait(path, token, attempted, result):
    module = load_queue()
    real_flock = module.fcntl.flock

    def flock(fd, operation):
        if operation == module.fcntl.LOCK_EX:
            attempted.set()
        return real_flock(fd, operation)

    # Signal immediately before the real blocking syscall, without replacing it.
    module.fcntl.flock = flock
    try:
        module.Queue(path).finish('abc123', token, {
            'thread_id': 'anaheim-abc123', 'restaurants': 0, 'mentions': 0,
        })
    except ValueError as exc:
        result.put(('rejected', str(exc)))
    else:
        result.put(('finished', None))


class IngestQueueTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_queue()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'queue.json'
        self.queue = self.mod.Queue(self.path)

    def seed(self):
        self.queue.import_posts([{'url': 'https://www.reddit.com/r/Anaheim/comments/abc123/title/', 'capture_present': True}])

    def test_canonical_urls_fullnames_and_ids(self):
        for value in ['https://old.reddit.com/r/Anaheim/comments/AbC123/name/?sort=new', 'https://redd.it/abc123', 't3_abc123', 'abc123']:
            self.assertEqual(self.mod.canonical_post(value, 'Anaheim')['post_id'], 'abc123')
        with self.assertRaises(ValueError):
            self.mod.canonical_post('https://evil.example/r/anaheim/comments/abc123/')

    def test_capture_does_not_imply_ingestion_and_duplicates_preserve_attempts(self):
        self.seed()
        record = self.queue.snapshot()['posts']['abc123']
        self.assertEqual(record['state'], 'queued')
        claim = self.queue.claim('abc123', now=10)
        self.queue.fail('abc123', claim['claim_token'], 'temporary failure', now=11)
        self.queue.import_posts([{'post_id': 'abc123', 'subreddit': 'ANAHEIM'}])
        record = self.queue.snapshot()['posts']['abc123']
        self.assertEqual(record['state'], 'failed')
        self.assertEqual(record['attempts'], 1)
        self.assertTrue(record['capture_present'])

    def test_same_post_conflicting_subreddit_is_not_silently_rewritten(self):
        self.seed()
        with self.assertRaises(ValueError):
            self.queue.import_posts([{'post_id': 'abc123', 'subreddit': 'irvine'}])
        self.assertEqual(self.queue.snapshot()['posts']['abc123']['subreddit'], 'anaheim')

    def test_skip_and_reject_are_never_claimable(self):
        for state in ['skipped', 'rejected']:
            self.queue.import_posts([{'post_id': 'abc123', 'subreddit': 'anaheim', 'state': state}])
            with self.assertRaises(ValueError):
                self.queue.claim('abc123', now=10)

    def test_retry_after_failure_and_verified_completion_is_terminal(self):
        self.seed()
        first = self.queue.claim('abc123', now=10)
        self.queue.fail('abc123', first['claim_token'], 'retryable', now=11)
        second = self.queue.claim('abc123', now=12)
        self.assertEqual(second['attempts'], 2)
        self.queue.finish('abc123', second['claim_token'], {'thread_id': 'Anaheim-abc123', 'restaurants': 2, 'mentions': 3}, now=13)
        self.queue.import_posts([{'post_id': 'abc123', 'subreddit': 'anaheim'}])
        with self.assertRaises(ValueError):
            self.queue.claim('abc123', now=14)
        self.assertEqual(self.queue.snapshot()['posts']['abc123']['state'], 'complete')

    def test_stale_worker_cannot_complete_recovered_claim(self):
        self.seed()
        first = self.queue.claim('abc123', now=10, lease_seconds=5)
        self.assertEqual(self.queue.recover(now=16), ['abc123'])
        second = self.queue.claim('abc123', now=17)
        with self.assertRaises(ValueError):
            self.queue.finish('abc123', first['claim_token'], {'thread_id': 'anaheim-abc123', 'restaurants': 0, 'mentions': 0}, now=18)
        self.assertEqual(self.queue.snapshot()['posts']['abc123']['claim_token'], second['claim_token'])

    def test_renew_keeps_long_running_claim_and_recovery_preserves_live_work(self):
        self.seed()
        claim = self.queue.claim('abc123', now=10, lease_seconds=5)
        self.queue.renew('abc123', claim['claim_token'], now=14, lease_seconds=10)
        self.assertEqual(self.queue.recover(now=16), [])

    def test_completion_requires_matching_verified_thread_result(self):
        self.seed()
        claim = self.queue.claim('abc123', now=10)
        for result in [{}, {'thread_id': 'irvine-other', 'restaurants': 0, 'mentions': 0}, {'thread_id': 'anaheim-abc123', 'restaurants': -1, 'mentions': 0}]:
            with self.assertRaises(ValueError):
                self.queue.finish('abc123', claim['claim_token'], result, now=11)
        self.assertEqual(self.queue.snapshot()['posts']['abc123']['state'], 'running')

    def test_malformed_state_is_not_overwritten(self):
        self.path.write_text('{broken')
        with self.assertRaises(ValueError):
            self.queue.import_posts([{'post_id': 'abc123'}])
        self.assertEqual(self.path.read_text(), '{broken')

    def test_failed_atomic_replace_preserves_previous_state(self):
        from unittest.mock import patch
        self.seed()
        original = self.path.read_bytes()
        with patch.object(self.mod.os, 'replace', side_effect=OSError('disk error')):
            with self.assertRaises(OSError):
                self.queue.claim('abc123', now=10)
        self.assertEqual(self.path.read_bytes(), original)

    def test_concurrent_imports_do_not_lose_updates(self):
        context = multiprocessing.get_context('fork')
        processes = [context.Process(target=import_one, args=(str(self.path), f'abc{i}')) for i in range(6)]
        for process in processes:
            process.start()
        for process in processes:
            process.join(10)
            self.assertEqual(process.exitcode, 0)
        self.assertEqual(len(self.queue.snapshot()['posts']), 6)

    def test_audit_import_keeps_intentional_skips_and_rejections(self):
        audit = {'actionable_unchecked': [{'post_id': 'abc123', 'subreddit': 'anaheim'}], 'tracker_metadata': {'intentionally_skipped': [{'post_id': 'skip123', 'subreddit': 'santaana'}], 'rejected': [{'post_id': 'reject123', 'subreddit': 'orangecounty'}], 'checked': [{'post_id': 'done123', 'subreddit': 'costamesa'}]}}
        self.queue.import_posts(self.mod.audit_posts(audit))
        posts = self.queue.snapshot()['posts']
        self.assertEqual(posts['skip123']['state'], 'skipped')
        self.assertEqual(posts['reject123']['state'], 'rejected')
        self.assertNotIn('done123', posts)


    def test_cli_import_and_status_use_persistent_state(self):
        import contextlib
        import io
        import json
        urls = self.path.parent / 'urls.txt'
        urls.write_text('https://redd.it/abc123\nhttps://reddit.com/r/Anaheim/comments/abc123/\n')
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(self.mod.main(['--queue', str(self.path), 'import', '--urls', str(urls)]), 0)
            self.assertEqual(self.mod.main(['--queue', str(self.path), 'status']), 0)
        lines = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(lines, [{'added': 1}, {'counts': {'queued': 1}}])

    def test_corrupt_running_claim_is_rejected_without_rewriting(self):
        import json
        self.seed()
        document = self.queue.snapshot()
        document['posts']['abc123']['state'] = 'running'
        self.path.write_text(json.dumps(document))
        original = self.path.read_bytes()
        with self.assertRaises(ValueError):
            self.queue.recover(now=20)
        self.assertEqual(self.path.read_bytes(), original)

    def test_unknown_subreddit_completion_requires_actual_thread_identity(self):
        self.queue.import_posts([{'post_id': 'abc123'}])
        claim = self.queue.claim('abc123', now=10)
        with self.assertRaises(ValueError):
            self.queue.finish('abc123', claim['claim_token'], {'thread_id': 'abc123', 'restaurants': 0, 'mentions': 0}, now=11)


class QueueReimportSafetyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_queue()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'queue.json'
        self.queue = self.mod.Queue(self.path)

    def test_skip_and_rejection_supersede_queued_or_failed_reimports(self):
        for previous in ('queued', 'failed'):
            for incoming in ('skipped', 'rejected'):
                post_id = f'abc{previous}{incoming}'[:12]
                with self.subTest(previous=previous, incoming=incoming):
                    self.queue.import_posts([{'post_id': post_id}])
                    attempts = 0
                    if previous == 'failed':
                        claim = self.queue.claim(post_id, now=10)
                        self.queue.fail(post_id, claim['claim_token'], 'temporary failure', now=11)
                        attempts = 1
                    self.assertEqual(self.queue.import_posts([{
                        'post_id': post_id, 'subreddit': 'anaheim',
                        'state': incoming, 'capture_present': True,
                    }]), 0)
                    record = self.queue.snapshot()['posts'][post_id]
                    self.assertEqual(record['state'], incoming)
                    self.assertEqual(record['attempts'], attempts)
                    self.assertTrue(record['capture_present'])
                    self.assertEqual(record['subreddit'], 'anaheim')
                    with self.assertRaises(ValueError):
                        self.queue.claim(post_id, now=12)

    def test_actionable_and_skip_import_orders_produce_terminal_work(self):
        for incoming in ('skipped', 'rejected'):
            for skip_first in (False, True):
                for separate_imports in (False, True):
                    with self.subTest(
                        incoming=incoming, skip_first=skip_first,
                        separate_imports=separate_imports,
                    ):
                        path = self.path.parent / f'{incoming}-{skip_first}-{separate_imports}.json'
                        queue = self.mod.Queue(path)
                        records = [
                            {'post_id': 'abc123', 'state': 'queued'},
                            {'post_id': 'abc123', 'state': incoming},
                        ]
                        if skip_first:
                            records.reverse()
                        if separate_imports:
                            for record in records:
                                queue.import_posts([record])
                        else:
                            self.assertEqual(queue.import_posts(records), 1)
                        self.assertEqual(queue.snapshot()['posts']['abc123']['state'], incoming)
                        with self.assertRaises(ValueError):
                            queue.claim('abc123', now=10)

    def test_overlapping_audit_entries_keep_skip_and_reject_decisions(self):
        audit = {
            'actionable_unchecked': [{'post_id': 'abc123'}, {'post_id': 'def456'}],
            'tracker_metadata': {
                'intentionally_skipped': [{'post_id': 'abc123'}],
                'rejected': [{'post_id': 'def456'}],
            },
        }
        self.queue.import_posts(self.mod.audit_posts(audit))
        self.queue.import_posts(self.mod.audit_posts(audit))
        posts = self.queue.snapshot()['posts']
        self.assertEqual(posts['abc123']['state'], 'skipped')
        self.assertEqual(posts['def456']['state'], 'rejected')
        for post_id in posts:
            with self.assertRaises(ValueError):
                self.queue.claim(post_id, now=10)

    def test_existing_terminal_state_is_preserved_for_every_valid_import_state(self):
        for terminal in ('complete', 'skipped', 'rejected'):
            with self.subTest(terminal=terminal):
                post_id = f'abc{terminal}'[:12]
                self.queue.import_posts([{
                    'post_id': post_id,
                    'state': 'queued' if terminal == 'complete' else terminal,
                }])
                if terminal == 'complete':
                    claim = self.queue.claim(post_id, now=10)
                    self.queue.finish(post_id, claim['claim_token'], {
                        'thread_id': f'anaheim-{post_id}', 'restaurants': 0, 'mentions': 0,
                    }, now=11)
                for incoming in ('queued', 'skipped', 'rejected'):
                    self.queue.import_posts([{'post_id': post_id, 'state': incoming}])
                    self.assertEqual(self.queue.snapshot()['posts'][post_id]['state'], terminal)

    def test_running_skip_or_rejection_reimport_errors_and_rolls_back_entire_import(self):
        self.queue.import_posts([{'post_id': 'abc123'}])
        self.queue.claim('abc123', now=10, lease_seconds=1)
        original = self.path.read_bytes()
        for incoming in ('skipped', 'rejected'):
            with self.subTest(incoming=incoming):
                with self.assertRaisesRegex(ValueError, 'running|claim'):
                    self.queue.import_posts([
                        {'post_id': 'def456'},
                        {
                            'post_id': 'abc123', 'subreddit': 'anaheim',
                            'capture_present': True, 'state': incoming,
                        },
                    ])
                self.assertEqual(self.path.read_bytes(), original)

    def test_lock_wait_cannot_extend_an_expired_workers_completion_right(self):
        self.queue.import_posts([{'post_id': 'abc123', 'subreddit': 'anaheim'}])
        claim = self.queue.claim('abc123', lease_seconds=2)
        original = self.path.read_bytes()
        context = multiprocessing.get_context('fork')
        attempted = context.Event()
        result = context.Queue()
        worker = context.Process(
            target=finish_after_lock_wait,
            args=(str(self.path), claim['claim_token'], attempted, result),
        )
        try:
            with self.path.with_suffix('.json.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                worker.start()
                try:
                    self.assertTrue(attempted.wait(5), 'worker did not attempt the queue lock')
                    self.assertLess(time.time(), claim['lease_until'], 'worker started after lease expiry')
                    time.sleep(max(0, claim['lease_until'] - time.time()) + 0.15)
                finally:
                    fcntl.flock(lock, fcntl.LOCK_UN)
            worker.join(5)
            self.assertEqual(worker.exitcode, 0)
            outcome, error = result.get(timeout=5)
            self.assertEqual(outcome, 'rejected')
            self.assertIn('expired', error)
            self.assertEqual(self.path.read_bytes(), original)
        finally:
            if worker.is_alive():
                worker.terminate()
                worker.join(5)
            result.close()
            result.join_thread()

    def test_invalid_incoming_state_for_existing_post_is_rejected_atomically(self):
        self.queue.import_posts([{'post_id': 'abc123'}])
        original = self.path.read_bytes()
        for state in ('running', 'complete', 'failed', 'bogus', None, [], {}):
            with self.subTest(state=state):
                with self.assertRaisesRegex(ValueError, 'Imports'):
                    self.queue.import_posts([
                        {'post_id': 'def456'},
                        {'post_id': 'abc123', 'capture_present': True, 'state': state},
                    ])
                self.assertEqual(self.path.read_bytes(), original)
