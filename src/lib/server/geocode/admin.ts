import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { geocodeCache, restaurants } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

/** OC bounding box aligned with the Python pipeline. */
const OC_BOUNDS = {
	minLat: 33.3,
	maxLat: 34.0,
	minLng: -118.2,
	maxLng: -117.3
};

export interface ResolvedCoordinates {
	lat: number;
	lng: number;
	detail: string;
	provider: string;
}

export interface CorrectionInput {
	mapsUrl?: string;
	address?: string;
	latLng?: string;
}

/** Mirror Python `_geocode_key(name, location, street)`. */
export function buildGeocodeCacheKey(
	name: string,
	location: string | null | undefined,
	street?: string | null
): string {
	const parts = [name || ''];
	if (street?.trim()) parts.push(street.trim());
	if (location?.trim()) parts.push(location.trim());
	return parts.map((p) => p.toLowerCase()).join('|');
}

export function isInOcBounds(lat: number, lng: number): boolean {
	return (
		lat >= OC_BOUNDS.minLat &&
		lat <= OC_BOUNDS.maxLat &&
		lng >= OC_BOUNDS.minLng &&
		lng <= OC_BOUNDS.maxLng
	);
}

/** Parse "lat,lng" or "lat lng" from a single string. */
export function parseLatLngInput(raw: string): { lat: number; lng: number } | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const commaMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
	if (commaMatch) {
		return { lat: Number(commaMatch[1]), lng: Number(commaMatch[2]) };
	}

	const spaceMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
	if (spaceMatch) {
		return { lat: Number(spaceMatch[1]), lng: Number(spaceMatch[2]) };
	}

	return null;
}

/** Extract coordinates from common Google Maps URL formats. */
export function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
	const trimmed = url.trim();
	if (!trimmed) return null;

	// !3dLAT!4dLNG — prefer precise place coords over map viewport @lat,lng
	const dMatch = trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
	if (dMatch) {
		return { lat: Number(dMatch[1]), lng: Number(dMatch[2]) };
	}

	// @lat,lng,zoom
	const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
	if (atMatch) {
		return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) };
	}

	try {
		const parsed = new URL(trimmed);
		const q = parsed.searchParams.get('q') ?? parsed.searchParams.get('query');
		if (q) {
			const fromQ = parseLatLngInput(q);
			if (fromQ) return fromQ;
		}
		const ll = parsed.searchParams.get('ll');
		if (ll) {
			const fromLl = parseLatLngInput(ll);
			if (fromLl) return fromLl;
		}
	} catch {
		// not a valid URL
	}

	return null;
}

export async function geocodeAddressText(query: string): Promise<ResolvedCoordinates | null> {
	const apiKey = env.GOOGLE_MAPS_API_KEY;
	if (!apiKey) {
		throw new Error('GOOGLE_MAPS_API_KEY is not configured');
	}

	const textQuery = query.includes('Orange County')
		? query
		: `${query}, Orange County, CA`;

	const response = await fetch(GOOGLE_PLACES_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': apiKey,
			'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location'
		},
		body: JSON.stringify({
			textQuery,
			locationRestriction: {
				rectangle: {
					low: { latitude: OC_BOUNDS.minLat, longitude: OC_BOUNDS.minLng },
					high: { latitude: OC_BOUNDS.maxLat, longitude: OC_BOUNDS.maxLng }
				}
			}
		})
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`Google Places request failed (${response.status}): ${body}`);
	}

	const data = (await response.json()) as {
		places?: Array<{
			displayName?: { text?: string };
			formattedAddress?: string;
			location?: { latitude?: number; longitude?: number };
		}>;
	};

	const place = data.places?.[0];
	if (!place) return null;

	const lat = place.location?.latitude;
	const lng = place.location?.longitude;
	if (lat == null || lng == null) return null;

	const displayName = place.displayName?.text ?? 'Unknown';
	const formattedAddress = place.formattedAddress ?? '';
	return {
		lat,
		lng,
		detail: `${displayName}, ${formattedAddress}`,
		provider: 'google'
	};
}

export async function resolveCorrectionInput(
	input: CorrectionInput
): Promise<ResolvedCoordinates> {
	if (input.latLng?.trim()) {
		const parsed = parseLatLngInput(input.latLng);
		if (!parsed) throw new Error('Invalid lat/lng format. Use "lat,lng".');
		if (!isInOcBounds(parsed.lat, parsed.lng)) {
			throw new Error('Coordinates are outside Orange County bounds.');
		}
		return {
			lat: parsed.lat,
			lng: parsed.lng,
			detail: `manual: ${parsed.lat}, ${parsed.lng}`,
			provider: 'manual'
		};
	}

	if (input.mapsUrl?.trim()) {
		const parsed = parseGoogleMapsUrl(input.mapsUrl);
		if (!parsed) throw new Error('Could not extract coordinates from Google Maps URL.');
		if (!isInOcBounds(parsed.lat, parsed.lng)) {
			throw new Error('Coordinates from URL are outside Orange County bounds.');
		}
		return {
			lat: parsed.lat,
			lng: parsed.lng,
			detail: `manual: ${input.mapsUrl.trim()}`,
			provider: 'manual'
		};
	}

	if (input.address?.trim()) {
		const result = await geocodeAddressText(input.address.trim());
		if (!result) throw new Error('No geocode results for that address.');
		if (!isInOcBounds(result.lat, result.lng)) {
			throw new Error('Geocoded address is outside Orange County bounds.');
		}
		return result;
	}

	throw new Error('Provide a Google Maps URL, address, or lat/lng.');
}

export async function applyRestaurantCorrection(
	restaurantId: number,
	resolved: ResolvedCoordinates
): Promise<void> {
	const [row] = await db
		.select({
			id: restaurants.id,
			name: restaurants.name,
			location: restaurants.location,
			street: restaurants.street
		})
		.from(restaurants)
		.where(eq(restaurants.id, restaurantId))
		.limit(1);

	if (!row) throw new Error('Restaurant not found.');

	const cacheKey = buildGeocodeCacheKey(row.name, row.location, row.street);

	await db.transaction(async (tx) => {
		await tx
			.update(restaurants)
			.set({
				lat: resolved.lat,
				lng: resolved.lng,
				updatedAt: sql`now()`
			})
			.where(eq(restaurants.id, restaurantId));

		await tx
			.insert(geocodeCache)
			.values({
				query: cacheKey,
				provider: resolved.provider,
				lat: resolved.lat,
				lng: resolved.lng,
				detail: resolved.detail,
				retryAfter: null
			})
			.onConflictDoUpdate({
				target: geocodeCache.query,
				set: {
					provider: resolved.provider,
					lat: resolved.lat,
					lng: resolved.lng,
					detail: resolved.detail,
					retryAfter: null,
					createdAt: sql`now()`
				}
			});
	});
}

export async function clearCacheEntry(cacheId: number): Promise<void> {
	const deleted = await db
		.delete(geocodeCache)
		.where(eq(geocodeCache.id, cacheId))
		.returning({ id: geocodeCache.id });
	if (deleted.length === 0) throw new Error('Cache entry not found.');
}

export async function forceRetryCacheEntry(cacheId: number): Promise<void> {
	const updated = await db
		.update(geocodeCache)
		.set({ retryAfter: null })
		.where(eq(geocodeCache.id, cacheId))
		.returning({ id: geocodeCache.id });
	if (updated.length === 0) throw new Error('Cache entry not found.');
}
