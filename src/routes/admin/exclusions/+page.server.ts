import { fail } from '@sveltejs/kit';
import {
	addBrandToRegistry,
	loadExclusionQueue,
	markRestaurantExcluded,
	restoreRestaurantActive,
	type ExclusionReason
} from '$lib/server/restaurants/admin';
import type { Actions, PageServerLoad } from './$types';

const REASONS = new Set<ExclusionReason>(['chain', 'corporate_group']);

function coerceReason(value: FormDataEntryValue | null): ExclusionReason {
	const v = String(value ?? '');
	return REASONS.has(v as ExclusionReason) ? (v as ExclusionReason) : 'chain';
}

export const load: PageServerLoad = async () => {
	const { pendingReview, excluded } = await loadExclusionQueue(200);
	return { pendingReview, excluded };
};

export const actions: Actions = {
	excludeRestaurant: async ({ request }) => {
		const form = await request.formData();
		const restaurantId = Number(form.get('restaurantId'));
		if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
			return fail(400, { error: 'Invalid restaurant id.', action: 'excludeRestaurant' });
		}
		const reason = coerceReason(form.get('reason'));
		try {
			await markRestaurantExcluded(restaurantId, reason);
			// Optionally also blacklist the brand so future ingests/sweeps catch it everywhere.
			const brandName = String(form.get('brandName') ?? '').trim();
			if (form.get('addToRegistry') && brandName) {
				await addBrandToRegistry(brandName, reason, null);
			}
			return { success: true, action: 'excludeRestaurant', message: 'Restaurant excluded from the public site.' };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Exclusion failed.';
			return fail(400, { error: message, action: 'excludeRestaurant' });
		}
	},

	restoreRestaurant: async ({ request }) => {
		const form = await request.formData();
		const restaurantId = Number(form.get('restaurantId'));
		if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
			return fail(400, { error: 'Invalid restaurant id.', action: 'restoreRestaurant' });
		}
		try {
			await restoreRestaurantActive(restaurantId);
			return { success: true, action: 'restoreRestaurant', message: 'Restaurant restored to the public site.' };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Restore failed.';
			return fail(400, { error: message, action: 'restoreRestaurant' });
		}
	},

	addBrand: async ({ request }) => {
		const form = await request.formData();
		const brandName = String(form.get('brandName') ?? '').trim();
		if (!brandName) {
			return fail(400, { error: 'Brand name is required.', action: 'addBrand' });
		}
		const reason = coerceReason(form.get('reason'));
		const groupName = String(form.get('groupName') ?? '').trim() || null;
		try {
			await addBrandToRegistry(brandName, reason, groupName);
			return { success: true, action: 'addBrand', message: `Added “${brandName}” to the exclusion registry.` };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not add brand.';
			return fail(400, { error: message, action: 'addBrand' });
		}
	}
};
