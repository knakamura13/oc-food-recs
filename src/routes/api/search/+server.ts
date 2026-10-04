import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { commentSearchQuery, type CommentSearchResult } from '$lib/server/restaurants/comment-search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length > 160) error(400, 'Search query must be at most 160 characters.');
	const rawLimit = url.searchParams.get('limit');
	const limit = rawLimit === null ? 50 : Number(rawLimit);
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
		error(400, 'Search limit must be an integer between 1 and 100.');
	}
	const headers = { 'cache-control': 'no-store' };
	if (!query) return json([], { headers });
	const result = await db.execute(commentSearchQuery(query, limit));
	const rows = result.rows as unknown as CommentSearchResult[];
	return json(rows.map(({ slug, rank, quote }) => ({ slug, rank, quote })), { headers });
};
