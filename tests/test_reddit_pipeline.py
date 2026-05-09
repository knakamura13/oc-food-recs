import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


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
                            "endorsement_types_kept": [
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
                            "endorsement_types_kept": [
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


if __name__ == "__main__":
    unittest.main()
