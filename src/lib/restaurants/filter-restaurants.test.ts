import { describe, expect, it } from 'vitest';
import type { ListMention } from './types';
import { makeRestaurant } from './test-utils';
import { countEndorsements, createSliceCache, sliceRestaurantMentions } from './filter-restaurants';

const mentions: ListMention[] = [
	{ thread_id: 't1', author: 'alice', score: 10, role: 'primary', comment_date: '2024-01-01' },
	{ thread_id: 't1', author: 'bob', score: 5, role: 'endorsement', comment_date: '2024-02-01' }
];

describe('filter-restaurants', () => {
	it('counts endorsements', () => {
		expect(countEndorsements(mentions)).toBe(1);
	});

	it('reuses cached restaurant objects for identical slices', () => {
		const base = makeRestaurant({ mentions });
		const cache = createSliceCache();
		const first = sliceRestaurantMentions(base, mentions, cache, 'slug|sub:r/foo');
		const second = sliceRestaurantMentions(base, mentions, cache, 'slug|sub:r/foo');
		expect(first).not.toBeNull();
		expect(second).toBe(first);
	});
});
