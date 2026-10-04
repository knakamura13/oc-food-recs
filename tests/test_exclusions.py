import unittest
import json
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
    ("Panda Express", "chain", None),
    ("Jack in the Box", "chain", None),
    ("Burger King", "chain", None),
    ("Taco Bell", "chain", None),
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
        # Possessive 's and consonant-stem plurals collapse to the registry key.
        self.assertEqual(rp.match_excluded_brand("McDonalds", REG), ("chain", None))
        self.assertEqual(rp.match_excluded_brand("McDonald's", REG), ("chain", None))
        self.assertEqual(rp.match_excluded_brand("Gens Korean bbq", REG), ("chain", None))
        self.assertEqual(rp.match_excluded_brand("Gen Korean bbq", REG), ("chain", None))

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

    def test_no_false_positive_on_single_token_chain_fragment(self):
        # Single-token fragments must not hit multi-word registry brands via substring match.
        for name in (
            "Panda",
            "Jack",
            "King",
            "Taco",
            "Del",
            "Gen",
            "Express",
            "Burger",
            "Grill",
            "Sub",
        ):
            with self.subTest(name=name):
                self.assertIsNone(rp.match_excluded_brand(name, REG))

    def test_single_word_chain_still_matches_exact_and_with_city(self):
        self.assertEqual(rp.match_excluded_brand("McDonald's", REG), ("chain", None))
        self.assertIsNotNone(rp.match_excluded_brand("McDonald's Irvine", REG))
        self.assertEqual(rp.match_excluded_brand("Panda Express", REG), ("chain", None))
        self.assertIsNotNone(rp.match_excluded_brand("Panda Express Costa Mesa", REG))
        self.assertEqual(rp.match_excluded_brand("In-N-Out", REG), ("chain", None))
        self.assertIsNotNone(rp.match_excluded_brand("In N Out Costa Mesa", REG))

    def test_single_word_brand_does_not_match_unrelated_name_suffix(self):
        chilis = _registry(("Chili's", "chain", None))
        self.assertIsNone(rp.match_excluded_brand("Tacos Los Chili’s", chilis))
        self.assertEqual(rp.match_excluded_brand("Chili's", chilis), ("chain", None))
        self.assertEqual(rp.match_excluded_brand("Chili's Irvine", chilis), ("chain", None))

    def test_reverse_word_boundary_match(self):
        # The extracted name is a full word-boundary prefix of the registry brand.
        self.assertEqual(rp.match_excluded_brand("Broken Yolk", REG), ("chain", None))

    def test_policy_v1_alias_rows_catch_short_extracted_names(self):
        # Single-token extracts of multi-word brands need an explicit alias row.
        aliases = _registry(
            ("Panera Bread", "chain", None),
            ("Panera", "chain", None),
            ("Blaze Pizza", "chain", None),
            ("Blaze", "chain", None),
        )
        self.assertEqual(rp.match_excluded_brand("Panera", aliases), ("chain", None))
        self.assertEqual(rp.match_excluded_brand("Panera Irvine", aliases), ("chain", None))
        self.assertEqual(rp.match_excluded_brand("Blaze", aliases), ("chain", None))
        self.assertEqual(rp.match_excluded_brand("Blaze Pizza Tustin", aliases), ("chain", None))

    def test_seed_file_includes_policy_v1_examples(self):
        seed_path = (
            Path(__file__).resolve().parent.parent / "scripts" / "exclusions_seed.json"
        )
        brands = {
            row["brand_name"]
            for row in json.loads(seed_path.read_text())["brands"]
        }
        for name in (
            "In-N-Out",
            "The Habit Burger Grill",
            "El Pollo Loco",
            "Blaze",
            "Blaze Pizza",
            "Raising Cane's",
            "Panera",
            "Panera Bread",
        ):
            with self.subTest(name=name):
                self.assertIn(name, brands)

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

    def test_llm_suspect_stays_active(self):
        status, reason = rp.classify_restaurant_status(
            {"name": "Some New Chain", "chain_suspect": True}, registry=REG
        )
        self.assertEqual((status, reason), ("active", None))

    def test_unverified_many_locations_stay_active(self):
        status, reason = rp.classify_restaurant_status(
            {"name": "Mystery Spot", "chain_location_count": rp.CHAIN_LOCATION_THRESHOLD + 1},
            registry=REG,
        )
        self.assertEqual((status, reason), ("active", None))

    def test_unverified_location_count_at_threshold_stays_active(self):
        # Policy v1: 4+ locations fails Mom & pop (threshold is inclusive).
        status, reason = rp.classify_restaurant_status(
            {"name": "Edge Spot", "chain_location_count": rp.CHAIN_LOCATION_THRESHOLD},
            registry=REG,
        )
        self.assertEqual((status, reason), ("active", None))

    def test_location_count_below_threshold_is_active(self):
        status, reason = rp.classify_restaurant_status(
            {"name": "Trio Spot", "chain_location_count": rp.CHAIN_LOCATION_THRESHOLD - 1},
            registry=REG,
        )
        self.assertEqual((status, reason), ("active", None))

    def test_density_stays_active(self):
        name = "Generic Tacos"
        cities = {f"city{i}" for i in range(rp.DENSITY_CITY_THRESHOLD)}
        counts = {rp.normalize_name(name): cities}
        status, reason = rp.classify_restaurant_status(
            {"name": name, "location": "Irvine"}, registry=REG, city_counts=counts
        )
        self.assertEqual((status, reason), ("active", None))

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

    def test_chain_confidence_maps_status(self):
        self.assertEqual(
            rp.chain_confidence_for("excluded", "chain"),
            rp.CHAIN_CONFIDENCE_LIKELY_CHAIN,
        )
        self.assertEqual(
            rp.chain_confidence_for("pending_review", "llm_suspected_chain"),
            rp.CHAIN_CONFIDENCE_UNKNOWN,
        )
        self.assertEqual(
            rp.chain_confidence_for("active", None),
            rp.CHAIN_CONFIDENCE_UNKNOWN,
        )

    def test_policy_threshold_defaults(self):
        self.assertEqual(rp.CHAIN_LOCATION_THRESHOLD, 6)
        self.assertEqual(rp.DENSITY_CITY_THRESHOLD, 6)

    def test_unverified_counts_are_hints_not_chain_confidence(self):
        for reason in ('many_locations', 'multi_city_density', 'user_reported_chain'):
            self.assertEqual(rp.chain_confidence_for('pending_review', reason),
                rp.CHAIN_CONFIDENCE_UNKNOWN)

    def test_unverified_five_and_six_locations_stay_active(self):
        for count, expected in [(5, ('active', None)),
                (6, ('active', None))]:
            self.assertEqual(rp.classify_restaurant_status(
                {'name': 'Example Cafe', 'chain_location_count': count}, registry=[]), expected)

    def test_merge_refreshes_user_report_confidence_without_clearing_report(self):
        for new_confidence in (
            rp.CHAIN_CONFIDENCE_UNKNOWN,
            rp.CHAIN_CONFIDENCE_INDEPENDENT,
            rp.CHAIN_CONFIDENCE_LIKELY_CHAIN,
        ):
            with self.subTest(new_confidence=new_confidence):
                self.assertEqual(
                    rp.merge_unreviewed_classification(
                        "pending_review", "user_reported_chain",
                        rp.CHAIN_CONFIDENCE_INDEPENDENT,
                        "active", None, new_confidence,
                    ),
                    ("pending_review", "user_reported_chain", new_confidence),
                )

    def test_merge_retires_llm_queue(self):
        status, reason, confidence = rp.merge_unreviewed_classification(
            "pending_review",
            "llm_suspected_chain",
            rp.CHAIN_CONFIDENCE_LIKELY_CHAIN,
            "active",
            None,
            rp.CHAIN_CONFIDENCE_UNKNOWN,
        )
        self.assertEqual(status, "active")
        self.assertIsNone(reason)
        self.assertEqual(confidence, rp.CHAIN_CONFIDENCE_UNKNOWN)

    def test_merge_denylist_upgrades_queued_row(self):
        status, reason, confidence = rp.merge_unreviewed_classification(
            "pending_review",
            "user_reported_chain",
            rp.CHAIN_CONFIDENCE_INDEPENDENT,
            "excluded",
            "chain",
            rp.CHAIN_CONFIDENCE_LIKELY_CHAIN,
        )
        self.assertEqual(
            (status, reason, confidence),
            ("excluded", "chain", rp.CHAIN_CONFIDENCE_LIKELY_CHAIN),
        )

    def test_merge_active_stays_reclassified(self):
        status, reason, confidence = rp.merge_unreviewed_classification(
            "active",
            None,
            rp.CHAIN_CONFIDENCE_INDEPENDENT,
            "pending_review",
            "multi_city_density",
            rp.CHAIN_CONFIDENCE_LIKELY_CHAIN,
        )
        self.assertEqual(status, "pending_review")
        self.assertEqual(reason, "multi_city_density")


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





