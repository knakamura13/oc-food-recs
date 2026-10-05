import { describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/db', () => ({ db: { execute } }));
import { presentPublicRestaurant } from './public-restaurant';

describe('curated public restaurant projection', () => {
	it('preserves counted people, sources, score and freshness while preventing indexing', () => {
		const mention = { comment_id: 'one', thread_id: 'test-thread', author: 'alice', body: 'A good source with enough words '.repeat(10), score: 10, co_mentions: 1, body_restaurants: 1, role: 'primary', classification: null, permalink: null, comment_date: '2025-01-01T00:00:00Z' };
		const row = { name: 'A’s', slug: 'ordinary', location: 'Wrong', street: 'Wrong', cuisine: 'Burgers', lat: 33, lng: -117, mentions: [mention, { ...mention, comment_id: 'two', author: 'bob', body: 'Another distinct source full of different words '.repeat(10) }] };
		const ordinary = presentPublicRestaurant(row as never);
		const scoped = presentPublicRestaurant({ ...row, slug: 'a-s-burgers' } as never);
		expect(ordinary.indexable).toBe(true);
		expect(scoped).toMatchObject({ indexable: false, location: null, street: null, lat: null, lng: null, location_scope: 'multiple_locations', mention_count: 2, thread_count: 1, people_count: 2 });
		for (const field of ['aggregate_score', 'lastmod', 'mentions', 'unique_word_count'] as const) expect(scoped[field]).toEqual(ordinary[field]);
	});
});

it('masks the streamed home dataset before serialization', async () => {
	execute.mockResolvedValue({ rows: [] });
	execute.mockResolvedValueOnce({ rows: [{ name: 'A’s', slug: 'a-s-burgers', location: 'Wrong', street: 'Wrong', cuisine: 'Burgers', lat: 33, lng: -117, aggregate_score: 7, mention_count: 1, mentions: [], source_threads: ['test-thread'] }] });
	const { load } = await import('../../../routes/+page.server');
	const result = await load({ url: new URL('https://example.test/'), setHeaders: vi.fn() } as never);
	const home = await result!.home;
	expect(home.dataset.restaurants[0]).toMatchObject({ location: null, street: null, lat: null, lng: null, location_scope: 'multiple_locations', aggregate_score: 7, mention_count: 1 });
	expect(home.dataset.restaurants[0].reviewed_locations).toHaveLength(2);
});
