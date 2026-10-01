import { describe, expect, it } from 'vitest';
import { groupThreadsBySubreddit, percentOf, type AboutThread } from './about-data';
import { scoringExample } from './scoring-model';

const t = (id: string, subreddit: string, commentCount: number): AboutThread => ({
	id,
	title: id,
	url: `https://reddit.com/${id}`,
	subreddit,
	commentCount
});

describe('groupThreadsBySubreddit', () => {
	it('puts the busiest subreddit first and sorts threads by comment count', () => {
		const groups = groupThreadsBySubreddit([
			t('a', 'food', 5),
			t('b', 'orangecounty', 10),
			t('c', 'orangecounty', 90),
			t('d', 'irvine', 1)
		]);
		expect(groups.map((g) => g.subreddit)).toEqual(['orangecounty', 'food', 'irvine']);
		expect(groups[0].threads.map((x) => x.id)).toEqual(['c', 'b']);
	});
});

describe('percentOf', () => {
	it('rounds and survives an empty whole', () => {
		expect(percentOf(264, 1148)).toBe(23);
		expect(percentOf(0, 0)).toBe(0);
	});
});

describe('scoringExample', () => {
	it('shows the half-decay arithmetic that the server applies', () => {
		const { lines } = scoringExample();
		expect(lines[0]).toContain('40 + 30 × 0.5 = 55');
		expect(lines[1]).toContain('55 + 20 = 75')
		expect(lines[1]).toContain('score is 38');
	});
});
