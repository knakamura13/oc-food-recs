import hashlib
import importlib.util
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"
SCRIPT_PATH = ROOT / "scripts" / "reddit_pipeline.py"


def load_pipeline_module():
    if not SCRIPT_PATH.exists():
        raise AssertionError(f"Missing pipeline script: {SCRIPT_PATH}")

    spec = importlib.util.spec_from_file_location("reddit_pipeline", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load pipeline script from {SCRIPT_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest_files(paths):
    hasher = hashlib.sha256()
    for path in sorted(paths):
        hasher.update(path.name.encode("utf-8"))
        hasher.update(path.read_bytes())
    return hasher.hexdigest()


class RedditPipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pipeline = load_pipeline_module()

    def test_normalize_extractor_result_drops_sentinel_names(self):
        entities, _ = self.pipeline.normalize_extractor_result(
            [
                {"name": "None"},
                {"name": "Real Taco", "location": "Santa Ana"},
                {"name": "n/a"},
                {"name": ""},
                {"name": "  NULL "},
                {"name": "Unknown"},
            ]
        )
        self.assertEqual([e["name"] for e in entities], ["Real Taco"])

    def test_parse_saved_reddit_html_thread_01(self):
        parsed = self.pipeline.parse_saved_reddit_html(FIXTURES / "thread-01.html")

        self.assertEqual(parsed["post"]["id"], "1sb0qo7")
        self.assertEqual(parsed["post"]["subreddit"], "orangecounty")
        self.assertEqual(
            parsed["post"]["title"],
            "What’s your favorite “mom and pop” family owned restaurant?",
        )
        self.assertEqual(parsed["comment_count"], 735)
        self.assertEqual(parsed["max_depth"], 6)
        self.assertTrue(parsed["comments"])
        self.assertEqual(parsed["comments"][0]["id"], "t1_oe04j5u")
        self.assertTrue(
            parsed["comments"][0]["permalink"].startswith(
                "https://www.reddit.com/r/orangecounty/comments/1sb0qo7/comment/"
            )
        )

    def test_parse_saved_reddit_html_thread_02(self):
        parsed = self.pipeline.parse_saved_reddit_html(FIXTURES / "thread-02.html")

        self.assertEqual(parsed["post"]["id"], "1slszch")
        self.assertEqual(parsed["post"]["subreddit"], "orangecounty")
        self.assertEqual(
            parsed["post"]["title"],
            "What’s a mom & pop restaurant that is delish and could use more customers?",
        )
        self.assertEqual(parsed["comment_count"], 202)
        self.assertEqual(parsed["max_depth"], 6)
        self.assertTrue(parsed["comments"])
        self.assertEqual(parsed["comments"][0]["id"], "t1_og95lhn")
        self.assertTrue(
            parsed["comments"][0]["permalink"].startswith(
                "https://www.reddit.com/r/orangecounty/comments/1slszch/comment/"
            )
        )

    def test_build_thread_is_deterministic_with_injected_extractors(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            threads_root = tmp_path / "data" / "threads"

            thread_dir = self.pipeline.init_thread(
                FIXTURES / "thread-02.html",
                threads_root=threads_root,
            )

            def extract_entities(comment_text, comment=None, manifest=None):
                if not comment_text.strip():
                    return []
                return [
                    {
                        "name": "Stub Cafe",
                        "location": "Costa Mesa",
                        "cuisine": "Cafe",
                    }
                ]

            def geocode(name, location):
                return 33.6411, -117.9187, "stub"

            self.pipeline.build_thread(
                thread_dir,
                extract_entities_fn=extract_entities,
                geocode_fn=geocode,
            )

            processed_files = [
                thread_dir / "processed" / "thread.json",
                thread_dir / "processed" / "comments_flat.jsonl",
                thread_dir / "processed" / "entities.jsonl",
                thread_dir / "processed" / "restaurants.thread.json",
                thread_dir / "processed" / "restaurants.geocoded.json",
                thread_dir / "review" / "unresolved.json",
            ]
            first_digest = digest_files(processed_files)

            self.pipeline.build_thread(
                thread_dir,
                extract_entities_fn=extract_entities,
                geocode_fn=geocode,
            )

            second_digest = digest_files(processed_files)
            published = json.loads(
                (thread_dir / "processed" / "restaurants.geocoded.json").read_text(
                    encoding="utf-8"
                )
            )

            self.assertEqual(first_digest, second_digest)
            self.assertEqual(published["meta"]["total_restaurants"], 1)
            self.assertEqual(published["restaurants"][0]["name"], "Stub Cafe")
            self.assertEqual(published["restaurants"][0]["lat"], 33.6411)

    def test_publish_threads_applies_aliases_and_thread_overrides(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            threads_root = tmp_path / "data" / "threads"
            overrides_path = tmp_path / "data" / "overrides" / "restaurants.json"
            output_path = tmp_path / "src" / "lib" / "data" / "generated" / "restaurants.json"

            thread_one_dir = threads_root / "t1"
            thread_two_dir = threads_root / "t2"
            (thread_one_dir / "processed").mkdir(parents=True)
            (thread_two_dir / "processed").mkdir(parents=True)
            overrides_path.parent.mkdir(parents=True)

            (thread_one_dir / "manifest.json").write_text(
                json.dumps(
                    {
                        "id": "t1",
                        "subreddit": "orangecounty",
                        "post_id": "aaa111",
                        "title": "Thread One",
                        "url": "https://reddit.com/r/orangecounty/comments/aaa111/",
                        "include_in_publish": True,
                        "comment_count": 50,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            (thread_two_dir / "manifest.json").write_text(
                json.dumps(
                    {
                        "id": "t2",
                        "subreddit": "orangecounty",
                        "post_id": "bbb222",
                        "title": "Thread Two",
                        "url": "https://reddit.com/r/orangecounty/comments/bbb222/",
                        "include_in_publish": True,
                        "comment_count": 70,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            (thread_one_dir / "processed" / "restaurants.geocoded.json").write_text(
                json.dumps(
                    {
                        "restaurants": [
                            {
                                "name": "Taqueria de Anda",
                                "location": "Orange",
                                "cuisine": "Mexican",
                                "aggregate_score": 50,
                                "mention_count": 2,
                                "lat": 33.79,
                                "lng": -117.85,
                                "primary_comment": {
                                    "id": "c1",
                                    "author": "one",
                                    "body": "Taqueria de Anda",
                                    "score": 50,
                                    "permalink": "https://reddit.com/c1",
                                },
                                "endorsements": [],
                            },
                            {
                                "name": "Folks",
                                "location": "Costa Mesa",
                                "cuisine": "American",
                                "aggregate_score": 12,
                                "mention_count": 1,
                                "lat": 33.66,
                                "lng": -117.91,
                                "primary_comment": {
                                    "id": "c2",
                                    "author": "two",
                                    "body": "Folks",
                                    "score": 12,
                                    "permalink": "https://reddit.com/c2",
                                },
                                "endorsements": [],
                            },
                        ],
                        "meta": {
                            "total_restaurants": 2,
                            "total_comments_processed": 50,
                            "model_used": "stub",
                            "geocoded_count": 2,
                            "unmapped_count": 0,
                            "kept_endorsement_types": [
                                "personal_story",
                                "endorsement",
                                "dish_rec",
                            ],
                        },
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            (thread_two_dir / "processed" / "restaurants.geocoded.json").write_text(
                json.dumps(
                    {
                        "restaurants": [
                            {
                                "name": "Tacos De Anda",
                                "location": "Santa Ana",
                                "cuisine": "Mexican",
                                "aggregate_score": 45,
                                "mention_count": 3,
                                "lat": 33.75,
                                "lng": -117.87,
                                "primary_comment": {
                                    "id": "c3",
                                    "author": "three",
                                    "body": "Tacos De Anda",
                                    "score": 45,
                                    "permalink": "https://reddit.com/c3",
                                },
                                "endorsements": [],
                            },
                            {
                                "name": "Folks",
                                "location": "Long Beach",
                                "cuisine": "Pizza",
                                "aggregate_score": 18,
                                "mention_count": 1,
                                "lat": 33.77,
                                "lng": -118.19,
                                "primary_comment": {
                                    "id": "c4",
                                    "author": "four",
                                    "body": "Folks",
                                    "score": 18,
                                    "permalink": "https://reddit.com/c4",
                                },
                                "endorsements": [],
                            },
                        ],
                        "meta": {
                            "total_restaurants": 2,
                            "total_comments_processed": 70,
                            "model_used": "stub",
                            "geocoded_count": 2,
                            "unmapped_count": 0,
                            "kept_endorsement_types": [
                                "personal_story",
                                "endorsement",
                                "dish_rec",
                            ],
                        },
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            overrides_path.write_text(
                json.dumps(
                    {
                        "aliases": {
                            "Tacos De Anda": "Taqueria de Anda",
                        },
                        "thread_overrides": {
                            "t2": {
                                "Folks": {
                                    "name": "Folks Pizza",
                                    "location": "Long Beach",
                                }
                            }
                        },
                        "restaurant_overrides": {
                            "Taqueria de Anda": {
                                "lat": 33.777,
                                "lng": -117.888,
                            }
                        },
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            published = self.pipeline.publish_threads(
                threads_root=threads_root,
                output_path=output_path,
                overrides_path=overrides_path,
            )

            restaurant_names = [restaurant["name"] for restaurant in published["restaurants"]]
            self.assertEqual(
                restaurant_names,
                ["Taqueria de Anda", "Folks Pizza", "Folks"],
            )
            self.assertEqual(published["meta"]["total_restaurants"], 3)
            self.assertEqual(published["meta"]["total_comments_processed"], 120)
            self.assertEqual(len(published["meta"]["source_threads"]), 2)

            taqueria = next(
                restaurant
                for restaurant in published["restaurants"]
                if restaurant["name"] == "Taqueria de Anda"
            )
            self.assertEqual(taqueria["source_threads"], ["t1", "t2"])
            self.assertEqual(taqueria["aggregate_score"], 95)
            self.assertEqual(taqueria["lat"], 33.777)

            folks_pizza = next(
                restaurant
                for restaurant in published["restaurants"]
                if restaurant["name"] == "Folks Pizza"
            )
            self.assertEqual(folks_pizza["source_threads"], ["t2"])

            saved_output = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertIn("generated_at", saved_output["meta"])
            self.assertEqual(saved_output["meta"]["source_threads"][0]["id"], "t1")


class WriteToDbTest(unittest.TestCase):
    """write_to_db emits the right SQL statements in the right order.

    We mock psycopg.connect entirely so this runs with no live Postgres.
    The cursor records every (sql, params) pair we can then introspect.
    """

    @classmethod
    def setUpClass(cls):
        cls.pipeline = load_pipeline_module()

    def _build_fake_connection(self, returned_restaurant_ids):
        """Return (factory, cursor) where factory(url) -> context-manager conn.

        `returned_restaurant_ids` is a list of ids served sequentially by the
        cursor's `fetchone()` (one per restaurant INSERT ... RETURNING id).
        """
        executions = []
        ids_iter = iter(returned_restaurant_ids)

        cursor_mock = mock.MagicMock()

        def execute(sql, params=None):
            executions.append((sql, params))

        def fetchone():
            try:
                return (next(ids_iter),)
            except StopIteration:
                return None

        cursor_mock.execute.side_effect = execute
        cursor_mock.fetchone.side_effect = fetchone
        cursor_mock.__enter__ = lambda self: self
        cursor_mock.__exit__ = lambda self, *args: False

        conn_mock = mock.MagicMock()
        conn_mock.cursor.return_value = cursor_mock
        conn_mock.__enter__ = lambda self: self
        conn_mock.__exit__ = lambda self, *args: False

        def factory(url):
            factory.received_url = url
            return conn_mock

        factory.received_url = None
        return factory, conn_mock, cursor_mock, executions

    def _first_word(self, sql):
        return re.search(r"\b(INSERT|UPDATE|DELETE|SELECT)\b\s+(?:INTO\s+)?(\w+)", sql, re.IGNORECASE).group(2).lower()

    def test_write_to_db_emits_thread_restaurants_and_mentions_in_order(self):
        parsed_thread = {
            "post": {
                "id": "abc123",
                "subreddit": "orangecounty",
                "title": "Best mom & pop spots",
                "url": "https://www.reddit.com/r/orangecounty/comments/abc123/",
            },
            "comment_count": 42,
            "max_depth": 5,
            "comments": [],
        }
        manifest = {
            "id": "orangecounty-abc123",
            "subreddit": "orangecounty",
            "post_id": "abc123",
            "title": "Best mom & pop spots",
            "url": "https://www.reddit.com/r/orangecounty/comments/abc123/",
            "comment_count": 42,
            "max_depth": 5,
            "include_in_publish": True,
        }
        restaurants = [
            {
                "name": "Taqueria de Anda",
                "location": "Orange",
                "cuisine": "Mexican",
                "lat": 33.79,
                "lng": -117.85,
                "primary_comment": {
                    "id": "t1_pa",
                    "author": "userA",
                    "body": "Taqueria de Anda is the best",
                    "score": 50,
                    "permalink": "https://www.reddit.com/r/orangecounty/comments/abc123/comment/pa/",
                },
                "endorsements": [
                    {
                        "id": "t1_ea1",
                        "permalink": "https://www.reddit.com/r/orangecounty/comments/abc123/comment/ea1/",
                        "type": "endorsement",
                        "author": "userB",
                        "body": "seconded",
                        "score": 10,
                    },
                    {
                        "id": "t1_ea2",
                        "permalink": "https://www.reddit.com/r/orangecounty/comments/abc123/comment/ea2/",
                        "type": "dish_rec",
                        "author": "userC",
                        "body": "their al pastor is amazing",
                        "score": 7,
                    },
                ],
            },
            {
                "name": "Folks",
                "location": "Costa Mesa",
                "cuisine": "American",
                "lat": 33.66,
                "lng": -117.91,
                "primary_comment": {
                    "id": "t1_pb",
                    "author": "userD",
                    "body": "Folks is great",
                    "score": 30,
                    "permalink": "https://www.reddit.com/r/orangecounty/comments/abc123/comment/pb/",
                },
                "endorsements": [],
            },
        ]

        factory, conn_mock, cursor_mock, executions = self._build_fake_connection(
            returned_restaurant_ids=[101, 102]
        )

        with mock.patch.dict(os.environ, {"DATABASE_URL": "postgres://stub"}):
            result = self.pipeline.write_to_db(
                parsed_thread,
                restaurants,
                manifest,
                connection_factory=factory,
            )

        # Connection factory got the right URL and we committed exactly once.
        self.assertEqual(factory.received_url, "postgres://stub")
        conn_mock.commit.assert_called_once()

        # Counters returned to caller.
        self.assertEqual(result["restaurants"], 2)
        self.assertEqual(result["mentions"], 4)  # 2 primary + 2 endorsements
        self.assertEqual(result["thread_id"], "orangecounty-abc123")

        # 1 threads upsert + 2 restaurants upserts + 4 mentions upserts = 7 execute() calls.
        self.assertEqual(len(executions), 7)

        # Ordering: thread first, then per-restaurant (restaurant, primary mention, endorsements...).
        targets = [self._first_word(sql) for sql, _ in executions]
        self.assertEqual(
            targets,
            [
                "threads",       # 0: thread upsert
                "restaurants",   # 1: restaurant 1 upsert
                "mentions",      # 2: primary mention restaurant 1
                "mentions",      # 3: endorsement 1a
                "mentions",      # 4: endorsement 1b
                "restaurants",   # 5: restaurant 2 upsert
                "mentions",      # 6: primary mention restaurant 2
            ],
        )

        # Thread upsert carries the manifest values verbatim.
        thread_sql, thread_params = executions[0]
        self.assertIn("INSERT INTO threads", thread_sql)
        self.assertIn("ON CONFLICT (id) DO UPDATE", thread_sql)
        self.assertEqual(
            thread_params,
            (
                "orangecounty-abc123",
                "orangecounty",
                "abc123",
                "https://www.reddit.com/r/orangecounty/comments/abc123/",
                "Best mom & pop spots",
                42,
                5,
                True,
            ),
        )

        # Restaurant 1: slug is "taqueria-de-anda" (no collision), lat/lng/etc carried through.
        r1_sql, r1_params = executions[1]
        self.assertIn("INSERT INTO restaurants", r1_sql)
        self.assertIn("ON CONFLICT (slug) DO UPDATE", r1_sql)
        self.assertEqual(
            r1_params,
            ("Taqueria de Anda", "taqueria-de-anda", "Orange", "Mexican", 33.79, -117.85),
        )

        # Primary mention for restaurant 1 — role=primary, classification NULL (hard-coded in SQL).
        m1_sql, m1_params = executions[2]
        self.assertIn("INSERT INTO mentions", m1_sql)
        self.assertIn("'primary', NULL", m1_sql)
        self.assertIn("ON CONFLICT (thread_id, comment_id, restaurant_id) DO UPDATE", m1_sql)
        self.assertEqual(
            m1_params,
            (
                101,  # restaurant_id from fetchone
                "orangecounty-abc123",
                "t1_pa",
                "https://www.reddit.com/r/orangecounty/comments/abc123/comment/pa/",
                "userA",
                "Taqueria de Anda is the best",
                50,
            ),
        )

        # Endorsement 1a — role='endorsement', classification='endorsement'.
        e1_sql, e1_params = executions[3]
        self.assertIn("INSERT INTO mentions", e1_sql)
        self.assertIn("'endorsement', %s", e1_sql)
        self.assertEqual(
            e1_params,
            (
                101,
                "orangecounty-abc123",
                "t1_ea1",
                "https://www.reddit.com/r/orangecounty/comments/abc123/comment/ea1/",
                "userB",
                "seconded",
                10,
                "endorsement",
            ),
        )

        # Endorsement 1b — classification='dish_rec'.
        e2_sql, e2_params = executions[4]
        self.assertEqual(e2_params[7], "dish_rec")
        self.assertEqual(e2_params[2], "t1_ea2")

        # Restaurant 2 — slug "folks".
        r2_sql, r2_params = executions[5]
        self.assertEqual(r2_params[0], "Folks")
        self.assertEqual(r2_params[1], "folks")

        # Primary mention for restaurant 2 — uses restaurant_id 102 from fetchone.
        m2_sql, m2_params = executions[6]
        self.assertEqual(m2_params[0], 102)
        self.assertEqual(m2_params[2], "t1_pb")

    def test_write_to_db_assigns_collision_suffixes_to_duplicate_slugs(self):
        """Two restaurants whose names slugify to the same string get -2 suffix on the second."""
        parsed_thread = {
            "post": {"id": "x", "subreddit": "oc", "title": "t", "url": "u"},
            "comment_count": 0,
            "max_depth": 0,
            "comments": [],
        }
        manifest = {
            "id": "oc-x",
            "subreddit": "oc",
            "post_id": "x",
            "title": "t",
            "url": "u",
            "comment_count": 0,
            "max_depth": 0,
        }
        # Two restaurants with identical slugs once slugified.
        restaurants = [
            {
                "name": "Folks",
                "location": "Costa Mesa",
                "cuisine": None,
                "lat": None,
                "lng": None,
                "primary_comment": {
                    "id": "c1", "author": "a", "body": "b", "score": 1, "permalink": "p1",
                },
                "endorsements": [],
            },
            {
                "name": "Folks!",  # slugifies to the same "folks"
                "location": "Long Beach",
                "cuisine": None,
                "lat": None,
                "lng": None,
                "primary_comment": {
                    "id": "c2", "author": "a", "body": "b", "score": 1, "permalink": "p2",
                },
                "endorsements": [],
            },
        ]

        factory, _conn, _cursor, executions = self._build_fake_connection([1, 2])
        with mock.patch.dict(os.environ, {"DATABASE_URL": "postgres://stub"}):
            self.pipeline.write_to_db(
                parsed_thread, restaurants, manifest, connection_factory=factory,
            )

        # executions[1] and executions[3] are the restaurant upserts.
        # (executions[0] is threads, [2] is primary mention for r1, [4] is primary mention for r2.)
        self.assertEqual(executions[1][1][1], "folks")
        self.assertEqual(executions[3][1][1], "folks-2")

    def test_write_to_db_raises_when_database_url_missing(self):
        factory, _conn, _cursor, _exec = self._build_fake_connection([1])
        # Strip DATABASE_URL out of the env for this assertion.
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                self.pipeline.write_to_db(
                    {"post": {"id": "x", "subreddit": "oc", "title": "t", "url": "u"},
                     "comment_count": 0, "max_depth": 0, "comments": []},
                    [],
                    {"id": "oc-x", "subreddit": "oc", "post_id": "x", "title": "t", "url": "u",
                     "comment_count": 0, "max_depth": 0},
                    connection_factory=factory,
                )
            self.assertIn("DATABASE_URL", str(ctx.exception))

    # --- batch ingest + archive -------------------------------------------------

    def _make_batch_dirs(self, tmp_path, filenames):
        uningested = tmp_path / "data" / "uningested-threads"
        threads = tmp_path / "data" / "threads"
        uningested.mkdir(parents=True)
        threads.mkdir(parents=True)
        for name in filenames:
            (uningested / name).write_text(f"<html>{name}</html>", encoding="utf-8")
        return uningested, threads

    def test_ingest_batch_processes_all_and_archives(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            names = ["orangecounty-aaa111.html", "orangecounty-bbb222.html"]
            uningested, threads = self._make_batch_dirs(tmp_path, names)

            with mock.patch.object(self.pipeline, "UNINGESTED_ROOT", uningested), \
                mock.patch.object(self.pipeline, "THREADS_ROOT", threads), \
                mock.patch.object(self.pipeline, "ingest") as fake_ingest:
                code = self.pipeline.ingest_batch()

            self.assertEqual(code, 0)
            self.assertEqual(fake_ingest.call_count, 2)
            self.assertEqual(list(uningested.glob("*.html")), [])
            self.assertEqual(
                sorted(p.name for p in threads.glob("*.html")), sorted(names)
            )

    def test_ingest_batch_skips_failures_and_continues(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            good, bad = "orangecounty-good11.html", "orangecounty-bad222.html"
            uningested, threads = self._make_batch_dirs(tmp_path, [good, bad])

            def side_effect(html_path, **_kwargs):
                if html_path.name == bad:
                    raise RuntimeError("boom")

            with mock.patch.object(self.pipeline, "UNINGESTED_ROOT", uningested), \
                mock.patch.object(self.pipeline, "THREADS_ROOT", threads), \
                mock.patch.object(self.pipeline, "ingest", side_effect=side_effect):
                code = self.pipeline.ingest_batch()

            self.assertEqual(code, 1)
            self.assertTrue((threads / good).exists())
            self.assertFalse((uningested / good).exists())
            # The failed file is left in place and not archived.
            self.assertTrue((uningested / bad).exists())
            self.assertFalse((threads / bad).exists())

    def test_ingest_batch_dry_run_does_not_move(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            names = ["orangecounty-aaa111.html", "orangecounty-bbb222.html"]
            uningested, threads = self._make_batch_dirs(tmp_path, names)

            with mock.patch.object(self.pipeline, "UNINGESTED_ROOT", uningested), \
                mock.patch.object(self.pipeline, "THREADS_ROOT", threads), \
                mock.patch.object(self.pipeline, "ingest") as fake_ingest:
                code = self.pipeline.ingest_batch(dry_run=True)

            self.assertEqual(code, 0)
            self.assertEqual(fake_ingest.call_count, 2)
            self.assertEqual(
                sorted(p.name for p in uningested.glob("*.html")), sorted(names)
            )
            self.assertEqual(list(threads.glob("*.html")), [])

    def test_ingest_batch_no_archive_does_not_move(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            names = ["orangecounty-aaa111.html", "orangecounty-bbb222.html"]
            uningested, threads = self._make_batch_dirs(tmp_path, names)

            with mock.patch.object(self.pipeline, "UNINGESTED_ROOT", uningested), \
                mock.patch.object(self.pipeline, "THREADS_ROOT", threads), \
                mock.patch.object(self.pipeline, "ingest") as fake_ingest:
                code = self.pipeline.ingest_batch(archive=False)

            self.assertEqual(code, 0)
            self.assertEqual(fake_ingest.call_count, 2)
            self.assertEqual(
                sorted(p.name for p in uningested.glob("*.html")), sorted(names)
            )
            self.assertEqual(list(threads.glob("*.html")), [])

    def test_ingest_no_files_is_noop(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            uningested, threads = self._make_batch_dirs(tmp_path, [])

            with mock.patch.object(self.pipeline, "UNINGESTED_ROOT", uningested), \
                mock.patch.object(self.pipeline, "THREADS_ROOT", threads), \
                mock.patch.object(self.pipeline, "ingest") as fake_ingest:
                code = self.pipeline.ingest_batch()

            self.assertEqual(code, 0)
            fake_ingest.assert_not_called()
            self.assertEqual(list(threads.glob("*.html")), [])


if __name__ == "__main__":
    unittest.main()
