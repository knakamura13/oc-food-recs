import { describe, expect, it } from 'vitest';
import { makeRestaurant } from './test-utils';
import { decodeDataset, decodeRestaurants, encodeRestaurants } from './wire';
import type { ListMention } from './types';

const mention = (over: Partial<ListMention> = {}): ListMention => ({
	thread_id: 't3_a',
	author: 'alice',
	score: 12,
	role: 'primary',
	comment_date: '2025-06-01T12:00:00+00:00',
	credit: 1 / 3,
	...over
});

describe('compact wire format', () => {
	const restaurants = [
		makeRestaurant({
			slug: 'a',
			name: 'A',
			endorsement_count: 1,
			mentions: [mention(), mention({ author: 'bob', role: 'endorsement', comment_date: null, thread_id: 't3_b' })],
			source_threads: ['t3_a', 't3_b'],
			top_comment_snippet: 'A is great.'
		}),
		makeRestaurant({ slug: 'b', name: 'B', chain_confidence: 'likely_chain', lat: null, lng: null, location: null, street: '1 Main St' }),
		makeRestaurant({
			slug: 'c', name: 'C', chain_confidence: undefined,
			location_scope: 'multiple_locations',
			reviewed_locations: [{ city: 'Irvine', street: '2 Oak' }],
			mentions: [mention({ author: 'alice', thread_id: 't3_b' })],
			source_threads: ['t3_b']
		})
	];

	it('round-trips every field the explorer reads', () => {
		const decoded = decodeRestaurants(encodeRestaurants(restaurants));
		expect(decoded).toEqual(restaurants);
	});

	it('shares thread and author strings instead of repeating them', () => {
		const wire = encodeRestaurants(restaurants);
		expect(wire.t).toEqual(['t3_a', 't3_b', 'thread-1']);
		expect(wire.a).toEqual(['alice', 'bob']);
	});

	it('is much smaller than the object form for a realistic corpus', () => {
		const corpus = Array.from({ length: 500 }, (_, i) => makeRestaurant({
			slug: `r-${i}`, name: `Restaurant ${i}`, endorsement_count: 2,
			mentions: [mention({ author: `u${i % 40}` }), mention({ role: 'endorsement', author: `u${(i + 1) % 40}` })],
			source_threads: ['t3_a']
		}));
		expect(JSON.stringify(encodeRestaurants(corpus)).length).toBeLessThan(JSON.stringify(corpus).length * 0.55);
	});

	it('passes already-decoded data through unchanged', () => {
		const dataset = { restaurants, meta: { source_threads: [], total_comments_processed: 0, newest_comment_date: null } };
		expect(decodeDataset(dataset)).toBe(dataset);
	});
});
