import { getPublicMentions } from '$lib/server/restaurants/public-restaurant';
import { json } from '@sveltejs/kit';
import { SOURCE_CACHE_CONTROL } from '$lib/server/cache-control';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const mentions = await getPublicMentions(params.slug);
	return json(mentions, { headers: { 'cache-control': mentions.length ? SOURCE_CACHE_CONTROL : 'no-store' } });
};
