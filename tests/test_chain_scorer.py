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


class SourceRetrievalTest(unittest.TestCase):
    def test_broadway_requires_number_and_optional_direction_only(self):
        import chain_sources as src
        for street in ('Broadway', 'N Broadway', 'South Broadway'):
            entries = [dict(source=0, quote=f'{145+i} {street}, New York',
                address=f'{145+i} {street}', city='New York', operating=True)
                for i in range(6)]
            with self.subTest(street=street):
                self.assertEqual(len(src.grounded_locations(dict(count=6, locations=entries),
                    [' '.join(e['quote'] for e in entries)])), 6)
        entries = [dict(source=0, quote=f'{145+i} shows on Broadway, New York',
            address=f'{145+i} shows on Broadway', city='New York', operating=True)
            for i in range(6)]
        self.assertEqual(src.grounded_locations(dict(count=6, locations=entries),
            [' '.join(e['quote'] for e in entries)]), [])

    def test_city_named_road_requires_locality_outside_address(self):
        import chain_sources as src
        for suffix in ('', ' Open daily. 15101 Addison Rd', ', Addisonville'):
            entries = [dict(source=0, quote=f'{15101+i} Addison Rd{suffix}',
                address=f'{15101+i} Addison Rd', city='Addison', operating=True)
                for i in range(6)]
            # Keep repeated street mentions identical to each entry's address.
            for entry in entries:
                entry['quote'] = entry['quote'].replace('15101 Addison Rd', entry['address'])
            with self.subTest(suffix=suffix):
                self.assertEqual(src.grounded_locations(dict(count=6, locations=entries),
                    [' '.join(e['quote'] for e in entries)]), [])
        entries = [dict(source=0, quote=f'{15101+i} Addison Rd, Addison, TX',
            address=f'{15101+i} Addison Rd', city='Addison', operating=True)
            for i in range(6)]
        self.assertEqual(len(src.grounded_locations(dict(count=6, locations=entries),
            [' '.join(e['quote'] for e in entries)])), 6)

    def test_grounded_addresses_accept_broadway_and_circle_but_reject_nonaddresses(self):
        import chain_sources as src
        addresses = ['145 N Broadway', '760 Briarwood Cir', '100 Main St',
            '101 Main St', '102 Main St', '103 Main St']
        entries = [dict(source=0, quote=f'{address}, City{i}', address=address,
            city=f'City{i}', operating=True) for i, address in enumerate(addresses)]
        source = ' '.join(e['quote'] for e in entries)
        result = dict(count=6, locations=entries)
        self.assertEqual(len(src.grounded_locations(result, [source])), 6)
        expanded = [dict(e) for e in entries]
        expanded[1].update(address='760 Briarwood Circle',
            quote='760 Briarwood Circle, City1')
        self.assertEqual(len(src.grounded_locations(dict(count=6, locations=expanded),
            [' '.join(e['quote'] for e in expanded)])), 6)
        aliases = [dict(e) for e in entries]
        aliases[2].update(address='760 Briarwood Circle', city='City1',
            quote='760 Briarwood Circle, City1')
        alias_source = ' '.join(e['quote'] for e in aliases)
        self.assertEqual(src.grounded_locations(dict(count=6, locations=aliases),
            [alias_source]), [])
        for invalid in ('145 dinner menu', '760 Briarwood'):
            altered = [dict(e) for e in entries]
            altered[0].update(address=invalid, quote=f'{invalid}, City0')
            invalid_source = ' '.join(e['quote'] for e in altered)
            self.assertEqual(src.grounded_locations(dict(count=6, locations=altered),
                [invalid_source]), [])

    def test_city_named_road_is_retained_and_full_address_duplicate_rejected(self):
        import chain_sources as src
        addresses = ['15101 Addison Rd'] + [f'{i} Main St' for i in range(100, 105)]
        entries = [dict(source=0, quote=f'{address}, Addison, TX 75001',
            address=address, city='Addison', operating=True) for address in addresses]
        source = ' '.join(e['quote'] for e in entries)
        self.assertEqual(len(src.grounded_locations(dict(count=6, locations=entries),
            [source])), 6)
        invalid = [dict(e) for e in entries]
        invalid[0].update(address='15101 Main, Addison CT',
            quote='15101 Main, Addison CT')
        self.assertEqual(src.grounded_locations(dict(count=6, locations=invalid),
            [' '.join(e['quote'] for e in invalid)]), [])
        entries[-1] = dict(entries[0], address='15101 Addison Rd, Addison TX 75001',
            quote='15101 Addison Rd, Addison TX 75001')
        self.assertEqual(src.grounded_locations(dict(count=6, locations=entries),
            [' '.join(e['quote'] for e in entries)]), [])

    def test_address_quotes_allow_html_whitespace_but_not_changed_words(self):
        import chain_sources as src
        entries = [dict(source=0, quote=f'{100+i} Main St City{i}',
            address=f'{100+i} Main St', city=f'City{i}', operating=True) for i in range(6)]
        source = '\n'.join(e['quote'].replace(' ', '\u00a0') for e in entries)
        result = dict(count=6, locations=entries)
        self.assertEqual(len(src.grounded_locations(result, [source])), 6)
        entries[0]['quote'] = entries[0]['quote'].replace('Main', 'Oak')
        entries[0]['address'] = entries[0]['address'].replace('Main', 'Oak')
        self.assertEqual(src.grounded_locations(result, [source]), [])

    def test_local_domain_survives_speculative_locator_domains(self):
        import chain_evaluate as ce
        restaurant = dict(id=1, name='Example Cafe', location='Tustin',
            status='active', exclusion_reason=None, lat=None, lng=None)
        local = dict(id='local', name='Example Cafe', lat=33.7, lon=-117.8,
            websites=['https://local-example.com/'], phones=[])
        global_places = [dict(local, id=str(i), websites=[
            'https://' + domain + '-example.com/locations']) for i, domain in enumerate('abcd')]
        row = ce.deterministic_rows([restaurant], {1: [local]}, global_places,
            {'brands': []}, {'brands': [], 'places': []})[0]
        self.assertIn('https://local-example.com/', row['candidate_websites'])
        self.assertIn('https://local-example.com/', ce.row_websites(row))
        self.assertEqual(len(ce.row_websites(row)), 3)

    def test_distinctive_name_does_not_spend_inference_on_unverified_identity(self):
        import chain_evaluate as ce
        from unittest.mock import Mock
        row = dict(id=1, name='Distinctive Cafe', same_name_count=6,
            decision='unknown', evidence=[])
        model = Mock()
        ce.jev_generic_names([row], [], model)
        model.jev.assert_not_called()
        self.assertEqual(row['decision'], 'unknown')
        self.assertEqual(row['evidence'], [])

    def test_directory_domain_or_phone_does_not_verify_business_affiliation(self):
        import chain_evaluate as ce
        places = [dict(id=str(i), lat=33.7 + i * .01, lon=-117.8) for i in range(6)]
        for kind in ('S1', 'S2'):
            evidence = ce.count_evidence(kind, places)
            self.assertFalse(evidence['identity_verified'])
            self.assertEqual(cs.decide([evidence])['decision'], 'unknown')

    def test_atp_and_global_sources_survive_missing_local_match(self):
        import chain_evaluate as ce
        restaurant = dict(id=1, name='Round Table', location='Fullerton',
            status='active', exclusion_reason=None, lat=None, lng=None)
        places = [dict(id='a', name='Round Table', lat=33.7, lon=-117.8,
            websites=['https://roundtable-example.com/locations'], phones=[])]
        atp = {'brands': ['Round Table Pizza'], 'places': [dict(
            id='b', brand='Round Table Pizza', name='Round Table Pizza',
            lat=33.8, lon=-117.9, websites=['https://roundtable-example.com/fullerton'],
            source='https://roundtable-example.com/locations')]}
        row = ce.deterministic_rows([restaurant], {}, places, {'brands': []}, atp)[0]
        self.assertEqual(row['decision'], 'unknown')
        self.assertIn('https://roundtable-example.com/locations', row['candidate_websites'])
        self.assertEqual(len(row['candidate_websites']), 1)

    def test_retrieval_prefers_locator_and_bounds_domains(self):
        import chain_evaluate as ce
        urls = ['https://a-example.com/branch/' + str(i) for i in range(100)]
        urls += ['https://a-example.com/locations']
        urls += ['https://' + c + '-example.com/' for c in 'bcdef']
        chosen = ce.candidate_websites(urls)
        self.assertEqual(len(chosen), 3)
        self.assertIn('https://a-example.com/locations', chosen)
        row = dict(candidate_websites=[], overture_matches=[dict(websites=urls)])
        self.assertEqual(ce.row_websites(row), chosen)

    def test_website_cache_must_cover_current_source_selection(self):
        import chain_evaluate as ce
        import tempfile
        import json
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            old = dict(requested_url='https://old-example.com/',
                url='https://old-example.com/', text='Old', links=[],
                extract_version=ce.WEBSITE_EXTRACT_VERSION)
            (output / 'websites.json').write_text(json.dumps([old]))
            rows = [dict(overture_matches=[], candidate_websites=['https://new-example.com/'])]
            page = {**old, 'requested_url': 'https://new-example.com/', 'url': 'https://new-example.com/'}
            with patch.object(ce, 'website_text', return_value=page) as fetch:
                result = ce.fetch_websites(rows, output, output, 1)
            fetch.assert_called_once_with('https://new-example.com/', output)
            self.assertEqual(result[0]['url'], 'https://new-example.com/')

    def test_redirected_candidate_is_retained_without_asserting_official_identity(self):
        import chain_evaluate as ce
        import tempfile
        class Model:
            def jev(self, state, questions):
                return {'error': 'No judgment available'}
        row = dict(id=1, name='Synthetic Cafe', location='Tustin', evidence=[],
            overture_matches=[], candidate_websites=['https://old-example.com/'], decision='unknown')
        page = dict(requested_url='https://old-example.com/', url='https://new-example.com/',
            text='Synthetic Cafe website', truncated=False)
        detail = dict(requested_url='https://new-example.com/locations',
            url='https://new-example.com/locations', text='Synthetic Cafe locations', truncated=False)
        with tempfile.TemporaryDirectory() as directory:
            failed = dict(requested_url='https://old-example.com/failed', error='Timeout')
            contexts = ce.jev_sources([row], [], [page, detail, failed], Model(), Path(directory), 1)
        self.assertEqual(len(contexts[1]), 2)
        self.assertEqual(contexts[1][0]['url'], 'https://new-example.com/')
        self.assertFalse(contexts[1][0]['official_source'])
        self.assertEqual(row['decision'], 'unknown')


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
            'official_source': True,
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


