import { listPublicRestaurants } from '$lib/server/restaurants/public-restaurant';
import { deploymentOrigin, publicHubs } from '$lib/server/restaurants/public-pages';
import { SOURCE_CACHE_CONTROL } from '$lib/server/cache-control';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': SOURCE_CACHE_CONTROL });
	const restaurants = await listPublicRestaurants();
	return { canonical: `${deploymentOrigin()}/browse`,
		groups: (['city', 'cuisine'] as const).map(kind => ({ kind, hubs: publicHubs(restaurants, kind).map(h => ({ label: h.label, slug: h.slug, count: h.restaurant_count })) })) };
};
