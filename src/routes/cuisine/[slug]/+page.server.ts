import { loadHub } from '$lib/server/restaurants/hub-load';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ params, setHeaders }) => loadHub('cuisine', params.slug, setHeaders);
