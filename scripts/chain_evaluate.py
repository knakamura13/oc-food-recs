#!/usr/bin/env python3
"""Run and report issue #200's read-only cascade on an explicitly named scratch restore."""

from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

from chain_models import EVIDENCE_QUESTIONS, Models, noul, parse_gemma, probability
from chain_scorer import (
    brand_matches,
    decide,
    distinct_locations,
    name_tokens,
    summarize,
    website_domain,
)
from chain_sources import (
    atp_places,
    download_nsi,
    explicit_location_counts,
    global_places,
    local_places,
    location_count_candidates,
    match_places,
    model_evidence,
    place_matches,
    snapshot,
    website_text,
    write_json,
)


def probe_label(count):
    return None if count is None else count >= 6


def same_family(a, b):
    x, y = name_tokens(a), name_tokens(b)
    return x == y or min(len(x), len(y)) >= 2 and (x[: len(y)] == y or y[: len(x)] == x)


def count_evidence(kind, places, **extra):
    return {
        'kind': kind,
        'count': distinct_locations([(p['lat'], p['lon']) for p in places]),
        'scope': 'worldwide',
        'identity_verified': True,
        'complete': False,
        'place_ids': [p['id'] for p in places],
        **extra,
    }


def deterministic_rows(restaurants, matches, global_rows, nsi, atp):
    domains = defaultdict(list)
    names = defaultdict(list)
    phones = defaultdict(list)
    atp_brands = defaultdict(list)
    for p in global_rows:
        names[name_tokens(p['name'])].append(p)
        for domain in {website_domain(w) for w in p.get('websites') or []} - {None}:
            domains[domain].append(p)
        for phone in p.get('phones') or []:
            phones[phone].append(p)
    for p in atp['places']:
        atp_brands[p['brand']].append(p)
    brand_index = defaultdict(list)
    for b in nsi['brands'] + [{'name': b, 'source': 'ATP'} for b in atp['brands']]:
        tokens = name_tokens(b['name'])
        if tokens:
            brand_index[tokens[0]].append(b)
    rows = []
    for r in restaurants:
        if r['status'] != 'active' and r.get('exclusion_reason') != 'chain':
            continue
        ev = []
        matched = matches.get(str(r['id']), matches.get(r['id'], []))
        tokens = name_tokens(r['name'])
        brands = (
            [b for b in brand_index[tokens[0]] if brand_matches(r['name'], b['name'])]
            if tokens
            else []
        )
        for b in brands:
            ev.append({'kind': 'S3', 'brand': b['name'], 'source': b['source']})
        local_domains = {
            website_domain(w) for p in matched for w in p.get('websites') or []
        } - {None}
        family_names = [r['name']] + [p['name'] for p in matched]
        for domain in sorted(local_domains):
            pp = [
                p
                for p in domains[domain]
                if any(same_family(p['name'], n) for n in family_names)
            ]
            if pp:
                ev.append(count_evidence('S1', pp, domain=domain, source='Overture'))
        local_phones = {phone for p in matched for phone in p.get('phones') or []}
        for phone in sorted(local_phones):
            pp = [
                p
                for p in phones[phone]
                if any(same_family(p['name'], n) for n in family_names)
            ]
            if pp:
                ev.append(count_evidence('S2', pp, phone=phone, source='Overture'))
        for b in brands:
            if b['source'] != 'ATP':
                continue
            pp = atp_brands[b['name']]
            # A locator brand alone is weak; corroborate identity with an Overture
            # local match/domain or the same NSI brand before using the global count.
            has_local = any(same_family(p['name'], r['name']) for p in matched)
            has_nsi = any(
                x['source'] == 'NSI'
                and name_tokens(x['name']) == name_tokens(b['name'])
                for x in brands
            )
            has_atp_local = any(place_matches(r, dict(p, name=p['brand'])) for p in pp)
            if has_atp_local and (has_local or has_nsi):
                ev.append(
                    count_evidence(
                        'S3+S1',
                        pp,
                        brand=b['name'],
                        source='ATP',
                        corroboration='Overture identity' if has_local else 'NSI',
                    )
                )
        exact = names[tokens]
        row = {
            **r,
            'evidence': ev,
            'overture_matches': matched,
            'same_name_count': distinct_locations(
                [(p['lat'], p['lon']) for p in exact]
            ),
            'same_name_place_ids': [p['id'] for p in exact],
        }
        row.update(decide(ev))
        rows.append(row)
    return rows


