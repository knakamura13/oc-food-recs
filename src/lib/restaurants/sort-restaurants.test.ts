import { describe, expect, it } from 'vitest';
import { makeRestaurant } from './test-utils';
import { sortRestaurants } from './sort-restaurants';

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const mention = (date: string | null) => ({ thread_id: 't', author: 'a', score: 1, role: 'primary' as const, comment_date: date, credit: 1 });

const rows = [
	makeRestaurant({ name: 'Bravo', aggregate_score: 20, lat: 33.70, lng: -117.80, mentions: [mention('2024-01-01T00:00:00Z')] }),
	makeRestaurant({ name: 'alpha', aggregate_score: 10, lat: null, lng: null, mentions: [] }),
	makeRestaurant({ name: 'Charlie', aggregate_score: 20, lat: 33.90, lng: -117.80, mentions: [mention('2025-06-01T00:00:00Z')] })
];

describe('sortRestaurants', () => {
	it('sorts by score, keeping incoming order for ties', () => {
		expect(names(sortRestaurants(rows, 'score', 'desc'))).toEqual(['Bravo', 'Charlie', 'alpha']);
		expect(names(sortRestaurants(rows, 'score', 'asc'))).toEqual(['alpha', 'Bravo', 'Charlie']);
	});

	it('sorts names case-insensitively', () => {
		expect(names(sortRestaurants(rows, 'name', 'asc'))).toEqual(['alpha', 'Bravo', 'Charlie']);
		expect(names(sortRestaurants(rows, 'name', 'desc'))).toEqual(['Charlie', 'Bravo', 'alpha']);
	});

	it('puts rows with no dated mention last in either direction', () => {
		expect(names(sortRestaurants(rows, 'recency', 'desc'))).toEqual(['Charlie', 'Bravo', 'alpha']);
		expect(names(sortRestaurants(rows, 'recency', 'asc'))).toEqual(['Bravo', 'Charlie', 'alpha']);
	});

	it('sorts by distance and puts unlocated rows last in either direction', () => {
		const origin = { lat: 33.69, lng: -117.80 };
		expect(names(sortRestaurants(rows, 'distance', 'asc', origin))).toEqual(['Bravo', 'Charlie', 'alpha']);
		expect(names(sortRestaurants(rows, 'distance', 'desc', origin))).toEqual(['Charlie', 'Bravo', 'alpha']);
		expect(names(sortRestaurants(rows, 'distance', 'asc', null))).toEqual(['Bravo', 'alpha', 'Charlie']);
	});

	it('treats relevance as incoming order, best first when descending', () => {
		expect(names(sortRestaurants(rows, 'relevance', 'desc'))).toEqual(['Bravo', 'alpha', 'Charlie']);
		expect(names(sortRestaurants(rows, 'relevance', 'asc'))).toEqual(['Charlie', 'alpha', 'Bravo']);
	});

	it('does not mutate its input', () => {
		const copy = [...rows];
		sortRestaurants(rows, 'name', 'asc');
		expect(rows).toEqual(copy);
	});

	it('sorts thousands of rows quickly', () => {
		const many = Array.from({ length: 5000 }, (_, i) => makeRestaurant({ name: `R${i}`, slug: `r${i}`, aggregate_score: (i * 7919) % 1000, lat: 33.5 + (i % 100) / 100, lng: -117.9 }));
		const start = performance.now();
		sortRestaurants(many, 'distance', 'asc', { lat: 33.7, lng: -117.8 });
		sortRestaurants(many, 'name', 'asc');
		expect(performance.now() - start).toBeLessThan(500);
	});
});