class ReviewRegressionTest(unittest.TestCase):
    def test_nearby_high_latitude_pairs_are_three_sites_not_six(self):
        coords = [(60, lon + d) for lon in (0, 1, 2) for d in (0.00099, 0.00201)]
        self.assertEqual(cs.distinct_locations(coords), 3)

    def test_antimeridian_neighbors_are_one_site(self):
        self.assertEqual(cs.distinct_locations([(0, 179.9999), (0, -179.9999)]), 1)

    def test_unverified_publisher_cannot_establish_independence(self):
        import chain_evaluate as ce
        import tempfile

        class Model:
            def jev(self, state, questions):
                values = {
                    'complete_small_total': 0.99,
                    'official_source': 0.1,
                    'count_0': 0.99,
                }
                return {
                    'response': {
                        'answers': {q: {'noul': values.get(q, 0.01)} for q in questions}
                    }
                }

        row = {
            'id': 1,
            'name': 'Synthetic Grill',
            'location': 'Tustin',
            'evidence': [],
            'overture_matches': [{'websites': ['https://example.com/']}],
            'decision': 'unknown',
        }
        website = {
            'requested_url': 'https://example.com/',
            'url': 'https://example.com/',
            'text': 'Synthetic Grill has exactly five locations worldwide.',
            'truncated': False,
        }
        with tempfile.TemporaryDirectory() as folder:
            ce.jev_sources([row], [], [website], Model(), Path(folder), 1)
        self.assertEqual(row['decision'], 'unknown')

    def test_gemma_small_total_requires_verified_official_source(self):
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

        for official, expected in [(False, 'unknown'), (True, 'independent')]:
            row = {
                'id': 1,
                'name': 'Synthetic Grill',
                'location': 'Tustin',
                'evidence': [],
                'decision': 'unknown',
            }
            source = {
                'kind': 'S5',
                'url': 'https://example.com/',
                'text': 'We have 5 locations worldwide.',
                'official_source': official,
                'truncated': False,
            }
            with tempfile.TemporaryDirectory() as folder:
                ce.gemma_unresolved([row], {1: [source]}, Model(), Path(folder))
            self.assertEqual(row['decision'], expected)

    def test_postcode_before_locations_heading_is_not_a_count(self):
        import chain_sources as src

        self.assertEqual(
            src.explicit_location_counts(
                'Mountain Mikes, Dixon CA 95620 Locations Menu'
            ),
            [],
        )
        self.assertEqual(
            src.explicit_location_counts('We operate 38,000 restaurants worldwide.'),
            [38000],
        )

    def test_positive_abstention_is_a_miss_in_overall_recall(self):
        import chain_evaluate as ce
        import tempfile, json

        class Model:
            def jev(self, state, questions):
                return {'response': {'answers': {'six_plus': {'noul': 0.9}}}}

            def gemma(self, prompt, probe=False):
                result = {
                    'six_plus': True if 'First' in prompt else None,
                    'confidence': 0.8 if 'First' in prompt else 0,
                }
                return {
                    'response': {
                        'done': True,
                        'message': {'content': json.dumps(result)},
                    }
                }

        rows = [
            {
                'id': i,
                'name': name,
                'location': 'Tustin',
                'evidence': [{'source': 'Overture', 'count': 6}],
            }
            for i, name in [(1, 'First'), (2, 'Second')]
        ]
        with tempfile.TemporaryDirectory() as folder:
            probes = Path(folder) / 'probes.json'
            probes.write_text(
                json.dumps(
                    [
                        {'id': r['id'], 'name': r['name'], 'city': r['location']}
                        for r in rows
                    ]
                )
            )
            report = ce.comparison_report(rows, Model(), Path(folder), probes)
        self.assertEqual(report['metrics']['gemma']['positive_labels'], 2)
        self.assertEqual(report['metrics']['gemma']['recall'], 0.5)


