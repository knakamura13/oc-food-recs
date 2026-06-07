import { describe, expect, it } from 'vitest';
import {
	findFilterMatch,
	normalizeCity,
	normalizeCuisine,
	REPEAT_AUTHOR_DECAY,
	weightedAggregates
} from './stores.svelte';
import type { ListMention } from './types';

describe('stores utilities', () => {
	describe('normalizeCuisine', () => {
		it('maps known aliases to canonical cuisine names', () => {
			expect(normalizeCuisine('KBBQ')).toBe('Korean');
			expect(normalizeCuisine('Ramen')).toBe('Japanese');
		});

		it('title-cases unknown cuisines and handles null', () => {
			expect(normalizeCuisine('ethiopian')).toBe('Ethiopian');
			expect(normalizeCuisine(null)).toBe('Unknown');
		});
	});

	describe('normalizeCity', () => {
		it('normalizes multi-city and alias locations', () => {
			expect(normalizeCity('Anaheim Hills')).toBe('Anaheim');
			expect(normalizeCity('Newport')).toBe('Newport Beach');
		});

		it('returns null for missing locations', () => {
			expect(normalizeCity(null)).toBeNull();
		});
	});

	describe('weightedAggregates', () => {
		it('decays repeat mentions from the same author', () => {
			const mentions: ListMention[] = [
				{ author: 'alice', score: 10, comment_date: null, thread_id: 't1', role: 'primary' },
				{ author: 'alice', score: 8, comment_date: null, thread_id: 't1', role: 'endorsement' }
			];

			const result = weightedAggregates(mentions);
			const expectedScore = Math.round(10 + 8 * REPEAT_AUTHOR_DECAY);

			expect(result.aggregate_score).toBe(expectedScore);
			expect(result.mention_count).toBe(1);
		});

		it('counts each anonymous mention as a distinct voice', () => {
			const mentions: ListMention[] = [
				{ author: '[deleted]', score: 5, comment_date: null, thread_id: 't1', role: 'primary' },
				{ author: '[deleted]', score: 3, comment_date: null, thread_id: 't1', role: 'endorsement' }
			];

			const result = weightedAggregates(mentions);

			expect(result.aggregate_score).toBe(8);
			expect(result.mention_count).toBe(2);
		});
	});

	describe('findFilterMatch', () => {
		const cuisineNames = ['Mexican', 'Japanese'];
		const cityNames = ['Irvine', 'Santa Ana'];

		it('matches cuisine synonyms', () => {
			expect(findFilterMatch('tacos', cuisineNames, cityNames)).toEqual({
				type: 'cuisine',
				value: 'Mexican'
			});
		});

		it('matches city names directly', () => {
			expect(findFilterMatch('irvine', cuisineNames, cityNames)).toEqual({
				type: 'city',
				value: 'Irvine'
			});
		});
	});
});
