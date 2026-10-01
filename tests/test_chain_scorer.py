"""Synthetic safety, entity-identity and decision tests for the read-only scorer."""

import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
try:
    import chain_scorer as cs
except ModuleNotFoundError:
    cs = None


class ScorerTest(unittest.TestCase):
    def test_scorer_is_available(self):
        self.assertIsNotNone(cs, 'Read-only chain scorer is not implemented')

    def setUp(self):
        if cs is None and self._testMethodName != 'test_scorer_is_available':
            self.skipTest('Scorer implementation missing')

    def test_brand_token_prefix_strips_leading_the_apostrophe_and_ampersand(self):
        self.assertTrue(cs.brand_matches("The Board & Brew - Tustin", 'Board and Brew'))
        self.assertTrue(cs.brand_matches("McDonald's", 'McDonalds'))
        self.assertFalse(cs.brand_matches('Costa', 'Costa Vida'))
        self.assertFalse(cs.brand_matches('Tim', 'Tim Ho Wan'))
        self.assertFalse(cs.brand_matches('Buona Forchetta', 'Buona'))
        self.assertFalse(cs.brand_matches('Golden Dragon', 'Golden'))

    def test_domain_uses_public_suffix_and_rejects_shared_platforms(self):
        self.assertEqual(
            cs.website_domain('https://www.example.co.uk/locations'), 'example.co.uk'
        )
        for site in [
            'https://toasttab.com/x',
            'https://foo.wixsite.com/menu',
            'https://instagram.com/x',
            'http://localhost/x',
            'http://127.0.0.1/x',
        ]:
            self.assertIsNone(cs.website_domain(site))

    def test_scratch_database_must_be_explicit_and_loopback(self):
        self.assertEqual(
            cs.validate_scratch_dsn('postgresql://x:y@127.0.0.1:54388/ocfr200_scratch')[
                'dbname'
            ],
            'ocfr200_scratch',
        )
        for dsn in [
            'postgresql://x:y@host.railway.app:5432/ocfr200_scratch',
            'postgresql://x:y@localhost:5432/production',
            'postgresql://x:y@127.0.0.1:54388/postgres?host=railway.app',
            'postgresql://x:y@localhost:54388/ocfr200_scratch?service=prod',
        ]:
            with self.assertRaises(ValueError):
                cs.validate_scratch_dsn(dsn)

    def test_brand_match_alone_never_excludes(self):
        self.assertEqual(
            cs.decide([{'kind': 'S3', 'brand': 'Synthetic Foods'}])['decision'],
            'unknown',
        )

    def test_six_locations_is_chain_and_five_observed_is_unknown(self):
        for count, expected in [(5, 'unknown'), (6, 'chain'), (7, 'chain')]:
            self.assertEqual(
                cs.decide(
                    [
                        {
                            'kind': 'S1',
                            'count': count,
                            'identity_verified': True,
                            'scope': 'worldwide',
                        }
                    ]
                )['decision'],
                expected,
            )

    def test_confirmed_five_total_can_be_independent(self):
        self.assertEqual(
            cs.decide(
                [
                    {
                        'kind': 'S5',
                        'count': 5,
                        'complete': True,
                        'identity_verified': True,
                        'scope': 'worldwide',
                    }
                ]
            )['decision'],
            'independent',
        )

    def test_local_or_unverified_counts_cannot_confirm_independent(self):
        for e in [
            dict(
                kind='S1', count=2, complete=True, scope='SoCal', identity_verified=True
            ),
            dict(
                kind='S5',
                count=1,
                complete=True,
                scope='worldwide',
                identity_verified=False,
            ),
        ]:
            self.assertEqual(cs.decide([e])['decision'], 'unknown')

    def test_model_cannot_override_absence_of_evidence(self):
        self.assertEqual(
            cs.decide([{'kind': 'S6', 'decision': 'chain', 'supported': False}])[
                'decision'
            ],
            'unknown',
        )

    def test_conflicting_confirmed_totals_abstain(self):
        evidence = [
            dict(kind='S1', count=6, identity_verified=True, scope='worldwide'),
            dict(
                kind='S5',
                count=5,
                complete=True,
                identity_verified=True,
                scope='worldwide',
            ),
        ]
        self.assertEqual(cs.decide(evidence)['decision'], 'unknown')

    def test_location_dedup_does_not_count_nearby_duplicate_listings(self):
        self.assertEqual(
            cs.distinct_locations(
                [(33.70049, -117.80049), (33.70051, -117.80051), (33.71, -117.81)]
            ),
            2,
        )

    def test_metrics_report_unknowns_and_all_misses(self):
        rows = [
            {'id': 1, 'decision': 'chain', 'signals': ['S1']},
            {'id': 2, 'decision': 'unknown', 'signals': []},
            {'id': 3, 'decision': 'independent', 'signals': ['S5']},
        ]
        report = cs.summarize(rows, expected_chains={1, 2})
        self.assertEqual(report['chain_recall'], 0.5)
        self.assertEqual(report['missed_chain_ids'], [2])
        self.assertEqual(
            report['decisions'], {'chain': 1, 'unknown': 1, 'independent': 1}
        )