class SourceValidationTest(unittest.TestCase):
    def test_known_ordering_and_directory_domains_are_ineligible(self):
        for host in [
            'olo.com',
            'twitter.com',
            'hub.biz',
            'poi.place',
            'ocregister.com',
            'eatchownow.com',
        ]:
            self.assertIsNone(cs.website_domain('https://' + host + '/synthetic'))

    def test_verified_official_total_can_confirm_small_business(self):
        import chain_evaluate as ce
        import tempfile

        states = []

        class Model:
            def jev(self, state, questions):
                states.append(state)
                values = {
                    'official_source': 0.99,
                    'complete_small_total': 0.99,
                    'count_0': 0.99,
                }
                return {
                    'response': {
                        'answers': {q: {'noul': values.get(q, 0.01)} for q in questions}
                    }
                }

        row = {
            'id': 1,
            'name': 'Synthetic Grill',
            'location': 'Tustin',
            'evidence': [],
            'decision': 'unknown',
            'overture_matches': [
                {
                    'name': 'Synthetic Grill',
                    'city': 'Tustin',
                    'websites': ['https://example.com/'],
                }
            ],
        }
        page = {
            'requested_url': 'https://example.com/',
            'url': 'https://example.com/',
            'text': 'Synthetic Grill has exactly five locations worldwide.',
            'truncated': False,
        }
        with tempfile.TemporaryDirectory() as folder:
            contexts = ce.jev_sources([row], [], [page], Model(), Path(folder), 1)
        self.assertEqual(row['decision'], 'independent')
        self.assertTrue(contexts[1][0]['official_source'])
        self.assertEqual(states[0]['restaurant']['city'], 'Tustin')
        self.assertEqual(states[0]['source']['url'], 'https://example.com/')
        self.assertEqual(
            states[0]['restaurant']['local_matches'][0]['name'], 'Synthetic Grill'
        )

    def test_chain_probability_cannot_validate_an_unrelated_numeric_phrase(self):
        import chain_evaluate as ce
        import tempfile

        class Model:
            def jev(self, state, questions):
                values = {'official_source': 0.99, 'six_plus': 0.99, 'count_0': 0.01}
                return {
                    'response': {
                        'answers': {q: {'noul': values.get(q, 0.01)} for q in questions}
                    }
                }

        row = {
            'id': 1,
            'name': 'Synthetic Grill',
            'location': 'Tustin',
            'evidence': [],
            'decision': 'unknown',
            'overture_matches': [{'websites': ['https://example.com/']}],
        }
        page = {
            'requested_url': 'https://example.com/',
            'url': 'https://example.com/',
            'text': 'Competitor Grill has seven locations. Synthetic Grill serves Tustin.',
            'truncated': False,
        }
        with tempfile.TemporaryDirectory() as folder:
            ce.jev_sources([row], [], [page], Model(), Path(folder), 1)
        self.assertEqual(row['decision'], 'unknown')

    def test_global_cache_only_reuses_a_hash_verified_superset(self):
        import chain_sources as src
        import hashlib, json

        old = {
            'domains': ['a.com', 'b.com'],
            'names': ['synthetic grill'],
            'phones': ['123'],
        }
        meta = {
            'release': src.RELEASE,
            'scope': 'worldwide',
            'selection': old,
            'signature': hashlib.sha256(
                json.dumps(
                    [
                        src.RELEASE,
                        'static-domain-v2',
                        old['domains'],
                        old['names'],
                        old['phones'],
                    ]
                ).encode()
            ).hexdigest(),
        }
        new = {**old, 'domains': ['a.com']}
        self.assertTrue(src.global_cache_matches(meta, new))
        self.assertFalse(
            src.global_cache_matches(meta, {**new, 'names': ['new business']})
        )
        self.assertFalse(src.global_cache_matches({**meta, 'signature': 'bad'}, new))
        self.assertFalse(src.global_cache_matches({**meta, 'release': 'old'}, new))

    def test_prepare_only_finishes_before_any_gemma_call(self):
        import chain_evaluate as ce
        from contextlib import ExitStack
        from unittest.mock import patch
        from types import SimpleNamespace
        import tempfile, json

        row = {
            'id': 1,
            'status': 'active',
            'exclusion_reason': None,
            'decision': 'unknown',
            'signals': [],
        }
        snap = {'restaurants': [], 'mentions': [], 'fingerprint': {'unchanged': True}}
        with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
            replacements = {
                'snapshot': snap,
                'download_nsi': {},
                'local_places': [],
                'match_places': {},
                'global_places': [],
                'atp_places': {'parse_errors': []},
                'deterministic_rows': [row],
                'fetch_websites': [],
                'jev_sources': {},
                'jev_generic_names': None,
            }
            for name, result in replacements.items():
                stack.enter_context(patch.object(ce, name, return_value=result))
            gemma = stack.enter_context(
                patch.object(
                    ce,
                    'gemma_unresolved',
                    side_effect=AssertionError('Gemma forbidden'),
                )
            )
            comparison = stack.enter_context(
                patch.object(
                    ce,
                    'comparison_report',
                    side_effect=AssertionError('Gemma comparison forbidden'),
                )
            )
            ce.run(
                SimpleNamespace(
                    output=folder,
                    cache=folder,
                    atp_zip='unused',
                    scratch_dsn='unused',
                    workers=1,
                    prepare_only=True,
                )
            )
            report = json.loads((Path(folder) / 'preparation-summary.json').read_text())
            gemma.assert_not_called()
            comparison.assert_not_called()
            self.assertFalse(report['evaluation_complete'])
            self.assertTrue(report['database_unchanged'])
            self.assertFalse((Path(folder) / 'summary.json').exists())