class TestVerifiedPolicyIntegration(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        from datetime import date
        self.clock = patch('chain_policy.datetime')
        self.clock.start().now.return_value.date.return_value = date(2026, 10, 4)
        self.addCleanup(self.clock.stop)

    def test_audited_local_identity_excludes_without_model(self):
        row = {"name": "Polly's Pies", "location": "Fullerton", "street": "136 N Raymond Ave"}
        self.assertEqual(rp.classify_restaurant_status(row, registry=[]),
                         ("excluded", "verified_chain"))

    def test_audited_name_cannot_exclude_wrong_city_or_street(self):
        row = {"name": "Polly's Pies", "location": "Fullerton", "street": "136 N Raymond Ave"}
        for changed in [{"location": "Tustin"}, {"street": "138 N Raymond Ave"},
                        {"street": None}, {"name": "Other Polly's Pies"}]:
            with self.subTest(changed=changed):
                self.assertEqual(rp.classify_restaurant_status(row | changed, registry=[]),
                                 ("active", None))

    def test_retire_only_automated_queues(self):
        for reason in ["llm_suspected_chain", "many_locations", "multi_city_density"]:
            self.assertEqual(rp.merge_unreviewed_classification(
                "pending_review", reason, "unknown", "active", None, "unknown"),
                ("active", None, "unknown"))
        for reason in ["user_reported_chain", "dedupe_candidate", None]:
            self.assertEqual(rp.merge_unreviewed_classification(
                "pending_review", reason, "unknown", "active", None, "unknown"),
                ("pending_review", reason, "unknown"))


class TestReviewedEvidence(unittest.TestCase):
    def setUp(self):
        import chain_policy
        from datetime import date
        self.policy = chain_policy
        self.today = date(2026, 10, 4)
        self.row = {"name": "Example Kitchen", "location": "Tustin", "street": "100 Main St"}
        self.entry = self.row | {"checked_at": "2026-10-04", "location_count": 6,
            "count_kind": "worldwide_lower_bound", "local_source": "https://example.org/tustin",
            "count_source": "https://example.org/locations"}

    def decide(self, **changes):
        return self.policy.decision(self.row, entries=[self.entry | changes], today=self.today)

    def test_five_six_and_complete_worldwide_counts(self):
        self.assertEqual(self.decide(location_count=5), "unknown")
        self.assertEqual(self.decide(location_count=6), "chain")
        self.assertEqual(self.decide(location_count=5, count_kind="complete_worldwide"), "independent")
        self.assertEqual(self.decide(location_count=6, count_kind="complete_worldwide"), "chain")

    def test_stale_future_and_invalid_evidence_abstains(self):
        for changed in [{"checked_at": "2026-07-05"}, {"checked_at": "2026-10-05"},
                        {"checked_at": "invalid"}, {"location_count": True}, {"location_count": "6"},
                        {"location_count": 0}, {"count_kind": "model_guess"},
                        {"local_source": None}, {"count_source": "http://example.org"}]:
            with self.subTest(changed=changed):
                self.assertEqual(self.decide(**changed), "unknown")

    def test_conflicting_current_entries_abstain(self):
        negative = self.entry | {"location_count": 5, "count_kind": "complete_worldwide"}
        self.assertEqual(self.policy.decision(self.row, entries=[self.entry, negative], today=self.today),
                         "unknown")

    def test_model_supplied_verified_fields_are_not_evidence(self):
        row = self.row | {"identity_verified": True, "decision": "chain", "chain_location_count": 200}
        self.assertEqual(self.policy.decision(row, entries=[], today=self.today), "unknown")

    def test_complete_evidence_sets_independent_confidence(self):
        from unittest.mock import patch
        entry = self.entry | {"location_count": 5, "count_kind": "complete_worldwide"}
        with patch.object(self.policy, "reviewed_entries", return_value=[entry]), patch.object(self.policy, "datetime") as clock:
            clock.now.return_value.date.return_value = self.today
            self.assertEqual(rp.classify_restaurant_status(self.row, registry=[]), ("active", None))
            self.assertEqual(rp.chain_confidence_for("active", restaurant=self.row), "independent")


class TestIngestPolicyMerges(unittest.TestCase):
    """Execute the actual ingest CASE expressions against identity collisions."""
    def merge(self, saved, incoming, *, include_name=False):
        import re
        import sqlite3
        text = Path(rp.__file__).read_text()
        start = text.index('ON CONFLICT (slug) DO UPDATE SET', text.index('def write_to_db'))
        fragment = text[start:text.index('RETURNING id', start)]
        fields = (('name',) if include_name else ()) + ('status', 'exclusion_reason', 'chain_confidence')
        cases = [re.search(r'\b' + field + r' = (CASE.*?END),', fragment, re.S).group(1)
                 for field in fields]
        row = {'name': "Polly's Pies", 'location': 'Fullerton', 'street': '136 N Raymond Ave',
               'status': 'active', 'exclusion_reason': None, 'chain_confidence': 'unknown',
               'reviewed_at': None}
        columns = list(row)
        table = '(SELECT ' + ','.join('? AS ' + key for key in columns) + ') '
        sql = 'SELECT ' + ','.join(cases) + ' FROM ' + table + 'restaurants CROSS JOIN ' + table + 'excluded'
        with sqlite3.connect(':memory:') as conn:
            conn.create_function('btrim', 1, lambda value: value.strip())
            conn.create_function('translate', 3, lambda value, source, target: value.translate(str.maketrans(source, target)))
            conn.create_function('regexp_replace', 4, lambda value, pattern, replacement, flags: re.sub(pattern, replacement, value))
            return conn.execute(sql, list((row | saved).values()) + list((row | incoming).values())).fetchone()

    def test_expired_or_removed_chain_evidence_reactivates_on_ingest(self):
        saved = {'status': 'excluded', 'exclusion_reason': 'verified_chain', 'chain_confidence': 'likely_chain'}
        self.assertEqual(self.merge(saved, {}), ('active', None, 'unknown'))
        self.assertEqual(self.merge(saved | {'reviewed_at': '2026-10-01'}, {}),
                         ('excluded', 'verified_chain', 'likely_chain'))

    def test_independence_does_not_transfer_to_a_different_saved_address(self):
        incoming = {'street': '138 N Raymond Ave', 'chain_confidence': 'independent'}
        self.assertEqual(self.merge({}, incoming), ('active', None, 'unknown'))
        queued = {'status': 'pending_review', 'exclusion_reason': 'user_reported_chain'}
        self.assertEqual(self.merge(queued, incoming), ('pending_review', 'user_reported_chain', 'unknown'))

    def test_manual_queues_and_audited_exclusions_follow_shared_policy(self):
        for reason in rp.AUTOMATED_REVIEW_REASONS:
            self.assertEqual(self.merge({'status': 'pending_review', 'exclusion_reason': reason}, {}),
                             ('active', None, 'unknown'))
        incoming = {'status': 'excluded', 'exclusion_reason': 'verified_chain', 'chain_confidence': 'likely_chain'}
        self.assertEqual(self.merge({}, incoming), ('excluded', 'verified_chain', 'likely_chain'))
        self.assertEqual(self.merge({'street': '138 N Raymond Ave'}, incoming), ('active', None, 'unknown'))
        self.assertEqual(self.merge({}, {'chain_confidence': 'independent'}), ('active', None, 'independent'))

    def test_longer_incoming_name_cannot_relabel_a_preserved_audited_identity(self):
        saved = {'status': 'excluded', 'exclusion_reason': 'verified_chain', 'chain_confidence': 'likely_chain'}
        self.assertEqual(self.merge(saved, {'name': "Polly's Pies Restaurant"}, include_name=True),
                         ("Polly's Pies", 'excluded', 'verified_chain', 'likely_chain'))

    def test_equivalent_punctuation_and_spacing_apply_verified_update(self):
        incoming = {'status': 'excluded', 'exclusion_reason': 'verified_chain', 'chain_confidence': 'likely_chain'}
        for changes in [{'name': 'Polly’s Pies'}, {'name': "  Polly's   Pies  "},
                        {'street': '136 N. Raymond Ave.'}, {'location': ' FULLERTON '}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.merge({}, incoming | changes),
                                 ('excluded', 'verified_chain', 'likely_chain'))


if __name__ == "__main__":
    unittest.main()
