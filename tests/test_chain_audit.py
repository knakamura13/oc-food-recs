import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from chain_scorer import decide


class RejectedEvidenceTest(unittest.TestCase):
    def test_rejected_directory_identity_cannot_classify_chain(self):
        for kind in ('S1', 'S2'):
            with self.subTest(kind=kind):
                self.assertEqual(decide([{'kind': kind, 'count': 60,
                    'identity_verified': True, 'scope': 'worldwide',
                    'supported': False}])['decision'], 'unknown')


class AuditReplayTest(unittest.TestCase):
    def setUp(self):
        import chain_audit
        self.apply = chain_audit.apply_audits
        self.row = {'id': 7, 'name': 'Example Cafe', 'location': 'Tustin',
            'status': 'active', 'exclusion_reason': None,
            'evidence': [{'kind': 'S1', 'count': 9, 'scope': 'worldwide',
                'identity_verified': True}], 'decision': 'chain', 'signals': ['S1']}
        self.audit = {'id': 7, 'name': 'Example Cafe', 'city': 'Tustin',
            'label': None, 'count': None, 'scope': 'worldwide', 'complete': False,
            'basis': 'regional_total_not_worldwide', 'url': 'https://example.com/locations',
            'note': 'Five listed operating branches cannot substantiate nine directory sites.',
            'checked_date_utc': '2026-10-02'}

    def test_unresolved_audit_removes_candidate_without_asserting_independence(self):
        before = copy.deepcopy(self.row)
        result = self.apply([self.row], [self.audit])[0]
        self.assertEqual(result['decision'], 'unknown')
        self.assertFalse(result['automatic_exclusion_eligible'])
        self.assertEqual(self.row, before)
        self.assertEqual(result['original_decision'], 'chain')

    def test_checked_lower_bound_repairs_missing_retrieval(self):
        self.row['evidence'] = []
        self.row.update(decision='unknown', signals=[])
        self.audit.update(label=True, count=6, basis='official_operating_location_list')
        result = self.apply([self.row], [self.audit])[0]
        self.assertEqual(result['decision'], 'chain')
        self.assertTrue(result['automatic_exclusion_eligible'])
        self.assertEqual(result['signals'], ['S5'])

    def test_unaudited_candidate_remains_ineligible(self):
        result = self.apply([self.row], [])[0]
        self.assertEqual(result['decision'], 'chain')
        self.assertFalse(result['automatic_exclusion_eligible'])

    def test_rejects_bad_identity_duplicate_and_unknown_audits(self):
        for changes in [{'name': 'Different Cafe'}, {'city': 'Irvine'}, {'id': 8}]:
            with self.assertRaises(ValueError):
                self.apply([self.row], [{**self.audit, **changes}])
        with self.assertRaises(ValueError):
            self.apply([self.row], [self.audit, self.audit])

    def test_rejects_unverified_negative_and_private_source(self):
        for changes in [{'label': False, 'count': 5}, {'url': 'http://127.0.0.1/'}]:
            with self.assertRaises(ValueError):
                self.apply([self.row], [{**self.audit, **changes}])

    def test_reviewed_lower_bound_does_not_erase_verified_negative_conflict(self):
        self.row['evidence'].append({'kind': 'S5', 'count': 5, 'scope': 'worldwide',
            'identity_verified': True, 'complete': True, 'supported': True})
        self.audit.update(label=True, count=6, basis='official_operating_location_list')
        result = self.apply([self.row], [self.audit])[0]
        self.assertEqual(result['decision'], 'unknown')
        self.assertTrue(result['conflict'])
        self.assertFalse(result['automatic_exclusion_eligible'])

    def test_replay_preserves_input_bytes_and_separates_reviewed_metrics(self):
        from chain_audit import replay
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            results = root / 'results.json'
            audits = root / 'audits.json'
            results.write_text(json.dumps([self.row]))
            self.audit.update(basis='unverified_operating_total')
            audits.write_text(json.dumps([self.audit]))
            original = results.read_bytes()
            report = replay(results, audits, root / 'reviewed')
            self.assertEqual(results.read_bytes(), original)
            self.assertEqual(report['input_sha256'], hashlib.sha256(original).hexdigest())
            self.assertEqual(report['model_calls'], 0)
            self.assertFalse(report['database_access'])
            self.assertEqual(report['original']['active']['decisions'], {'chain': 1})
            self.assertEqual(report['audit_assisted']['active']['decisions'], {'unknown': 1})
            self.assertEqual(report['automatic_exclusion_eligible_ids'], [])
            self.assertTrue((root / 'reviewed' / 'summary.json').is_file())
            with self.assertRaises(ValueError):
                replay(results, audits, root)
