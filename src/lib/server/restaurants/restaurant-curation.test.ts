import { describe, expect, it } from 'vitest';
import manifest from '../../../../data/restaurant-curation.json';
import { applyRestaurantCuration, validateRestaurantCuration } from './restaurant-curation';
describe('reviewed restaurant scope', () => {
	it('masks accidental geography without changing evidence or counts', () => {
		const row = { slug: 'a-s-burgers', location: 'Wrong', street: 'Wrong', lat: 33, lng: -117, indexable: true, mention_count: 1, mentions: [{ body: 'Both locations' }] };
		const result = applyRestaurantCuration(row);
		expect(result).toMatchObject({ location: null, street: null, lat: null, lng: null, indexable: false, location_scope: 'multiple_locations', mention_count: 1 });
		expect(result.mentions).toBe(row.mentions);
		expect(result.reviewed_locations).toHaveLength(2);
		expect(row.lat).toBe(33);
	});
	it('leaves ordinary records unchanged', () => {
		const row = { slug: 'a-s-burgers-2', location: 'San Juan Capistrano', street: 'Avery', lat: 33, lng: -117 };
		expect(applyRestaurantCuration(row)).toBe(row);
	});
	it.each(['version', 'extra', 'duplicate', 'hash', 'role', 'flag', 'location', 'source', 'url', 'cross-source', 'duplicate-place'])('fails closed for corrupt %s', kind => {
		const value = structuredClone(manifest) as any;
		if (kind === 'version') value.version = 2;
		if (kind === 'extra') value.restaurants[0].typo = true;
		if (kind === 'duplicate') value.restaurants.push(value.restaurants[0]);
		if (kind === 'hash') value.restaurants[0].sources[0].body_sha256 = 'bad';
		if (kind === 'role') value.restaurants[0].sources[0].role = 'review';
		if (kind === 'flag') value.restaurants[0].sources[0].names_restaurant = 'false';
		if (kind === 'location') value.restaurants[0].locations[0].city = '';
		if (kind === 'source') value.restaurants[0].sources.push(value.restaurants[0].sources[0]);
		if (kind === 'url') value.restaurants[0].evidence_urls = ['javascript:alert(1)'];
		if (kind === 'duplicate-place') value.restaurants[0].locations[1] = value.restaurants[0].locations[0];
		if (kind === 'cross-source') value.restaurants.push({ ...value.restaurants[0], slug: 'another' });
		expect(() => validateRestaurantCuration(value)).toThrow();
	});
});
