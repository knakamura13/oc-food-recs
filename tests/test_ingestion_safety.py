"""Offline regressions for destructive ingestion boundaries, using synthetic input."""
import importlib.util
import io
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest import mock

# Load sibling helpers by path so discovery, direct execution, and the package
# style `python -m unittest tests/test_ingestion_safety.py` all work.
_helpers_spec = importlib.util.spec_from_file_location(
    "existing_pipeline_tests", Path(__file__).with_name("test_reddit_pipeline.py")
)
existing_tests = importlib.util.module_from_spec(_helpers_spec)
_helpers_spec.loader.exec_module(existing_tests)
PAGE_FIXTURE = existing_tests.PAGE_FIXTURE
load_pipeline_module = existing_tests.load_pipeline_module


class ExtractionSafetyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pipeline = load_pipeline_module()

    def extract_response(self, response):
        with mock.patch.object(
            self.pipeline.urllib.request,
            "urlopen",
            return_value=io.BytesIO(json.dumps(response).encode()),
        ):
            return self.pipeline.default_extract_entities("Synthetic Taco in Orange")

    def test_malformed_extraction_fails_instead_of_becoming_empty_success(self):
        for content in (
            "", "not json", '[{"name": "Synthetic Taco"}', "```json\n{broken}\n```"
        ):
            with self.subTest(content=content):
                with self.assertRaisesRegex(ValueError, "extraction"):
                    self.extract_response({"message": {"content": content}})

    def test_invalid_extraction_schema_fails_instead_of_dropping_rows(self):
        invalid = [
            None, True, 42, "text", {}, {"restaurants": None},
            ["Synthetic Taco"], [{"location": "Orange"}], [{"name": 42}],
            [{"name": "Synthetic Taco", "location": ["Orange"]}],
            [{"name": "Synthetic Taco", "chain_suspect": "false"}],
            [{"name": "Synthetic Taco"}, None],
            {"entities": [], "restaurants": [{"name": "Synthetic Taco"}]},
        ]
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "extraction"):
                    self.extract_response({"message": {"content": json.dumps(value)}})

    def test_invalid_ollama_message_envelope_fails_explicitly(self):
        for response in ({}, [], {"message": None}, {"message": {"content": 42}}):
            with self.subTest(response=response):
                with self.assertRaises(Exception) as error:
                    self.extract_response(response)
                self.assertIsInstance(error.exception, ValueError)
                self.assertIn("extraction", str(error.exception))

    def test_valid_code_fenced_extraction_remains_supported(self):
        entities, raw = self.extract_response(
            {"message": {"content": '```json\n[{"name":"Synthetic Taco"}]\n```'}}
        )
        self.assertEqual(entities[0]["name"], "Synthetic Taco")
        self.assertTrue(raw.startswith("```json"))

    def test_valid_empty_and_compatible_extractions_are_successes(self):
        for value in (
            [], {"restaurants": []}, {"name": "Synthetic Taco"},
            [{"name": "Synthetic Taco", "location": None, "chain_suspect": False}],
        ):
            with self.subTest(value=value):
                entities, raw = self.extract_response(
                    {"message": {"content": json.dumps(value)}}
                )
                self.assertEqual(
                    len(entities), 0 if value in ([], {"restaurants": []}) else 1
                )
                self.assertEqual(raw, json.dumps(value))


class SavedSourceSafetyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pipeline = load_pipeline_module()

    def listing(self, comment_id="abc", name="t1_abc"):
        post = {
            "id": "post1", "subreddit": "orangecounty", "title": "Synthetic",
            "url": "https://www.reddit.com/r/orangecounty/comments/post1/",
        }
        comment = {
            "id": comment_id, "name": name, "body": "Synthetic Taco",
            "score": 1, "parent_id": "t3_post1", "replies": "",
        }
        return [
            {"data": {"children": [{"data": post}]}},
            {"data": {"children": [{"kind": "t1", "data": comment}]}},
        ]

    def test_json_comment_identity_matches_html_fullname_contract(self):
        for comment_id in ("abc", "t1_abc"):
            with self.subTest(comment_id=comment_id):
                source = self.listing(comment_id)
                reply = {
                    "kind": "t1",
                    "data": {
                        "id": "reply1", "name": "t1_reply1",
                        "body": "Agree", "parent_id": "t1_abc",
                    },
                }
                source[1]["data"]["children"][0]["data"]["replies"] = {
                    "data": {"children": [reply]}
                }
                nodes = self.pipeline.flatten_comment_tree(
                    self.pipeline.parse_reddit_json(source)["comments"]
                )
                self.assertEqual([node["id"] for node in nodes], ["t1_abc", "t1_reply1"])
                self.assertEqual(nodes[1]["parent_id"], nodes[0]["id"])

    def test_json_inconsistent_or_missing_comment_identity_fails(self):
        for comment_id, name in (
            ("abc", "t1_other"), ("", ""), ("t3_abc", "t1_abc"), ("abc", "abc")
        ):
            with self.subTest(comment_id=comment_id, name=name):
                with self.assertRaisesRegex(ValueError, "comment.*id|identity"):
                    self.pipeline.parse_reddit_json(self.listing(comment_id, name))

    def test_json_unresolved_more_fails_at_root_and_nested_reply(self):
        more = {"kind": "more", "data": {"children": ["notloaded"], "count": 1}}
        for nested in (False, True):
            source = self.listing()
            if nested:
                source[1]["data"]["children"][0]["data"]["replies"] = {
                    "data": {"children": [more]}
                }
            else:
                source[1]["data"]["children"].append(more)
            with self.subTest(nested=nested):
                with self.assertRaisesRegex(ValueError, "more|incomplete"):
                    self.pipeline.parse_reddit_json(source)

    def test_html_known_unexpanded_comment_placeholders_fail(self):
        for placeholder in (
            '<shreddit-comment-tree-more></shreddit-comment-tree-more>',
            '<shreddit-comment-tree-more-replies></shreddit-comment-tree-more-replies>',
            '<span class="morecomments"><a>load more comments</a></span>',
        ):
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "synthetic.html"
                path.write_text(PAGE_FIXTURE.read_text().replace(
                    '</shreddit-comment>', placeholder + '</shreddit-comment>', 1
                ))
                with self.subTest(placeholder=placeholder):
                    with self.assertRaisesRegex(ValueError, "more|incomplete"):
                        self.pipeline.parse_saved_reddit_html(path)

    def test_html_ordinary_load_more_link_is_not_a_partial_marker(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "synthetic.html"
            path.write_text(
                PAGE_FIXTURE.read_text() + '<a href="https://example.com">load more comments</a>'
            )
            self.assertEqual(
                self.pipeline.parse_saved_reddit_html(path)["comment_count"], 11
            )


class PublicationSafetyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pipeline = load_pipeline_module()

    def test_limited_publication_rejects_before_parse_extract_or_write(self):
        for limit in (1, 0, -1):
            with (
                self.subTest(limit=limit),
                mock.patch.object(
                    self.pipeline, "parse_saved_reddit_html",
                    wraps=self.pipeline.parse_saved_reddit_html,
                ) as parse,
                mock.patch.object(
                    self.pipeline, "write_to_db",
                    return_value={"restaurants": 0, "mentions": 0},
                ) as write,
            ):
                extract = mock.Mock(return_value=[])
                with self.assertRaisesRegex(ValueError, "limit.*dry.run|dry.run.*limit"):
                    self.pipeline.ingest(
                        PAGE_FIXTURE, limit=limit, extract_entities_fn=extract
                    )
                parse.assert_not_called()
                extract.assert_not_called()
                write.assert_not_called()

    def test_invalid_diagnostic_limit_rejects(self):
        for limit in (0, -1):
            with self.subTest(limit=limit), self.assertRaisesRegex(ValueError, "positive"):
                self.pipeline.ingest(
                    PAGE_FIXTURE, limit=limit, dry_run=True,
                    extract_entities_fn=lambda *args, **kwargs: [],
                )

    def test_limited_diagnostic_extraction_does_not_publish(self):
        extract = mock.Mock(return_value=[])
        with mock.patch.object(self.pipeline, "write_to_db") as write:
            result = self.pipeline.ingest(
                PAGE_FIXTURE, limit=1, dry_run=True, extract_entities_fn=extract
            )
        self.assertEqual(extract.call_count, 1)
        self.assertEqual(result["restaurants"], 0)
        write.assert_not_called()

    def test_batch_diagnostic_keeps_real_source_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input"
            archive = Path(tmpdir) / "archive"
            source.mkdir()
            path = source / "synthetic.html"
            path.write_bytes(PAGE_FIXTURE.read_bytes())
            original_ingest = self.pipeline.ingest
            def diagnostic_ingest(path, **kwargs):
                return original_ingest(
                    path, extract_entities_fn=lambda *args, **kwargs: [], **kwargs
                )
            with (
                mock.patch.object(self.pipeline, "UNINGESTED_ROOT", source),
                mock.patch.object(self.pipeline, "THREADS_ROOT", archive),
                mock.patch.object(self.pipeline, "write_to_db") as write,
                mock.patch.object(self.pipeline, "ingest", side_effect=diagnostic_ingest),
            ):
                self.assertEqual(self.pipeline.ingest_batch(limit=1, dry_run=True), 0)
            self.assertEqual(path.read_bytes(), PAGE_FIXTURE.read_bytes())
            self.assertFalse(archive.exists())
            write.assert_not_called()

    def test_limited_batch_rejects_even_before_discovery(self):
        with mock.patch.object(self.pipeline, "UNINGESTED_ROOT") as source:
            with self.assertRaisesRegex(ValueError, "limit.*dry.run|dry.run.*limit"):
                self.pipeline.ingest_batch(limit=1)
            source.glob.assert_not_called()

    def test_limited_reingest_rejects_before_backup_or_staging(self):
        with (
            mock.patch.dict("sys.modules", {"db_backup": mock.Mock()}) as modules,
            mock.patch.object(self.pipeline, "THREADS_ROOT") as source,
        ):
            backup = modules["db_backup"].backup
            with self.assertRaisesRegex(ValueError, "limit.*dry.run|dry.run.*limit"):
                self.pipeline.reingest_all(limit=1, confirmed=True)
            backup.assert_not_called()
            source.glob.assert_not_called()

    def test_failed_extraction_keeps_batch_source_and_never_geocodes_or_publishes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input"
            archive = Path(tmpdir) / "archive"
            source.mkdir()
            path = source / "synthetic.html"
            path.write_bytes(PAGE_FIXTURE.read_bytes())
            original_ingest = self.pipeline.ingest
            def ingest_with_fake_transport(path, **kwargs):
                return original_ingest(
                    path, extract_entities_fn=self.pipeline.default_extract_entities,
                    geocode_fn=geocode, **kwargs
                )
            geocode = mock.Mock()
            with (
                mock.patch.object(self.pipeline, "UNINGESTED_ROOT", source),
                mock.patch.object(self.pipeline, "THREADS_ROOT", archive),
                mock.patch.object(self.pipeline, "write_to_db") as write,
                mock.patch.object(self.pipeline, "ingest", side_effect=ingest_with_fake_transport),
                mock.patch.object(
                    self.pipeline.urllib.request, "urlopen",
                    return_value=io.BytesIO(b'{"message":{"content":"broken JSON"}}'),
                ),
            ):
                self.assertEqual(self.pipeline.ingest_batch(), 1)
            self.assertEqual(path.read_bytes(), PAGE_FIXTURE.read_bytes())
            self.assertFalse(archive.exists())
            geocode.assert_not_called()
            write.assert_not_called()

    def test_actual_thread_upsert_preserves_operator_publication_flag(self):
        # Run the production thread upsert against SQLite's compatible ON CONFLICT
        # engine. Only placeholder syntax changes; no live DB or mirrored SQL.
        with closing(sqlite3.connect(":memory:")) as db:
            db.execute("""
                CREATE TABLE threads (
                    id TEXT PRIMARY KEY, subreddit TEXT, post_id TEXT, url TEXT,
                    title TEXT, comment_count INTEGER, max_depth INTEGER,
                    included_in_publish BOOLEAN
                )
            """)
            for initial_flag in (False, True):
                with self.subTest(initial_flag=initial_flag):
                    factory, _conn, cursor, _executions = (
                        existing_tests.WriteToDbTest()._build_fake_connection([])
                    )
                    record = cursor.execute.side_effect
                    def execute(sql, params=None):
                        record(sql, params)
                        if "INSERT INTO threads" in sql:
                            db.execute(sql.replace("%s", "?"), params)
                    cursor.execute.side_effect = execute
                    manifest = {
                        "id": f"oc-{initial_flag}", "subreddit": "oc",
                        "post_id": "synthetic", "url": "u", "title": "Original",
                        "include_in_publish": initial_flag,
                    }
                    parsed = {"comment_count": 0, "max_depth": 0}
                    with (
                        mock.patch.object(
                            self.pipeline, "_url", return_value="postgres://synthetic"
                        ),
                        mock.patch.object(
                            self.pipeline.restaurant_curation, "load_manifest",
                            return_value=[],
                        ),
                    ):
                        self.pipeline.write_to_db(
                            parsed, [], manifest, connection_factory=factory
                        )
                        self.assertEqual(
                            db.execute(
                                "SELECT included_in_publish FROM threads WHERE id = ?",
                                (manifest["id"],),
                            ).fetchone()[0],
                            initial_flag,
                        )
                        manifest.update(include_in_publish=not initial_flag, title="Updated")
                        self.pipeline.write_to_db(
                            parsed, [], manifest, connection_factory=factory
                        )
                    self.assertEqual(
                        db.execute(
                            "SELECT title, included_in_publish FROM threads WHERE id = ?",
                            (manifest["id"],),
                        ).fetchone(),
                        ("Updated", initial_flag),
                    )


if __name__ == "__main__":
    unittest.main()