class ListedLocationsTest(unittest.TestCase):
    def fixture(self, count=6):
        entries = [
            {
                'source': 0,
                'quote': f'Synthetic Grill {100 + i} Main Street, Tustin. Open daily.',
                'address': f'{100 + i} Main Street',
                'city': 'Tustin',
                'operating': True,
            }
            for i in range(count)
        ]
        result = {
            'decision': 'chain',
            'count': count,
            'identity_verified': True,
            'complete': True,
            'locations': entries,
        }
        return result, [' '.join(e['quote'] for e in entries)]

    def test_six_quoted_distinct_addresses_support_chain_without_numeric_total(self):
        from chain_sources import model_evidence

        result, sources = self.fixture()
        evidence = model_evidence('S6', result, sources)
        self.assertEqual(cs.decide(evidence)['decision'], 'chain')
        self.assertEqual(len(evidence[0]['locations']), 6)
        self.assertFalse(evidence[0]['complete'])

    def test_address_list_accepts_alphanumeric_numbers_and_via_streets(self):
        from chain_sources import model_evidence

        result, sources = self.fixture()
        for entry, address in zip(
            result['locations'],
            [
                '400B Camino de Estrella',
                '821 Via Suerte',
                '120 Avenida Pico',
                '27124 Paseo Espada',
                '34069 Doheny Park Rd.',
                '2 Ritz Carlton Drive',
            ],
        ):
            entry.update(address=address, quote=f'{address}, Tustin. Open daily.')
        sources = [' '.join(e['quote'] for e in result['locations'])]
        self.assertEqual(
            cs.decide(model_evidence('S6', result, sources))['decision'], 'chain'
        )

    def test_future_opening_entry_cannot_establish_six_operating_sites(self):
        from chain_sources import model_evidence

        result, sources = self.fixture()
        result['locations'][-1]['quote'] = '105 Main Street, Tustin. Opening Fall 2026.'
        sources = [' '.join(e['quote'] for e in result['locations'])]
        self.assertEqual(model_evidence('S6', result, sources), [])

    def test_evaluation_preserves_each_location_source_url(self):
        import chain_evaluate as ce
        import json, tempfile

        result, texts = self.fixture()

        class RecordedResponse:
            def gemma(self, prompt):
                self.prompt = prompt
                return {
                    'seconds': 0,
                    'response': {
                        'done': True,
                        'message': {'content': json.dumps(result)},
                    },
                }

        model = RecordedResponse()
        row = {
            'id': 1,
            'name': 'Synthetic Grill',
            'location': 'Tustin',
            'evidence': [],
            'decision': 'unknown',
        }
        source = {
            'kind': 'S5',
            'url': 'https://example.com/locations',
            'text': texts[0],
            'official_source': True,
            'truncated': False,
        }
        with tempfile.TemporaryDirectory() as folder:
            ce.gemma_unresolved([row], {1: [source]}, model, Path(folder))
        self.assertEqual(row['decision'], 'chain')
        self.assertTrue(
            all(e['url'] == source['url'] for e in row['evidence'][0]['locations'])
        )
        self.assertIn('"official_source": true', model.prompt)

    def test_duplicate_addresses_across_sources_do_not_inflate_count(self):
        from chain_sources import model_evidence

        result, sources = self.fixture(5)
        duplicate = dict(
            result['locations'][0],
            source=1,
            address='100 Main St.',
            quote='Synthetic Grill 100 Main St., Tustin. Open daily.',
        )
        result['locations'].append(duplicate)
        result['count'] = 6
        sources.append(duplicate['quote'])
        self.assertEqual(model_evidence('S6', result, sources), [])

    def test_mailing_suffix_and_city_state_variations_do_not_duplicate_branches(self):
        from chain_sources import model_evidence

        for address, city in [
            ('100 Main St., Tustin CA 92780', 'Tustin'),
            ('100 Main Street', 'Tustin CA'),
            ('100 Main St., tustin ca 92780', 'tustin ca'),
        ]:
            with self.subTest(address=address, city=city):
                result, sources = self.fixture(5)
                duplicate = dict(
                    result['locations'][0],
                    source=1,
                    address=address,
                    city=city,
                    quote=f'{address}, {city}. Open daily.',
                )
                result['locations'].append(duplicate)
                result['count'] = 6
                sources.append(duplicate['quote'])
                self.assertEqual(model_evidence('S6', result, sources), [])

    def test_closed_planned_and_ungrounded_entries_cannot_reach_six(self):
        from chain_sources import model_evidence

        for change in [
            {'operating': False},
            {'quote': 'Synthetic Grill 105 Main Street, Tustin. Coming soon.'},
            {'quote': 'Synthetic Grill 105 Main Street, Tustin. Permanently closed.'},
            {'address': '999 Invented Street'},
            {'city': 'Irvine'},
            {'source': True},
        ]:
            with self.subTest(change=change):
                result, sources = self.fixture()
                result['locations'][-1].update(change)
                if 'quote' in change:
                    sources = [' '.join(e['quote'] for e in result['locations'])]
                self.assertEqual(model_evidence('S6', result, sources), [])

    def test_list_is_not_a_complete_small_worldwide_total(self):
        from chain_sources import model_evidence

        result, sources = self.fixture(5)
        result['decision'] = 'independent'
        self.assertEqual(model_evidence('S6', result, sources), [])

    def test_boolean_source_index_cannot_ground_literal_count(self):
        from chain_sources import grounded_count

        self.assertFalse(
            grounded_count(
                {
                    'source': True,
                    'count': 6,
                    'quote': 'We operate six locations worldwide.',
                },
                ['other source', 'We operate six locations worldwide.'],
            )
        )


