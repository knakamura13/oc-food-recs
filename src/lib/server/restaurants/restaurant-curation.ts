import manifest from '../../../../data/restaurant-curation.json';
import type { LocationScope } from '$lib/restaurants/types';

interface SourceAssertion {
	thread_id: string; comment_id: string; role: 'primary' | 'endorsement';
	body_sha256: string; names_restaurant: boolean | null;
}
interface CuratedRestaurant {
	slug: string; name: string; scope: 'multiple_locations';
	locations: { city: string; street: string }[];
	evidence_urls: string[]; sources: SourceAssertion[];
}
interface CurationManifest { version: 1; restaurants: CuratedRestaurant[] }
function fail(): never { throw new Error('Invalid restaurant curation manifest'); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
	const record = value as Record<string, unknown>;
	if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) fail();
	return record;
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
/** Reject invalid curation at module load; never silently fall back to a mapped record. */
export function validateRestaurantCuration(value: unknown): CurationManifest {
	const root = object(value, ['version', 'restaurants']);
	if (root.version !== 1 || !Array.isArray(root.restaurants)) fail();
	const slugs = new Set<string>();
	const sourceKeys = new Set<string>();
	for (const item of root.restaurants) {
		const row = object(item, ['slug', 'name', 'scope', 'locations', 'evidence_urls', 'sources']);
		if (!nonempty(row.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) || slugs.has(row.slug) || !nonempty(row.name) || row.scope !== 'multiple_locations') fail();
		slugs.add(row.slug);
		if (!Array.isArray(row.locations) || row.locations.length < 2) fail();
		const places = new Set<string>();
		for (const entry of row.locations) {
			const place = object(entry, ['city', 'street']);
			if (!nonempty(place.city) || !nonempty(place.street)) fail();
			const key = JSON.stringify([place.city.trim(), place.street.trim()]);
			if (places.has(key)) fail();
			places.add(key);
		}
		if (!Array.isArray(row.evidence_urls) || !row.evidence_urls.length) fail();
		for (const url of row.evidence_urls) {
			if (!nonempty(url)) fail();
			try { if (new URL(url).protocol !== 'https:') fail(); } catch { fail(); }
		}
		if (!Array.isArray(row.sources) || !row.sources.length) fail();
		for (const entry of row.sources) {
			const source = object(entry, ['thread_id', 'comment_id', 'role', 'body_sha256', 'names_restaurant']);
			if (!nonempty(source.thread_id) || !nonempty(source.comment_id) || !['primary', 'endorsement'].includes(String(source.role)) || typeof source.body_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.body_sha256) || (source.names_restaurant !== null && typeof source.names_restaurant !== 'boolean')) fail();
			const key = JSON.stringify([source.thread_id, source.comment_id]);
			if (sourceKeys.has(key)) fail();
			sourceKeys.add(key);
		}
	}
	return value as CurationManifest;
}
const curated = new Map(validateRestaurantCuration(manifest).restaurants.map(row => [row.slug, row]));
/** A projection only: source arrays, scores, flags and moderation remain untouched. */
export function applyRestaurantCuration<T extends { slug: string; location: string | null; street: string | null; lat: number | null; lng: number | null }>(row: T): T & LocationScope {
	const policy = curated.get(row.slug);
	if (!policy) return row;
	return { ...row, location: null, street: null, lat: null, lng: null,
		location_scope: 'multiple_locations', reviewed_locations: policy.locations.map(place => ({ ...place })),
		...('indexable' in row ? { indexable: false } : {}) };
}