def fetch_websites(rows, cache, output, workers):
    path = output / 'websites.json'
    if path.exists():
        return json.loads(path.read_text())
    urls = sorted(
        {
            w
            for r in rows
            for p in r['overture_matches']
            for w in p.get('websites') or []
            if website_domain(w)
        }
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        home = list(pool.map(lambda u: website_text(u, cache), urls))
    links = sorted({l for v in home for l in v.get('links', [])[:3]} - set(urls))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        detail = list(pool.map(lambda u: website_text(u, cache), links))
    result = home + detail
    write_json(path, result)
    print(
        'websites', len(result), 'errors', sum('error' in v for v in result), flush=True
    )
    return result


def jev_sources(rows, mentions, websites, models, output, workers):
    by_restaurant = defaultdict(list)
    by_domain = defaultdict(list)
    for m in mentions:
        by_restaurant[m['restaurant_id']].append(m)
    for w in websites:
        if w.get('text'):
            by_domain[website_domain(w['url'])].append(w)
    tasks = []
    contexts = {}
    for r in rows:
        # Each original mention is judged in the context of this named restaurant.
        sources = [
            {
                'kind': 'S4',
                'id': m['id'],
                'text': m['body'],
                'url': m['permalink'],
                'thread_title': m['thread_title'],
            }
            for m in by_restaurant[r['id']]
        ]
        ds = {
            website_domain(w)
            for p in r['overture_matches']
            for w in p.get('websites') or []
        } - {None}
        sources += [
            {
                'kind': 'S5',
                'id': w['requested_url'],
                'text': w['text'],
                'url': w['url'],
                'truncated': w['truncated'],
            }
            for d in sorted(ds)
            for w in by_domain[d]
        ]
        contexts[r['id']] = sources
        for s in sources:
            tasks.append(
                {
                    'restaurant_id': r['id'],
                    'source': s,
                    'name': r['name'],
                    'city': r['location'],
                    'local_matches': r['overture_matches'],
                }
            )

    def call(task):
        s = task['source']
        state = {
            'restaurant': {
                'name': task['name'],
                'city': task['city'],
                'local_matches': [
                    {
                        'name': p.get('name'),
                        'city': p.get('city'),
                        'websites': p.get('websites'),
                    }
                    for p in task['local_matches']
                ],
            },
            'source': {
                'text': s['text'],
                'thread_title': s.get('thread_title'),
                'url': s.get('url'),
            },
        }
        result = models.jev(state, EVIDENCE_QUESTIONS)
        return {'restaurant_id': task['restaurant_id'], 'source': s, 'result': result}

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for index, result in enumerate(pool.map(call, tasks)):
            results.append(result)
            if (index + 1) % 100 == 0:
                print('Jev source', index + 1, '/', len(tasks), flush=True)
    for result in results:
        s = result['source']
        s['official_source'] = False
        if result['result'].get('error'):
            continue
        r = next(r for r in rows if r['id'] == result['restaurant_id'])
        s = result['source']
        body = result['result']['response']
        probs = {q: probability(body, q) for q in EVIDENCE_QUESTIONS}
        official_probability = probs['official_source']
        s['official_source_probability'] = official_probability
        s['official_source'] = (
            s['kind'] == 'S5'
            and website_domain(s.get('url') or '') is not None
            and official_probability is not None
            and official_probability >= 0.95
        )
        record = {
            'kind': s['kind'],
            'url': s.get('url'),
            'source_id': s['id'],
            'probabilities': probs,
            'official_source': s['official_source'],
        }
        candidates = location_count_candidates(s['text'])
        counts = []
        # A whole-page yes/no cannot attribute every numeric phrase on that page.
        # Validate the actual count and quoted context before selecting it.
        if candidates and any(
            probs.get(k) is not None and probs[k] >= 0.95
            for k in ['six_plus', 'complete_small_total']
        ):
            selected = {f'count_{i}': c for i, c in enumerate(candidates[:20])}
            questions = {
                key: noul(
                    f'Does `candidates.{key}.quote`, in the context of `source.text`, explicitly give `candidates.{key}.count` as a CURRENT operating restaurant-location count for `restaurant.name` near `restaurant.city`? Reject postal codes, years, menu prices, unrelated businesses, historical or closed sites and counts of planned locations. A count of six or more in any region is a valid worldwide lower bound; a smaller count must be the complete worldwide total.'
                )
                for key in selected
            }
            validation = models.jev(
                {
                    'restaurant': {'name': r['name'], 'city': r['location']},
                    'source': {'text': s['text'], 'url': s.get('url')},
                    'candidates': selected,
                },
                questions,
            )
            result['count_validation'] = validation
            if not validation.get('error'):
                validated = [
                    c
                    for key, c in selected.items()
                    if (probability(validation['response'], key) or 0) >= 0.95
                ]
                counts = [c['count'] for c in validated]
                record['validated_counts'] = validated
        if (
            probs['six_plus'] is not None
            and probs['six_plus'] >= 0.95
            and any(n >= 6 for n in counts)
        ):
            record.update(
                {
                    'count': max(n for n in counts if n >= 6),
                    'scope': 'worldwide',
                    'identity_verified': True,
                    'supported': True,
                    'complete': False,
                }
            )
        elif (
            s['kind'] == 'S5'
            and s['official_source']
            and probs['complete_small_total'] is not None
            and probs['complete_small_total'] >= 0.95
            and len(set(counts)) == 1
            and counts[0] <= 5
            and not s.get('truncated')
        ):
            record.update(
                {
                    'count': counts[0],
                    'scope': 'worldwide',
                    'identity_verified': True,
                    'supported': True,
                    'complete': True,
                }
            )
        r['evidence'].append(record)
    write_json(output / 'jev-sources.json', results)
    for r in rows:
        r.update(decide(r['evidence']))
    return contexts


def jev_generic_names(rows, global_rows, models):
    for r in rows:
        if r['decision'] != 'unknown' or r['same_name_count'] < 6:
            continue
        question = {
            'non_generic': noul(
                'Does `restaurant.name` identify a distinctive specific restaurant brand, rather than a generic or commonly reused business name? Consider only naming specificity; do not infer location counts or ownership.'
            )
        }
        result = models.jev({'restaurant': {'name': r['name']}}, question)
        p = (
            None
            if result.get('error')
            else probability(result['response'], 'non_generic')
        )
        r['generic_name_probability'] = p
        if p is not None and p >= 0.95:
            pp = [
                p
                for p in global_rows
                if name_tokens(p['name']) == name_tokens(r['name'])
            ]
            r['evidence'].append(
                count_evidence(
                    'S2',
                    pp,
                    corroboration='Jev distinctive name',
                    non_generic_probability=p,
                )
            )
            r.update(decide(r['evidence']))


def gemma_unresolved(rows, contexts, models, output):
    results = []
    unresolved = [r for r in rows if r['decision'] == 'unknown']
    for index, r in enumerate(unresolved):
        sources = contexts.get(r['id'], [])
        # Keep all sources in the artifact. A bounded prompt is an explicit subset;
        # truncation may reduce recall but must never imply an exhaustive total.
        chosen = sorted(
            sources,
            key=lambda s: bool(explicit_location_counts(s['text'])),
            reverse=True,
        )[:8]
        texts = [s['text'][:5000] for s in chosen]
        budget = []
        chars = 0
        for text in texts:
            if chars + len(text) > 20000:
                break
            budget.append(text)
            chars += len(text)
        bundle = {
            'restaurant': {'name': r['name'], 'city': r['location']},
            'observed_evidence': [
                {k: v for k, v in e.items() if k not in {'place_ids', 'quote'}}
                for e in r['evidence']
                if e.get('count') is not None or e['kind'] == 'S3'
            ][:12],
            'sources': [{'index': i, 'text': t} for i, t in enumerate(budget)],
        }
        prompt = (
            'Judge only the supplied evidence for this named business. Six or more operating locations anywhere means chain. Five or fewer means independent only when an official source explicitly gives a complete worldwide current total. Family ownership, an incomplete directory and missing evidence do not prove independent. Reports are not evidence. If insufficient or conflicting, abstain. Return JSON {"decision":"chain|independent|unknown","count":integer or null,"complete":boolean,"identity_verified":boolean,"source":source index or null,"quote":"exact source excerpt containing the location count"}.\n'
            + json.dumps(bundle, ensure_ascii=False)
        )
        result = models.gemma(prompt)
        rec = {
            'restaurant_id': r['id'],
            'source_count': len(sources),
            'prompt_source_count': len(budget),
            'result': result,
        }
        if not result.get('error'):
            parsed = parse_gemma(result['response'])
            rec['parsed'] = parsed
            evidence = model_evidence('S6', parsed, budget)
            # Completeness additionally requires an official website, never a Reddit claim.
            for e in evidence:
                source = chosen[e['source']]
                e['complete'] = (
                    e['complete']
                    and source['kind'] == 'S5'
                    and source.get('official_source') is True
                    and not source.get('truncated')
                    and len(source['text']) <= 5000
                )
                e['url'] = chosen[e['source']].get('url')
                e['official_source'] = source.get('official_source') is True
            r['evidence'] += evidence
            r.update(decide(r['evidence']))
        results.append(rec)
        write_json(output / 'gemma-results.json', results)
        write_json(output / 'rows-in-progress.json', rows)
        print(
            'Gemma evidence',
            index + 1,
            '/',
            len(unresolved),
            r['id'],
            r['decision'],
            result['seconds'],
            result.get('error', ''),
            flush=True,
        )
    return results


def run(args):
    output = Path(args.output)
    cache = Path(args.cache)
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    before = snapshot(args.scratch_dsn)
    write_json(output / 'snapshot.json', before)
    nsi = download_nsi(cache)
    local = local_places(cache)
    matches = match_places(before['restaurants'], local)
    write_json(output / 'matches.json', matches)
    global_rows = global_places(cache, before['restaurants'], matches)
    if not (cache / 'atp.json').exists() and not args.atp_zip:
        raise ValueError('Supply --atp-zip from the pinned public ATP run')
    atp = atp_places(Path(args.atp_zip or '.'), cache, before['restaurants'])
    rows = deterministic_rows(before['restaurants'], matches, global_rows, nsi, atp)
    write_json(output / 'deterministic-rows.json', rows)
    print('deterministic', summarize(rows), flush=True)
    models = Models(output / 'models')
    websites = fetch_websites(rows, cache, output, args.workers)
    contexts = jev_sources(
        rows, before['mentions'], websites, models, output, args.workers
    )
    jev_generic_names(rows, global_rows, models)
    write_json(output / 'pre-gemma-rows.json', rows)
    write_json(output / 'contexts.json', contexts)
    if args.prepare_only:
        after = snapshot(args.scratch_dsn)
        if before['fingerprint'] != after['fingerprint']:
            raise RuntimeError('Scratch database changed during preparation')
        write_json(
            output / 'preparation-summary.json',
            {
                'stage': 'prepared',
                'evaluation_complete': False,
                'remaining': 'Gemma fallback, final comparison, acceptance report',
                'active': summarize([r for r in rows if r['status'] == 'active']),
                'excluded_chains': summarize(
                    [r for r in rows if r['exclusion_reason'] == 'chain'],
                    {r['id'] for r in rows if r['exclusion_reason'] == 'chain'},
                ),
                'database_unchanged': True,
                'fingerprint': after['fingerprint'],
            },
        )
        print(
            'Prepared source evidence; Gemma was not called. Evaluation remains incomplete.',
            flush=True,
        )
        return
    gemma_results = gemma_unresolved(rows, contexts, models, output)
    write_json(output / 'results.json', rows)
    with (output / 'results.jsonl').open('w') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    after = snapshot(args.scratch_dsn)
    if before['fingerprint'] != after['fingerprint']:
        raise RuntimeError('Scratch database changed during evaluation')
    active = [r for r in rows if r['status'] == 'active']
    excluded = [r for r in rows if r['exclusion_reason'] == 'chain']
    report = {
        'active': summarize(active),
        'excluded_chains': summarize(excluded, {r['id'] for r in excluded}),
        'database_unchanged': True,
        'fingerprint': after['fingerprint'],
        'gemma_errors': [
            r['restaurant_id'] for r in gemma_results if r['result'].get('error')
        ],
        'website_errors': sum('error' in w for w in websites),
        'atp_parse_errors': atp['parse_errors'],
    }
    comparison = comparison_report(
        rows, models, output, Path(__file__).with_name('chain_probe_set.json')
    )
    report['comparison_metrics'] = comparison['metrics']
    report['comparison_unlabeled'] = comparison['unlabeled_ids']
    write_json(output / 'summary.json', report)
    print(json.dumps(report, indent=2), flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        '--scratch-dsn',
        required=True,
        help='Explicit loopback *_scratch database; DATABASE_URL is ignored',
    )
    p.add_argument('--cache', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--atp-zip')
    p.add_argument('--workers', type=int, default=8)
    p.add_argument(
        '--prepare-only',
        action='store_true',
        help='Prepare deterministic and Jev evidence, verify DB unchanged, and stop before any Gemma call',
    )
    args = p.parse_args()
    if not 1 <= args.workers <= 16:
        p.error('--workers must be between 1 and 16')
    run(args)


def comparison_report(rows, models, output, probe_path):
    from chain_models import probe_question

    probes = json.loads(Path(probe_path).read_text())
    results = []
    for item in probes:
        candidates = [
            r
            for r in rows
            if name_tokens(r['name']) == name_tokens(item['name'])
            and name_tokens(r['location'] or '') == name_tokens(item['city'])
        ]
        if not candidates:
            candidates = [
                r for r in rows if name_tokens(r['name']) == name_tokens(item['name'])
            ]
        if not candidates:
            candidates = [
                r
                for r in rows
                if same_family(r['name'], item['name'])
                and name_tokens(r['location'] or '') == name_tokens(item['city'])
            ]
        counts = [
            e['count']
            for r in candidates
            for e in r['evidence']
            if e.get('source') == 'Overture' and e.get('count')
        ]
        count = max(counts) if counts else None
        question = probe_question(item['name'], item['city'])
        jr = models.jev(
            {
                'restaurant': {
                    'name': item['name'],
                    'city': item['city'],
                    'region': 'Orange County, California',
                }
            },
            {'six_plus': noul(question)},
        )
        gr = models.gemma(
            question + ' Respond with {"six_plus":true or false,"confidence":0 to 1}.',
            probe=True,
        )
        g = None if gr.get('error') else parse_gemma(gr['response'])
        record = {
            **item,
            'worldwide_observed_count': count,
            'proxy_label': probe_label(count),
            'matched_restaurant_ids': [r['id'] for r in candidates],
            'jev_probability': (
                None if jr.get('error') else probability(jr['response'], 'six_plus')
            ),
            'gemma_answer': None if g is None else g.get('six_plus'),
            'gemma_confidence': None if g is None else g.get('confidence'),
            'jev_error': jr.get('error'),
            'gemma_error': gr.get('error'),
        }
        results.append(record)
    metrics = comparison_metrics(results)
    report = {
        'threshold': 6,
        'scope': 'worldwide',
        'label_type': 'Observed Overture counts; incomplete coverage is not verified independence',
        'items': results,
        'metrics': metrics,
        'unlabeled_ids': [r['id'] for r in results if r['proxy_label'] is None],
        'request_errors': [
            r['id'] for r in results if r['jev_error'] or r['gemma_error']
        ],
    }
    write_json(output / 'comparison.json', report)
    return report


def comparison_metrics(results):
    metrics = {}
    labeled = [r for r in results if r['proxy_label'] is not None]
    for model in ['jev', 'gemma']:

        def answer(r):
            if model == 'jev':
                return (
                    None
                    if r['jev_probability'] is None
                    else r['jev_probability'] >= 0.5
                )
            return r['gemma_answer'] if isinstance(r['gemma_answer'], bool) else None

        answered = [r for r in labeled if answer(r) is not None]
        positives = [r for r in labeled if r['proxy_label']]
        negatives = [r for r in labeled if not r['proxy_label']]
        answered_positives = [r for r in positives if answer(r) is not None]
        tp = sum(answer(r) is True for r in positives)
        correct = sum(answer(r) == r['proxy_label'] for r in answered)
        metrics[model] = {
            'labeled': len(labeled),
            'answered': len(answered),
            'response_coverage': len(answered) / len(labeled) if labeled else None,
            'positive_labels': len(positives),
            'negative_labels': len(negatives),
            'true_positives': tp,
            'false_positives': sum(answer(r) is True for r in negatives),
            'accuracy': correct / len(labeled) if labeled else None,
            'conditional_accuracy': correct / len(answered) if answered else None,
            'recall': tp / len(positives) if positives else None,
            'conditional_recall': (
                tp / len(answered_positives) if answered_positives else None
            ),
            'abstentions': [r['id'] for r in labeled if answer(r) is None],
            'disagreements': [
                r['id'] for r in labeled if answer(r) != r['proxy_label']
            ],
        }
        if model == 'gemma':
            metrics[model]['zero_confidence_false_ids'] = [
                r['id']
                for r in results
                if r['gemma_answer'] is False and r['gemma_confidence'] == 0
            ]
            metrics[model]['zero_confidence_ids'] = [
                r['id'] for r in results if r['gemma_confidence'] == 0
            ]
    return metrics


if __name__ == '__main__':
    main()
