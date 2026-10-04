import { describe, expect, it } from 'vitest';
import { publicHubs, hubExplorerUrl, jsonLd, restaurantStructuredData, sitemapXml } from './public-pages';
import { parseSearchParams } from '$lib/restaurants/url-state';
import { sourceUrl } from '$lib/restaurants/source-url';
import type { PublicRestaurant } from './public-restaurant';
const restaurant = (id: number, extra: Partial<PublicRestaurant> = {}): PublicRestaurant => ({
	name: `Place ${id}`, slug: `place-${id}`, location: 'Santa Ana', cuisine: 'Mexican', street: null, lat: 33, lng: -117,
	mentions: [{ comment_id: `c${id}`, thread_id: id % 2 ? 'test-one' : 'test-two', body: 'tasty meal', is_excerpt: false,
		author: 'user', permalink: 'https://reddit.com/r/test/comments/one/_/c/', score: 1, role: 'primary', classification: null, comment_date: null }],
	mention_count: 1, thread_count: 1, people_count: 1, aggregate_score: 1, unique_word_count: 50,
	indexable: true, lastmod: null, ...extra
});
describe('public hub, sitemap and structured-data policies', () => {
	it('gates hubs at five eligible restaurants and two published threads', () => {
		expect(publicHubs([1,2,3,4].map(id => restaurant(id)), 'city')[0].indexable).toBe(false);
		expect(publicHubs([1,2,3,4,5].map(id => restaurant(id)), 'city')[0].indexable).toBe(true);
		expect(publicHubs([1,2,3,4,5].map(id => restaurant(id, { mentions: restaurant(1).mentions })), 'city')[0].indexable).toBe(false);
		expect(publicHubs([1,2,3,4,5].map(id => restaurant(id, { indexable: id < 5 })), 'city')[0].indexable).toBe(false);
	});
	it('combines categories that normalize to one canonical slug', () => {
		const hubs = publicHubs([restaurant(1, { cuisine: 'Test Cuisine' }), restaurant(2, { cuisine: 'Test-Cuisine' })], 'cuisine');
		expect(hubs).toHaveLength(1); expect(hubs[0].slug).toBe('test-cuisine'); expect(hubs[0].restaurant_count).toBe(2);
		const state = parseSearchParams(new URL(hubExplorerUrl(hubs[0]), 'https://example.test').searchParams);
		expect(state.activeCuisines).toEqual(['Test Cuisine', 'Test-Cuisine']);
		const cities = publicHubs([restaurant(1, { location: 'Test City' }), restaurant(2, { location: 'Test-City' })], 'city');
		expect(parseSearchParams(new URL(hubExplorerUrl(cities[0]), 'https://example.test').searchParams).activeCities).toEqual(['Test City', 'Test-City']);
	});
	it('omits unavailable schema properties, anonymous people and unsupported ratings', () => {
		const data = restaurantStructuredData(restaurant(1, { street: null, location: null, cuisine: null, lat: null, lng: null,
			mentions: [{ ...restaurant(1).mentions[0], author: '[deleted]' }] }), 'https://example.test');
		const place = data['@graph'][0];
		expect(place).not.toHaveProperty('geo'); expect(place).not.toHaveProperty('address'); expect(place).not.toHaveProperty('servesCuisine');
		expect(place).toHaveProperty('review', []); expect(JSON.stringify(data)).not.toMatch(/aggregateRating|reviewRating/);
		expect(jsonLd({ body: '</script><script>alert(1)</script>&' })).not.toContain('<');
	});
	it('lists only eligible canonical routes with valid XML and published dates', () => {
		const xml = sitemapXml([restaurant(1, { lastmod: '2020-01-01T00:00:00.000Z' }), restaurant(2, { indexable: false }), restaurant(3)], 'https://example.test');
		const document = new DOMParser().parseFromString(xml, 'application/xml');
		expect(document.querySelector('parsererror')).toBeNull(); expect(xml).toContain('/r/place-1'); expect(xml).not.toContain('/r/place-2');
		expect(xml).toContain('2020-01-01'); expect(document.querySelectorAll('lastmod')).toHaveLength(1);
	});
	it('permits only source URLs on Reddit and uses a source-thread fallback', () => {
		expect(sourceUrl({ permalink: 'javascript:alert(1)', thread_id: 'test-one' })).toBe('https://www.reddit.com/r/test/comments/one/');
		expect(sourceUrl({ permalink: 'https://reddit.com.evil.test/x', thread_id: 'bad' })).toBeNull();
		expect(sourceUrl({ permalink: '/r/test/comments/one/', thread_id: 'bad' })).toBe('https://www.reddit.com/r/test/comments/one/');
	});
});
