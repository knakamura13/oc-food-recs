"""Synthetic reviewed-source contract and real PostgreSQL replay coverage."""
import copy
import hashlib
import unittest
from scripts import restaurant_curation as curation


def fixture():
    primary = {'id': 't1_scope_primary', 'body': 'Synthetic Cafe has two shops.', 'author': 'invented', 'score': 8}
    endorsement = {'id': 't1_scope_reply', 'body': 'Synthetic Cafe: both are good.', 'author': 'invented2', 'score': 3}
    record = {'slug': 'synthetic-cafe', 'name': 'Synthetic Cafe', 'scope': 'multiple_locations',
              'locations': [{'city': 'Dana Point', 'street': '1 Synthetic St'}, {'city': 'San Juan Capistrano', 'street': '2 Synthetic St'}],
              'evidence_urls': ['https://example.com/locations'], 'sources': []}
    for comment, role, flag in [(primary, 'primary', True), (endorsement, 'endorsement', False)]:
        record['sources'].append({'thread_id': 'synthetic-thread', 'comment_id': comment['id'], 'role': role,
                                  'body_sha256': hashlib.sha256(comment['body'].encode()).hexdigest(), 'names_restaurant': flag})
    candidate = {'name': 'Synthetic Cafe', 'primary_comment': primary, 'endorsements': [endorsement],
                 'location': 'Dana Point', 'street': 'wrong inferred address', 'lat': 33.5, 'lng': -117.7}
    return {'version': 1, 'restaurants': [record]}, candidate


class CurationTests(unittest.TestCase):
    def test_route_exact_reviewed_sources_and_mask_geography(self):
        manifest, candidate = fixture()
        records = curation.validate_manifest(manifest)
        ordinary, scoped = curation.partition('synthetic-thread', [candidate], records)
        self.assertEqual(ordinary, [])
        self.assertEqual(scoped[0][1], 'synthetic-cafe')
        self.assertTrue(all(scoped[0][0][key] is None for key in ('location', 'street', 'lat', 'lng')))
        self.assertEqual(candidate['lat'], 33.5)

    def test_missing_changed_role_and_unreviewed_sources_fail_closed(self):
        manifest, candidate = fixture()
        for kind in ('missing', 'body', 'role', 'extra'):
            with self.subTest(kind=kind):
                changed = copy.deepcopy(candidate)
                if kind == 'missing': changed['endorsements'] = []
                if kind == 'body': changed['endorsements'][0]['body'] += ' drift'
                if kind == 'role':
                    changed['primary_comments'] = [changed['primary_comment'], changed['endorsements'].pop()]
                if kind == 'extra':
                    changed['endorsements'].append(dict(changed['endorsements'][0], id='t1_unreviewed'))
                with self.assertRaises(curation.CurationError):
                    curation.partition('synthetic-thread', [changed], curation.validate_manifest(manifest))

    def test_other_brand_comention_and_other_thread_not_routed(self):
        manifest, candidate = fixture()
        other = dict(candidate, name='Other Synthetic Cafe')
        ordinary, scoped = curation.partition('synthetic-thread', [candidate, other], curation.validate_manifest(manifest))
        self.assertEqual(ordinary, [other])
        self.assertEqual(len(scoped), 1)
        ordinary, scoped = curation.partition('another-thread', [candidate], curation.validate_manifest(manifest))
        self.assertEqual(ordinary, [candidate])
        self.assertEqual(scoped, [])

    def test_manifest_rejects_corruption(self):
        manifest, _ = fixture()
        for kind in ('version', 'hash', 'duplicate', 'flag', 'extra', 'empty_host', 'bad_host', 'duplicate_location'):
            bad = copy.deepcopy(manifest)
            if kind == 'version': bad['version'] = 2
            if kind == 'hash': bad['restaurants'][0]['sources'][0]['body_sha256'] = 'bad'
            if kind == 'duplicate': bad['restaurants'].append(bad['restaurants'][0])
            if kind == 'flag': bad['restaurants'][0]['sources'][0]['names_restaurant'] = 'false'
            if kind == 'extra': bad['surprise'] = 1
            if kind == 'empty_host': bad['restaurants'][0]['evidence_urls'] = ['https://']
            if kind == 'bad_host': bad['restaurants'][0]['evidence_urls'] = ['https://[invalid']
            if kind == 'duplicate_location':
                first = bad['restaurants'][0]['locations'][0]
                bad['restaurants'][0]['locations'][1] = {k: ' ' + v + ' ' for k, v in first.items()}
            with self.subTest(kind=kind), self.assertRaises(curation.CurationError):
                curation.validate_manifest(bad)

