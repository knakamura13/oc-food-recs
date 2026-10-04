import { error, redirect } from '@sveltejs/kit';
import { getPublicRestaurant, getPublicRestaurantRedirect } from '$lib/server/restaurants/public-restaurant';
import { deploymentOrigin, categorySlug, restaurantStructuredData, jsonLd } from '$lib/server/restaurants/public-pages';
import { normalizeCity, cuisineFacetKey } from '$lib/restaurants/stores.svelte';
import { SOURCE_CACHE_CONTROL } from '$lib/server/cache-control';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const restaurant = await getPublicRestaurant(params.slug);
	if (!restaurant) {
		setHeaders({ 'cache-control': 'no-store' });
		const winner = await getPublicRestaurantRedirect(params.slug);
		if (winner) redirect(308, `/r/${encodeURIComponent(winner)}`);
		error(404, 'Restaurant not found');
	}
	setHeaders({ 'cache-control': SOURCE_CACHE_CONTROL });
	const origin = deploymentOrigin();
	const city = normalizeCity(restaurant.location);
	const cuisine = restaurant.cuisine ? cuisineFacetKey(restaurant.cuisine) : null;
	return { restaurant, canonical: `${origin}/r/${encodeURIComponent(restaurant.slug)}`,
		title: `${restaurant.name}${city ? ` in ${city}` : ''} | OC Food Recs`,
		description: `${restaurant.name}: ${restaurant.mention_count} published community recommendations from ${restaurant.thread_count} Reddit threads. Read source excerpts and explore nearby restaurants.`,
		structuredData: jsonLd(restaurantStructuredData(restaurant, origin)),
		city: city ? { label: city, slug: categorySlug(city) } : null,
		cuisine: cuisine ? { label: cuisine, slug: categorySlug(cuisine) } : null };
};
