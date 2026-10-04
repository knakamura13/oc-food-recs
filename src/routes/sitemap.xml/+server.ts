import { listPublicRestaurants } from '$lib/server/restaurants/public-restaurant';
import { deploymentOrigin, sitemapXml } from '$lib/server/restaurants/public-pages';
import { SOURCE_CACHE_CONTROL } from '$lib/server/cache-control';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async () => new Response(sitemapXml(await listPublicRestaurants(), deploymentOrigin()), {
	headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': SOURCE_CACHE_CONTROL }
});
