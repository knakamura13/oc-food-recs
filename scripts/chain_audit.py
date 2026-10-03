#!/usr/bin/env python3
"""Replay checked public-source audits against saved results, without inference or DB access.

Audit files are trusted reviewer inputs, not model predictions. A confirmed lower
bound repairs missing source retrieval but does not measure automated recall.
"""

import argparse
import copy
import hashlib
import json
from pathlib import Path

from chain_evaluate import validate_probe_audit
from chain_scorer import decide, name_tokens, summarize
from chain_sources import write_json


def apply_audits(rows, audits):
    by_id = {r['id']: r for r in rows}
    if len(by_id) != len(rows):
        raise ValueError('Duplicate restaurant IDs')
    checked = {}
    for audit in audits:
        identifier = audit.get('id')
        row = by_id.get(identifier)
        if type(identifier) is not int or row is None or identifier in checked:
            raise ValueError('Duplicate or unknown restaurant audit')
        if not all(isinstance(audit.get(k), str) for k in ('name', 'city')):
            raise ValueError('Audit requires restaurant name and city')
        if name_tokens(audit['name']) != name_tokens(row['name']) or name_tokens(
            audit['city']
        ) != name_tokens(row.get('location') or ''):
            raise ValueError('Audit identity does not match saved restaurant')
        validate_probe_audit(audit)
        if audit.get('label') is None and (
            audit.get('count') is not None or audit.get('complete') is True
        ):
            raise ValueError('Unresolved audits cannot assert totals')
        checked[identifier] = audit
    result = copy.deepcopy(rows)
    for row in result:
        row['original_decision'] = row['decision']
        row['automatic_exclusion_eligible'] = False
        audit = checked.get(row['id'])
        if audit is None:
            continue
        row['source_audit'] = copy.deepcopy(audit)
        # Retain the rejected evidence for inspection. A reviewed lower bound
        # replaces unverified positives, but must not erase a complete negative
        # that could expose a policy conflict.
        for evidence in row['evidence']:
            count = evidence.get('count')
            if type(count) is int and count >= 6:
                evidence['supported'] = False
                evidence['audit_rejection'] = audit['note']
        if audit.get('label') is not None:
            row['evidence'].append({
                'kind': 'S5', 'count': audit['count'], 'scope': 'worldwide',
                'complete': audit.get('complete') is True,
                'identity_verified': True, 'supported': True,
                'official_source': True, 'url': audit['url'],
                'reviewed_source': True, 'audit_basis': audit['basis'],
            })
        row.update(decide(row['evidence']))
        row['automatic_exclusion_eligible'] = (
            audit.get('label') is True and row['decision'] == 'chain'
            and row['status'] == 'active'
        )
    return result


def replay(results_path, audits_path, output):
    results_path, audits_path, output = map(Path, (results_path, audits_path, output))
    if output.resolve() in {results_path.parent.resolve(), audits_path.parent.resolve()}:
        raise ValueError('Use a separate output directory to preserve source artifacts')
    source = results_path.read_bytes()
    audit_source = audits_path.read_bytes()
    rows = json.loads(source)
    audits = json.loads(audit_source)
    reviewed = apply_audits(rows, audits)
    expected = {r['id'] for r in rows if r.get('exclusion_reason') == 'chain'}
    def populations(items):
        return {
            'active': summarize([r for r in items if r['status'] == 'active']),
            'excluded_chains': summarize([r for r in items if r['id'] in expected], expected),
        }
    report = {
        'method': 'reviewed_public_source_replay',
        'model_calls': 0, 'database_access': False,
        'input_sha256': hashlib.sha256(source).hexdigest(),
        'audits_sha256': hashlib.sha256(audit_source).hexdigest(),
        'original': populations(rows), 'audit_assisted': populations(reviewed),
        'audited_rows': len(audits),
        'automatic_exclusion_eligible_ids': [r['id'] for r in reviewed if r['automatic_exclusion_eligible']],
        'changes': [{'id': r['id'], 'name': r['name'], 'before': r['original_decision'],
            'after': r['decision']} for r in reviewed if r['original_decision'] != r['decision']],
        'unreviewed_chain_ids': [r['id'] for r in reviewed if r['status'] == 'active'
            and r['decision'] == 'chain' and not r['automatic_exclusion_eligible']],
    }
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / 'results.json', reviewed)
    write_json(output / 'audits.json', audits)
    write_json(output / 'summary.json', report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', required=True)
    parser.add_argument('--audits', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(replay(args.results, args.audits, args.output), indent=2))


if __name__ == '__main__':
    main()
