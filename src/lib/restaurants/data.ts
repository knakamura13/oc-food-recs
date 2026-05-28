import restaurantData from '$lib/data/generated/restaurants.json';

import type { Restaurant, RestaurantData } from './types';
import { slugify } from './stores.svelte';

const raw = restaurantData as Omit<RestaurantData, 'restaurants'> & {
	restaurants: Omit<Restaurant, 'slug'>[];
};

// Slugs aren't in the pipeline output — derive them here so collisions
// (e.g. "Wok In!" + "Wok-in" → both "wok-in") get -2/-3 suffixes.
const used = new Set<string>();
const restaurants: Restaurant[] = raw.restaurants.map((r) => {
	const base = slugify(r.name);
	let slug = base;
	let n = 2;
	while (used.has(slug)) {
		slug = `${base}-${n++}`;
	}
	used.add(slug);
	return { ...r, slug };
});

export const restaurantDataSet: RestaurantData = { ...raw, restaurants };
