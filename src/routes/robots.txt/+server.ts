import { deploymentOrigin } from '$lib/server/restaurants/public-pages';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = () => new Response(`User-agent: *\nDisallow: /api/\nDisallow: /admin/\nSitemap: ${deploymentOrigin()}/sitemap.xml\n`, {
	headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=300, must-revalidate' }
});