# Opt-in: requires a migrated, disposable synthetic database. Never use the
# application's DATABASE_URL implicitly, and reject every non-fixture target.
import os
from urllib.parse import urlsplit
from unittest import mock
from tests.test_reddit_pipeline import load_pipeline_module

REPLAY_URL = os.environ.get('OC_FOOD_RECS_CURATION_TEST_DATABASE_URL')


@unittest.skipUnless(REPLAY_URL, 'Set OC_FOOD_RECS_CURATION_TEST_DATABASE_URL for real PostgreSQL replay')
class PostgresReplayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        parsed = urlsplit(REPLAY_URL)
        if parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.path != '/issue155_scope_pipeline':
            raise RuntimeError('Replay requires the dedicated local issue155_scope_pipeline database')
        cls.pipeline = load_pipeline_module()
        import psycopg
        cls.connect = staticmethod(lambda: psycopg.connect(REPLAY_URL))

    def setUp(self):
        self.manifest, self.candidate = fixture()
        self.records = curation.validate_manifest(self.manifest)
        self.thread = {'id': 'synthetic-thread', 'subreddit': 'synthetic', 'post_id': 'synthetic', 'url': 'https://example.com/synthetic', 'title': 'Synthetic fixture'}
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('TRUNCATE mentions, restaurant_aliases, restaurants, threads RESTART IDENTITY CASCADE')
            cur.execute("INSERT INTO threads(id,subreddit,post_id,url,title,comment_count,max_depth) VALUES ('synthetic-thread','synthetic','synthetic','https://example.com/synthetic','Synthetic fixture',0,0)")
            cur.execute("INSERT INTO restaurants(name,slug,location,street,lat,lng,status) VALUES ('Synthetic Cafe','synthetic-cafe','Wrong city','Wrong street',33.5,-117.7,'pending_review'), ('Other Synthetic Cafe','other-synthetic-cafe',NULL,NULL,NULL,NULL,'active'), ('Synthetic Cafe','synthetic-cafe-2','San Juan Capistrano','Other branch',33.6,-117.8,'active')")
            for comment, role in curation.comments(self.candidate):
                cur.execute('INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role,names_restaurant,status) VALUES (1,%s,%s,%s,%s,%s,%s,%s,%s)', ('synthetic-thread',comment['id'],comment['author'],comment['body'],comment['score'],role,role == 'primary','taken_down' if role == 'endorsement' else 'published'))
            primary = self.candidate['primary_comment']
            cur.execute("INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role,names_restaurant) VALUES (2,'synthetic-thread',%s,%s,%s,8,'primary',false)", (primary['id'], primary['author'], primary['body']))

    def replay(self, candidates=None):
        with mock.patch.object(self.pipeline.restaurant_curation, 'load_manifest', return_value=self.records), mock.patch.object(self.pipeline, '_url', return_value=REPLAY_URL):
            return self.pipeline.write_to_db({}, [self.candidate] if candidates is None else candidates, self.thread)

    def snapshot(self):
        with self.connect() as conn, conn.cursor() as cur:
            result = []
            for table in ('threads', 'restaurants', 'mentions'):
                cur.execute(f'SELECT row_to_json(t) FROM (SELECT * FROM {table} ORDER BY id) t')
                result.append(cur.fetchall())
            return result

    def test_twice_preserves_sources_flags_takedown_other_attachments_and_masks_geo(self):
        self.replay()
        first = self.snapshot()
        self.replay()
        self.assertEqual(first, self.snapshot())
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT location,street,lat,lng,status FROM restaurants WHERE id=1')
            self.assertEqual(cur.fetchone(), (None,None,None,None,'pending_review'))
            cur.execute('SELECT restaurant_id,role,names_restaurant,status FROM mentions ORDER BY id')
            self.assertEqual(cur.fetchall(), [(1,'primary',True,'published'), (1,'endorsement',False,'taken_down'), (2,'primary',False,'published')])
            cur.execute('SELECT street FROM restaurants WHERE id=3')
            self.assertEqual(cur.fetchone()[0], 'Other branch')

    def test_input_drift_and_missing_sources_do_not_cleanup(self):
        for kind in ('body','role','missing','extra'):
            candidate = copy.deepcopy(self.candidate)
            if kind == 'body': candidate['primary_comment']['body'] += ' changed'
            if kind == 'role': candidate['primary_comments'] = [candidate['primary_comment'], candidate['endorsements'].pop()]
            if kind == 'missing': candidate['endorsements'] = []
            if kind == 'extra': candidate['endorsements'].append(dict(candidate['endorsements'][0], id='t1_extra'))
            before = self.snapshot()
            with self.subTest(kind=kind), self.assertRaises(self.pipeline.restaurant_curation.CurationError):
                self.replay([candidate])
            self.assertEqual(before, self.snapshot())

    def test_database_preconditions_abort_without_changes(self):
        for kind in ('missing_target','missing_source','body','role','flag','conflicting_attachment','unexpected_source'):
            self.setUp()
            with self.connect() as conn, conn.cursor() as cur:
                if kind == 'missing_target': cur.execute("UPDATE restaurants SET slug='renamed' WHERE id=1")
                if kind == 'missing_source': cur.execute('DELETE FROM mentions WHERE id=2')
                if kind == 'body': cur.execute("UPDATE mentions SET body='changed synthetic text' WHERE id=1")
                if kind == 'role': cur.execute("UPDATE mentions SET role='endorsement' WHERE id=1")
                if kind == 'flag': cur.execute('UPDATE mentions SET names_restaurant=true WHERE id=2')
                if kind == 'conflicting_attachment': cur.execute('UPDATE mentions SET restaurant_id=3 WHERE id=3')
                if kind == 'unexpected_source': cur.execute("INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role) VALUES (1,'synthetic-thread','t1_unexpected','invented','Synthetic extra',1,'primary')")
            before = self.snapshot()
            with self.subTest(kind=kind), self.assertRaises(self.pipeline.restaurant_curation.CurationError):
                self.replay()
            self.assertEqual(before, self.snapshot())

    def test_unreviewed_candidate_does_not_route_to_scope(self):
        new = copy.deepcopy(self.candidate)
        new['primary_comment']['id'] = 't1_new_branch'
        new['endorsements'] = []
        new.update(location='San Juan Capistrano', street='Other branch', lat=33.6, lng=-117.8)
        self.replay([self.candidate, new])
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT restaurant_id FROM mentions WHERE comment_id='t1_new_branch'")
            self.assertEqual(cur.fetchone()[0], 3)

    def test_unknown_new_source_gets_normal_new_slug_not_scoped_slug(self):
        new = copy.deepcopy(self.candidate)
        new['primary_comment']['id'] = 't1_new_unknown'
        new['endorsements'] = []
        new.update(location='New synthetic city', street='Another street', lat=33.8, lng=-118.0)
        self.replay([self.candidate, new])
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT r.slug FROM mentions m JOIN restaurants r ON r.id=m.restaurant_id WHERE comment_id='t1_new_unknown'")
            self.assertEqual(cur.fetchone()[0], 'synthetic-cafe-3')

    def test_incoming_other_brand_attachment_retains_false_flag(self):
        other = copy.deepcopy(self.candidate)
        other['name'] = 'Other Synthetic Cafe'
        other['endorsements'] = []
        other.update(location=None, street=None, lat=None, lng=None)
        self.replay([self.candidate, other])
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT names_restaurant FROM mentions WHERE restaurant_id=2')
            self.assertEqual(cur.fetchone()[0], False)
