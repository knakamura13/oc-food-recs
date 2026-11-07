import { distanceMiles, type Coordinates } from './distance';
import { latestMentionMs } from './stores.svelte';
import type { Restaurant, SortDirection, SortKey } from './types';

const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * Sort a list of restaurants for display.
 *
 * Each sort key is computed once per row up front, then rows are compared by plain
 * values. (The list previously sorted through a table library whose comparator
 * re-derived each key on every comparison through reactive proxies; in WebKit that
 * made each sort tap take 4-15 seconds on a phone.)
 *
 * Rows with no usable key (no dated mention, no coordinates) sort last in either
 * direction. Ties keep the incoming order, which is search-relevance order while a
 * query is active. `relevance` is that incoming order: descending is best-first.
 */
export function sortRestaurants(
	rows: readonly Restaurant[],
	key: SortKey,
	direction: SortDirection,
	origin: Coordinates | null = null
): Restaurant[] {
	if (key === 'relevance') return direction === 'desc' ? [...rows] : [...rows].reverse();

	const keyed = rows.map((row, index) => ({ row, index, value: sortValue(row, key, origin) }));
	const sign = direction === 'desc' ? -1 : 1;
	keyed.sort((a, b) => {
		const av = a.value;
		const bv = b.value;
		if (av === null || bv === null) {
			if (av === bv) return a.index - b.index;
			return av === null ? 1 : -1;
		}
		const order = typeof av === 'string' ? nameCollator.compare(av, bv as string) : av - (bv as number);
		return order === 0 ? a.index - b.index : order * sign;
	});
	return keyed.map((entry) => entry.row);
}

function sortValue(row: Restaurant, key: SortKey, origin: Coordinates | null): number | string | null {
	switch (key) {
		case 'score': return row.aggregate_score;
		case 'name': return row.name;
		case 'recency': return latestMentionMs(row);
		case 'distance': return distanceMiles(origin, row);
		default: return null;
	}
}
