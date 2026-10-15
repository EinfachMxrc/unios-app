# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fixed expected-source retrieval metrics; no LLM judge or personal corpus."""

from statistics import median
from time import perf_counter

from app.corpus.contracts import Search


def evaluate(service, cases, compare_warm=False):
    ranks, durations, sizes, misses, stale, wrong = [], [], [], [], 0, 0
    warm_durations, tool_calls = [], 0
    for case in cases:
        if compare_warm:
            service.cache.clear()
        start = perf_counter()
        request = Search(query=case['query'], scope=case.get('scope', {}), top_k=20, budget=64000)
        payload = service.search(request)
        tool_calls += 1
        durations.append((perf_counter() - start) * 1000)
        if compare_warm:
            start = perf_counter()
            repeated = service.search(request)
            tool_calls += 1
            warm_durations.append((perf_counter() - start) * 1000)
            if repeated != payload:
                raise ValueError('Warm retrieval differs from cold retrieval')
        sizes.append(payload['budget']['used'])
        sources = list(dict.fromkeys(hit['entity_ref'] for hit in payload['results']))
        rank = next((index + 1 for index, ref in enumerate(sources) if ref in case['expected']), None)
        ranks.append(rank)
        if rank is None:
            misses.append(case['id'])
        stale += sum(hit['version'] != case.get('version', '1') for hit in payload['results'])
        wrong += sum(ref in case.get('forbidden', []) for ref in sources)
        wrong += sum(hit['course_id'] in case.get('forbidden_courses', []) for hit in payload['results'])
    n = len(ranks)
    ordered = sorted(durations)
    result = {'cases': n, 'recall_at_5': sum(rank is not None and rank <= 5 for rank in ranks) / n,
            'recall_at_20': sum(rank is not None for rank in ranks) / n,
            'mrr': sum(1 / rank for rank in ranks if rank is not None) / n,
            'forbidden_sources': wrong, 'stale_versions': stale, 'misses': misses,
            'latency_ms_median': median(durations), 'latency_ms_p95': ordered[int((n - 1) * .95)],
            'payload_bytes_median': median(sizes), 'token_measurement': 'not_model_specific; canonical UTF-8 bytes',
            'tool_calls': tool_calls}
    if warm_durations:
        result['warm_latency_ms_median'] = median(warm_durations)
        result['warm_latency_ms_p95'] = sorted(warm_durations)[int((n - 1) * .95)]
    return result