class SourceTest(unittest.TestCase):
    def test_identity_does_not_match_a_generic_prefix_in_an_unrelated_business(self):
        import chain_sources as src

        self.assertFalse(
            src.place_matches(
                {'name': 'Costa', 'lat': 33.7, 'lng': -117.8},
                {'name': 'Costa Vida', 'lat': 33.7, 'lon': -117.8},
            )
        )
        self.assertTrue(
            src.place_matches(
                {'name': 'Board & Brew', 'lat': 33.7, 'lng': -117.8},
                {'name': 'Board and Brew - Tustin', 'lat': 33.7, 'lon': -117.8},
            )
        )

    def test_city_only_match_requires_full_name_and_same_city(self):
        import chain_sources as src

        r = {'name': 'Golden Dragon', 'lat': None, 'lng': None, 'location': 'Tustin'}
        self.assertTrue(
            src.place_matches(
                r,
                {'name': 'Golden Dragon', 'city': 'Tustin', 'lat': 33.7, 'lon': -117.8},
            )
        )
        self.assertFalse(
            src.place_matches(
                r,
                {
                    'name': 'Golden Dragon',
                    'city': 'Anaheim',
                    'lat': 33.7,
                    'lon': -117.8,
                },
            )
        )

    def test_numeric_grounding_does_not_treat_years_as_location_counts(self):
        import chain_sources as src

        self.assertEqual(src.explicit_location_counts('Family owned for 50 years.'), [])
        self.assertEqual(
            src.explicit_location_counts('We have 7 locations worldwide.'), [7]
        )

    def test_model_quote_must_occur_in_supplied_source_and_contain_count(self):
        import chain_sources as src

        sources = ['We operate 7 locations worldwide.']
        self.assertTrue(
            src.grounded_count({'count': 7, 'quote': sources[0], 'source': 0}, sources)
        )
        self.assertFalse(
            src.grounded_count(
                {'count': 6, 'quote': 'We operate 6 locations worldwide.', 'source': 0},
                sources,
            )
        )
        self.assertFalse(
            src.grounded_count({'count': 7, 'quote': '', 'source': 0}, sources)
        )

    def test_failed_source_never_becomes_negative_evidence(self):
        import chain_sources as src

        self.assertEqual(
            src.model_evidence(
                'S5',
                {
                    'count': 1,
                    'complete': True,
                    'quote': 'only one location',
                    'source': 0,
                },
                [],
            ),
            [],
        )


class NsiTest(unittest.TestCase):
    def test_current_nsi_top_level_items_and_us_scope(self):
        import chain_sources as src

        items = {
            'items': [
                {
                    'id': 'synthetic',
                    'locationSet': {'include': ['us']},
                    'tags': {'brand': 'Synthetic Foods'},
                },
                {'locationSet': {'include': ['gb']}, 'tags': {'brand': 'UK Foods'}},
            ]
        }
        self.assertEqual(
            [b['name'] for b in src.nsi_brands(items)], ['Synthetic Foods']
        )


class ModelTest(unittest.TestCase):
    def test_partial_or_invalid_gemma_response_is_an_error(self):
        import chain_models as cm

        for response in [
            {'done': False, 'message': {'content': '{"count":6}'}},
            {'done': True, 'message': {'content': 'not json'}},
        ]:
            with self.assertRaises(ValueError):
                cm.parse_gemma(response)
        self.assertEqual(
            cm.parse_gemma(
                {'done': True, 'message': {'content': '{"decision":"unknown"}'}}
            )['decision'],
            'unknown',
        )

    def test_jev_probability_reads_noul_answer(self):
        import chain_models as cm

        self.assertEqual(cm.probability({'answers': {'x': {'noul': 0.8}}}, 'x'), 0.8)
        self.assertIsNone(cm.probability({'error': 'unavailable'}, 'x'))

    def test_probe_relabel_does_not_call_missing_counts_negative(self):
        import chain_evaluate as ce

        self.assertIsNone(ce.probe_label(None))
        self.assertEqual(ce.probe_label(5), False)
        self.assertEqual(ce.probe_label(6), True)


class EvaluationTest(unittest.TestCase):
    def test_brand_with_no_local_identity_match_does_not_get_atp_count(self):
        import chain_evaluate as ce

        r = {
            'id': 1,
            'name': 'Synthetic Grill',
            'status': 'active',
            'exclusion_reason': None,
            'lat': 33.7,
            'lng': -117.8,
            'location': 'Tustin',
        }
        nsi = {'brands': []}
        atp = {
            'brands': ['Synthetic Grill'],
            'places': [
                {
                    'id': str(i),
                    'brand': 'Synthetic Grill',
                    'name': 'Synthetic Grill',
                    'lat': 33.7 + i * 0.01,
                    'lon': -117.8,
                }
                for i in range(6)
            ],
        }
        row = ce.deterministic_rows([r], {}, [], nsi, atp)[0]
        self.assertEqual(row['decision'], 'unknown')

    def test_failed_website_has_no_source_text(self):
        import chain_sources as src
        import tempfile
        from unittest.mock import patch

        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(src, 'public_url', side_effect=ValueError('nonpublic')),
        ):
            result = src.website_text('http://127.0.0.1/', Path(folder))
        self.assertIn('error', result)
        self.assertNotIn('text', result)


