import unittest
import sys
from pathlib import Path

# Ensure we can import from the scripts directory
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
# pyrefly: ignore [missing-import]
import reddit_pipeline as rp


def _registry(*entries: tuple[str, str, str | None]) -> list[dict]:
    """Build registry rows like _load_excluded_brands returns, from (brand, reason, group)."""
    return [
        {
            "brand_name": brand,
            "reason": reason,
            "group_name": group,
            "normalized_name": rp.normalize_name(brand),
        }
        for brand, reason, group in entries
    ]


REG = _registry(
    ("Vox Kitchen", "corporate_group", "Kei Concepts"),
    ("Nep Cafe", "corporate_group", "Kei Concepts"),
    ("Din Tai Fung", "chain", None),
    ("In-N-Out", "chain", None),
    ("Pizza Hut", "chain", None),
    ("The Habit Burger Grill", "chain", None),
    ("Broken Yolk Cafe", "chain", None),
    ("Gen Korean BBQ", "chain", None),
    ("McDonald's", "chain", None),
)


class TestRegistryMatching(unittest.TestCase):
    def test_exact_match(self):
        self.assertEqual(rp.match_excluded_brand("Din Tai Fung", REG), ("chain", None))

    def test_corporate_group_match_returns_reason(self):
        self.assertEqual(
            rp.match_excluded_brand("Vox Kitchen", REG), ("corporate_group", "Kei Concepts")
        )

    def test_spacing_punctuation_variants(self):
        # normalize_name strips spaces/punctuation, so these collapse to the same key.
        self.assertIsNotNone(rp.match_excluded_brand("DinTaiFung", REG))
        self.assertIsNotNone(rp.match_excluded_brand("din tai fung", REG))
        self.assertIsNotNone(rp.match_excluded_brand("In N Out", REG))

    def test_plural_and_possessive_variants(self):
        # normalize_name strips trailing 's' and possessive "'s".
        self.assertIsNotNone(rp.match_excluded_brand("McDonalds", REG))
        self.assertIsNotNone(rp.match_excluded_brand("McDonald's", REG))
        self.assertIsNotNone(rp.match_excluded_brand("Gens Korean bbq", REG))
        self.assertIsNotNone(rp.match_excluded_brand("Gen Korean bbq", REG))

    def test_brand_in_city_still_matches(self):
        # "Vox Kitchen Fountain Valley" -> word-boundary / token-subset hit on "Vox Kitchen".
        self.assertEqual(
            rp.match_excluded_brand("Vox Kitchen Fountain Valley", REG),
            ("corporate_group", "Kei Concepts"),
        )
        self.assertIsNotNone(rp.match_excluded_brand("Din Tai Fung Costa Mesa", REG))

    def test_no_false_positive_on_independent(self):
        self.assertIsNone(rp.match_excluded_brand("Tacos El Gordo", REG))
        self.assertIsNone(rp.match_excluded_brand("Mo Ran Gak", REG))

    def test_no_false_positive_on_partial_word(self):
        # "Pizza Place" must not match "Pizza Hut" (shared non-distinctive token only).
        self.assertIsNone(rp.match_excluded_brand("Pizza Place", REG))

    def test_no_false_positive_on_shared_generic_token(self):
        # Regression: an independent whose only distinctive token is a generic food word
        # ("burger") must NOT match a registry brand that also contains it ("The Habit
        # Burger Grill"). Caught in a real dry-run before this guard was added.
        self.assertIsNone(rp.match_excluded_brand("B&C Burger", REG))
        self.assertIsNone(rp.match_excluded_brand("Burger Boy", REG))

    def test_reverse_word_boundary_match(self):
        # The extracted name is a full word-boundary prefix of the registry brand.
        self.assertEqual(rp.match_excluded_brand("Broken Yolk", REG), ("chain", None))

    def test_empty_registry_is_noop(self):
        self.assertIsNone(rp.match_excluded_brand("Din Tai Fung", []))