class ComparisonPolicyLabelsTest(unittest.TestCase):
    def test_observed_small_count_is_not_a_negative_worldwide_policy_label(self):
        import chain_evaluate as ce

        items = [
            {
                'id': 1,
                'name': 'Synthetic Grill',
                'city': 'Tustin',
                'worldwide_observed_count': 5,
                'proxy_label': False,
            },
            {
                'id': 2,
                'name': 'Synthetic Chain',
                'city': 'Tustin',
                'worldwide_observed_count': 6,
                'proxy_label': True,
            },
        ]
        ce.reconcile_probe_labels(items, [])
        self.assertIsNone(items[0]['policy_label'])
        self.assertTrue(items[1]['policy_label'])
        self.assertEqual(
            items[1]['policy_label_basis'], 'observed_worldwide_lower_bound'
        )

    def test_official_lower_bound_overrides_proxy_undercount_and_keeps_provenance(self):
        import chain_evaluate as ce

        items = [
            {
                'id': 1,
                'name': 'Synthetic Grill',
                'city': 'Tustin',
                'worldwide_observed_count': 5,
                'proxy_label': False,
            }
        ]
        audits = [
            {
                'id': 1,
                'name': 'Synthetic Grill',
                'city': 'Tustin',
                'count': 6,
                'scope': 'worldwide',
                'label': True,
                'basis': 'official_operating_location_list',
                'url': 'https://example.com/locations',
                'note': 'Six distinct operating addresses.',
            }
        ]
        ce.reconcile_probe_labels(items, audits)
        self.assertTrue(items[0]['policy_label'])
        self.assertFalse(items[0]['proxy_label'])
        self.assertEqual(items[0]['policy_label_evidence']['url'], audits[0]['url'])

    def test_invalid_identity_audit_removes_directory_positive_from_reference(self):
        import chain_evaluate as ce

        items = [
            {
                'id': 1,
                'name': 'Synthetic Grill',
                'city': 'Tustin',
                'worldwide_observed_count': 60,
                'proxy_label': True,
            }
        ]
        ce.reconcile_probe_labels(
            items,
            [
                {
                    'id': 1,
                    'name': 'Synthetic Grill',
                    'city': 'Tustin',
                    'count': None,
                    'scope': 'worldwide',
                    'label': None,
                    'basis': 'rejected_domain_identity',
                    'url': 'https://example.com/',
                    'note': 'Assigned domain belongs to another business.',
                }
            ],
        )
        self.assertIsNone(items[0]['policy_label'])
        self.assertTrue(items[0]['proxy_label'])

    def test_regional_small_total_cannot_supply_a_negative_worldwide_label(self):
        import chain_evaluate as ce

        item = {
            'id': 1,
            'name': 'Synthetic Grill',
            'city': 'Tustin',
            'worldwide_observed_count': 5,
            'proxy_label': False,
        }
        with self.assertRaises(ValueError):
            ce.reconcile_probe_labels(
                [item],
                [
                    {
                        'id': 1,
                        'name': 'Synthetic Grill',
                        'city': 'Tustin',
                        'count': 5,
                        'scope': 'regional',
                        'label': False,
                        'complete': True,
                        'basis': 'official_complete_total',
                        'url': 'https://example.com/',
                        'note': 'Five regional stores.',
                    }
                ],
            )

    def test_audit_must_match_probe_identity(self):
        import chain_evaluate as ce

        item = {
            'id': 1,
            'name': 'Synthetic Grill',
            'city': 'Tustin',
            'worldwide_observed_count': 5,
            'proxy_label': False,
        }
        with self.assertRaises(ValueError):
            ce.reconcile_probe_labels(
                [item],
                [
                    {
                        'id': 1,
                        'name': 'Other Business',
                        'city': 'Tustin',
                        'count': 6,
                        'scope': 'worldwide',
                        'label': True,
                        'basis': 'official_operating_location_list',
                        'url': 'https://example.com/',
                        'note': 'Six locations.',
                    }
                ],
            )

    def test_decisive_audit_requires_well_formed_public_provenance(self):
        import chain_evaluate as ce

        item = {
            'id': 1,
            'name': 'Synthetic Grill',
            'city': 'Tustin',
            'worldwide_observed_count': 5,
            'proxy_label': False,
        }
        audit = {
            'id': 1,
            'name': 'Synthetic Grill',
            'city': 'Tustin',
            'count': 5,
            'scope': 'worldwide',
            'label': False,
            'complete': True,
            'basis': 'official_complete_total',
            'url': 'https://example.com/',
            'note': 'Five operating locations is the complete worldwide total.',
        }
        bad = [
            {'url': 'file:///private/tmp/nonpublic.txt'},
            {'url': 'http://localhost/'},
            {'url': 'http://127.0.0.1/'},
            {'url': 'http://10.0.0.1/'},
            {'url': 'http://[::1]/'},
            {'basis': ['anything']},
            {'note': {'yes': True}},
            {'checked_date_utc': 'tomorrow'},
            {'snapshot_text_sha256': 'bad'},
            {'basis': 'rejected_domain_identity'},
            {'basis': 'official_operating_location_list'},
        ]
        for changes in bad:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                ce.reconcile_probe_labels([dict(item)], [dict(audit, **changes)])
        valid = [dict(item)]
        ce.reconcile_probe_labels(valid, [audit])
        self.assertFalse(valid[0]['policy_label'])

    def test_policy_metrics_exclude_unverified_small_counts(self):
        import chain_evaluate as ce

        items = [
            {
                'id': 1,
                'policy_label': True,
                'proxy_label': False,
                'jev_probability': 0.1,
                'gemma_answer': False,
                'gemma_confidence': 1,
            },
            {
                'id': 2,
                'policy_label': None,
                'proxy_label': False,
                'jev_probability': 0.1,
                'gemma_answer': False,
                'gemma_confidence': 1,
            },
        ]
        metrics = ce.comparison_metrics(items, label_key='policy_label')
        self.assertEqual(metrics['gemma']['labeled'], 1)
        self.assertEqual(metrics['gemma']['recall'], 0)
        self.assertEqual(metrics['gemma']['negative_labels'], 0)


class WebsiteTraversalTest(unittest.TestCase):
    def test_location_links_in_navigation_are_collected_before_cleaning_text(self):
        import chain_sources as src
        import tempfile
        from unittest.mock import patch

        class Response:
            is_redirect = False
            headers = {'Content-Type': 'text/html'}

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def raise_for_status(self):
                pass

            def iter_content(self, size):
                yield b'<nav><a href="/locations/">Locations</a><a href="/our-cafes/">Our Cafes</a><a href="/stores/">Stores</a></nav><main>Synthetic Grill</main><footer>Copyright Synthetic Grill</footer>'

        with (
            tempfile.TemporaryDirectory() as folder,
            patch.object(src, 'public_url'),
            patch.object(src.requests, 'get', return_value=Response()),
        ):
            result = src.website_text('https://example.com/', Path(folder))
        self.assertIn('https://example.com/locations/', result['links'])
        self.assertIn('https://example.com/our-cafes/', result['links'])
        self.assertIn('https://example.com/stores/', result['links'])
        self.assertIn('Copyright Synthetic Grill', result['text'])


if __name__ == '__main__':
    unittest.main()