class GroundingTest(unittest.TestCase):
    def test_gemma_abstention_with_a_count_does_not_exclude(self):
        import chain_sources as src

        self.assertEqual(
            src.model_evidence(
                'S6',
                {
                    'decision': 'unknown',
                    'count': 6,
                    'quote': 'We have 6 locations worldwide.',
                    'source': 0,
                    'identity_verified': True,
                },
                ['We have 6 locations worldwide.'],
            ),
            [],
        )

    def test_shared_nsi_atp_brand_without_nearby_identity_is_not_corroboration(self):
        import chain_evaluate as ce

        r = {
            'id': 1,
            'name': 'Synthetic Grill',
            'status': 'active',
            'exclusion_reason': None,
            'lat': 33.7,
            'lng': -117.8,
            'location': 'Tustin',
        }
        nsi = {'brands': [{'name': 'Synthetic Grill', 'source': 'NSI'}]}
        atp = {
            'brands': ['Synthetic Grill'],
            'places': [
                {
                    'id': str(i),
                    'brand': 'Synthetic Grill',
                    'name': 'Synthetic Grill',
                    'lat': 37 + i * 0.01,
                    'lon': -122,
                }
                for i in range(6)
            ],
        }
        self.assertEqual(
            ce.deterministic_rows([r], {}, [], nsi, atp)[0]['decision'], 'unknown'
        )


class CacheTest(unittest.TestCase):
    def test_identical_concurrent_model_requests_are_single_flight(self):
        import tempfile, time, concurrent.futures
        from chain_models import Models

        calls = []
        with tempfile.TemporaryDirectory() as folder:
            model = Models(Path(folder))

            def call():
                calls.append(1)
                time.sleep(0.02)
                return {'answers': {}}

            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                results = list(
                    pool.map(
                        lambda _: model._cached('test', {'same': 'request'}, call),
                        range(16),
                    )
                )
        self.assertEqual(len(calls), 1)
        self.assertTrue(all(r['response'] == {'answers': {}} for r in results))


class PrecisionGuardTest(unittest.TestCase):
    def test_clipped_official_page_cannot_establish_complete_small_total(self):
        import chain_evaluate as ce
        import tempfile

        class Model:
            def gemma(self, prompt):
                return {
                    'seconds': 0,
                    'response': {
                        'done': True,
                        'message': {
                            'content': '{"decision":"independent","count":5,"complete":true,"identity_verified":true,"source":0,"quote":"We have 5 locations worldwide."}'
                        },
                    },
                }

        row = {
            'id': 1,
            'name': 'Synthetic Grill',
            'location': 'Tustin',
            'decision': 'unknown',
            'evidence': [],
        }
        source = {
            'kind': 'S5',
            'text': 'We have 5 locations worldwide.' + 'x' * 6000,
            'truncated': False,
            'url': 'https://example.com/',
        }
        with tempfile.TemporaryDirectory() as folder:
            ce.gemma_unresolved([row], {1: [source]}, Model(), Path(folder))
        self.assertEqual(row['decision'], 'unknown')

    def test_model_decision_and_count_must_agree(self):
        import chain_sources as src

        result = {
            'decision': 'independent',
            'count': 6,
            'identity_verified': True,
            'complete': True,
            'source': 0,
            'quote': 'We have 6 locations worldwide.',
        }
        self.assertEqual(src.model_evidence('S6', result, [result['quote']]), [])

    def test_scratch_connection_pins_loopback_address_against_libpq_env(self):
        import chain_sources as src
        from unittest.mock import patch

        with patch.object(
            src.psycopg, 'connect', side_effect=RuntimeError('stop before connect')
        ) as connect:
            with self.assertRaises(RuntimeError):
                src.snapshot('postgresql://r:p@localhost:54388/check_scratch')
        self.assertEqual(connect.call_args.kwargs.get('hostaddr'), '127.0.0.1')


class SharedCacheTest(unittest.TestCase):
    def test_two_model_instances_share_one_cached_call(self):
        import tempfile, time, concurrent.futures
        from chain_models import Models

        calls = []
        with tempfile.TemporaryDirectory() as folder:
            models = [Models(Path(folder)), Models(Path(folder))]

            def call():
                calls.append(1)
                time.sleep(0.05)
                return {'answers': {}}

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                list(
                    pool.map(
                        lambda model: model._cached('test', {'request': 1}, call),
                        models,
                    )
                )
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