class TestClassifyStatus(unittest.TestCase):
    def test_registry_hit_excluded(self):
        status, reason = rp.classify_restaurant_status({"name": "Din Tai Fung"}, registry=REG)
        self.assertEqual((status, reason), ("excluded", "chain"))

    def test_registry_beats_llm_suspicion(self):
        # Precedence: a registry hit wins over chain_suspect (authoritative excluded).
        status, reason = rp.classify_restaurant_status(
            {"name": "In-N-Out", "chain_suspect": True}, registry=REG
        )
        self.assertEqual((status, reason), ("excluded", "chain"))

    def test_llm_suspect_pending_review(self):
        status, reason = rp.classify_restaurant_status(
            {"name": "Some New Chain", "chain_suspect": True}, registry=REG
        )
        self.assertEqual((status, reason), ("pending_review", "llm_suspected_chain"))

    def test_many_locations_pending_review(self):
        status, reason = rp.classify_restaurant_status(
            {"name": "Mystery Spot", "chain_location_count": rp.CHAIN_LOCATION_THRESHOLD + 1},
            registry=REG,
        )
        self.assertEqual((status, reason), ("pending_review", "many_locations"))

    def test_location_count_at_threshold_is_active(self):
        # Strictly greater-than threshold; exactly at threshold stays active.
        status, _ = rp.classify_restaurant_status(
            {"name": "Edge Spot", "chain_location_count": rp.CHAIN_LOCATION_THRESHOLD},
            registry=REG,
        )
        self.assertEqual(status, "active")

    def test_density_pending_review(self):
        name = "Generic Tacos"
        cities = {f"city{i}" for i in range(rp.DENSITY_CITY_THRESHOLD)}
        counts = {rp.normalize_name(name): cities}
        status, reason = rp.classify_restaurant_status(
            {"name": name, "location": "Irvine"}, registry=REG, city_counts=counts
        )
        self.assertEqual((status, reason), ("pending_review", "multi_city_density"))

    def test_density_below_threshold_active(self):
        name = "Two City Spot"
        cities = {f"city{i}" for i in range(rp.DENSITY_CITY_THRESHOLD - 1)}
        counts = {rp.normalize_name(name): cities}
        status, _ = rp.classify_restaurant_status(
            {"name": name}, registry=REG, city_counts=counts
        )
        self.assertEqual(status, "active")

    def test_plain_local_is_active(self):
        status, reason = rp.classify_restaurant_status(
            {"name": "Mo Ran Gak", "chain_suspect": False}, registry=REG
        )
        self.assertEqual((status, reason), ("active", None))


class TestChainSuspectThreading(unittest.TestCase):
    def test_normalize_extractor_result_carries_flag(self):
        parsed = [
            {"name": "In-N-Out", "cuisine": "Burgers", "chain_suspect": True},
            {"name": "Pops", "cuisine": None},  # missing flag -> defaults False
        ]
        cleaned, _ = rp.normalize_extractor_result(parsed)
        by_name = {e["name"]: e for e in cleaned}
        self.assertTrue(by_name["In-N-Out"]["chain_suspect"])
        self.assertFalse(by_name["Pops"]["chain_suspect"])

    def test_build_thread_dataset_propagates_chain_suspect(self):
        parsed_thread = {
            "post": {"id": "abc", "subreddit": "orangecounty", "title": "t", "url": "u"},
            "comment_count": 1,
            "max_depth": 0,
            "comments": [
                {
                    "id": "c1",
                    "author": "u",
                    "body": "In-N-Out never misses",
                    "score": 5,
                    "depth": 0,
                    "parent_id": None,
                    "permalink": "/p",
                    "created_utc": "",
                    "replies": [],
                }
            ],
        }
        entity_records = [
            {
                "comment_id": "c1",
                "entities": [
                    {
                        "name": "In-N-Out",
                        "location": None,
                        "street": None,
                        "cuisine": "Burgers",
                        "chain_suspect": True,
                    }
                ],
                "raw": None,
            }
        ]
        dataset = rp.build_thread_dataset(parsed_thread, entity_records)
        self.assertEqual(len(dataset["restaurants"]), 1)
        self.assertTrue(dataset["restaurants"][0]["chain_suspect"])


if __name__ == "__main__":
    unittest.main()
