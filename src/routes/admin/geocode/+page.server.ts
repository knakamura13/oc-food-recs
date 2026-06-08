import { fail } from '@sveltejs/kit';
import {
	applyRestaurantCorrection,
	clearCacheEntry,
	forceRetryCacheEntry,
	resolveCorrectionInput
} from '$lib/server/geocode/admin';
import {
	countUnresolvedRestaurants,
	loadGeocodeHealthStats,
	loadNegativeCacheEntries,
	loadUnresolvedRestaurants
} from '$lib/server/geocode/health';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [stats, unresolved, negativeCache, unresolvedTotal] = await Promise.all([
		loadGeocodeHealthStats(),
		loadUnresolvedRestaurants(50),
		loadNegativeCacheEntries(50),
		countUnresolvedRestaurants()
	]);

	return {
		stats,
		unresolved,
		negativeCache,
		unresolvedTotal
	};
};

export const actions: Actions = {
	correctRestaurant: async ({ request }) => {
		const form = await request.formData();
		const restaurantId = Number(form.get('restaurantId'));
		if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
			return fail(400, { error: 'Invalid restaurant id.', action: 'correctRestaurant' });
		}

		try {
			const resolved = await resolveCorrectionInput({
				mapsUrl: String(form.get('mapsUrl') ?? ''),
				address: String(form.get('address') ?? ''),
				latLng: String(form.get('latLng') ?? '')
			});
			await applyRestaurantCorrection(restaurantId, resolved);
			return { success: true, action: 'correctRestaurant', message: 'Restaurant coordinates updated.' };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Correction failed.';
			return fail(400, { error: message, action: 'correctRestaurant' });
		}
	},

	clearCacheEntry: async ({ request }) => {
		const form = await request.formData();
		const cacheId = Number(form.get('cacheId'));
		if (!Number.isFinite(cacheId) || cacheId <= 0) {
			return fail(400, { error: 'Invalid cache entry id.', action: 'clearCacheEntry' });
		}

		try {
			await clearCacheEntry(cacheId);
			return { success: true, action: 'clearCacheEntry', message: 'Cache entry deleted.' };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Delete failed.';
			return fail(400, { error: message, action: 'clearCacheEntry' });
		}
	},

	forceRetryCacheEntry: async ({ request }) => {
		const form = await request.formData();
		const cacheId = Number(form.get('cacheId'));
		if (!Number.isFinite(cacheId) || cacheId <= 0) {
			return fail(400, { error: 'Invalid cache entry id.', action: 'forceRetryCacheEntry' });
		}

		try {
			await forceRetryCacheEntry(cacheId);
			return {
				success: true,
				action: 'forceRetryCacheEntry',
				message: 'Negative cache entry cleared for retry.'
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Retry reset failed.';
			return fail(400, { error: message, action: 'forceRetryCacheEntry' });
		}
	}
};
