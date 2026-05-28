import { restaurantDataSet } from '$lib/restaurants/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ dataset: restaurantDataSet });
