import { describe, expect, it } from 'vitest';
import { excerptBody, publicIndexability } from './indexability';
const words = (count: number, word = 'tasty') => Array(count).fill(word).join(' ');
const evidence = (body: string, id = 'a', extra = {}) => ({ body, thread_id: 't', comment_id: id, comment_date: null, ...extra });
describe('public excerpt and indexing contract', () => {
	it('keeps 399 characters and bounds 400 at a word boundary', () => {
		expect(excerptBody('x'.repeat(399))).toEqual({ body: 'x'.repeat(399), is_excerpt: false });
		const excerpt = excerptBody(`${'word '.repeat(80)}hidden_tail`);
		expect(excerpt.is_excerpt).toBe(true);
		expect(excerpt.body.length).toBeLessThanOrEqual(301);
		expect(excerpt.body).not.toContain('hidden_tail');
		expect(excerpt.body).toMatch(/word…$/);
	});
	it('extracts displayed Markdown labels and preserves safe literal text and Unicode', () => {
		expect(excerptBody('**tacos** [menu](https://example.test) &amp; <script>')).toMatchObject({ body: 'tacos menu &amp; <script>' });
		const result = excerptBody('😀 '.repeat(250));
		expect(result.is_excerpt).toBe(true);
		expect(result.body).not.toMatch(/[\uD800-\uDBFF]…/u);
	});
	it('requires exactly 50 visible words and two distinct comments with mapping', () => {
		expect(publicIndexability(1, 1, [evidence(words(25)), evidence(words(24, 'delicious'), 'b')]).indexable).toBe(false);
		expect(publicIndexability(1, 1, [evidence(words(25)), evidence(words(25, 'delicious'), 'b')]).indexable).toBe(true);
		expect(publicIndexability(1, 1, [evidence(words(50))]).indexable).toBe(false);
		expect(publicIndexability(1, 1, [evidence(words(50)), evidence(words(50))]).mention_count).toBe(1);
		for (const lat of [null, NaN, 91]) expect(publicIndexability(lat, 1, [evidence(words(50)), evidence('great', 'b')]).indexable).toBe(false);
	});
	it('counts repeated bodies once, shared bodies zero, and only visible excerpt words', () => {
		expect(publicIndexability(1, 1, [evidence(words(30)), evidence(words(30), 'b')]).unique_word_count).toBe(30);
		expect(publicIndexability(1, 1, [evidence(words(60), 'a', { co_mentions: 2 }), evidence(words(60), 'b', { body_restaurants: 2 })]).unique_word_count).toBe(0);
		expect(publicIndexability(1, 1, [evidence(words(90, 'lengthy'))]).unique_word_count).toBeLessThan(50);
	});
	it('uses newest valid published date and leaves unknown dates absent', () => {
		expect(publicIndexability(1, 1, [evidence('a')]).lastmod).toBeNull();
		expect(publicIndexability(1, 1, [evidence('a', 'a', { comment_date: 'bad' }), evidence('b', 'b', { comment_date: '2019-01-01' })]).lastmod).toBe('2019-01-01T00:00:00.000Z');
	});
});
