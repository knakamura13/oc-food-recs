import { db } from '$lib/server/db';
import { countsTowardScore } from '$lib/server/restaurants/counts-toward-score';
import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { Mention } from '$lib/restaurants/types';
import { PUBLIC_CACHE_CONTROL } from '$lib/server/cache-control';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const res = await db.execute(sql`
		SELECT
			m.comment_id,
			m.thread_id,
			m.permalink,
			m.author,
			m.body,
			m.score,
			m.role,
			m.classification,
			m.comment_date,
			COALESCE((
				SELECT json_agg(json_build_object('slug', r2.slug, 'name', r2.name) ORDER BY r2.name)
				FROM mentions m2
				JOIN restaurants r2 ON r2.id = m2.restaurant_id
				WHERE m2.thread_id = m.thread_id
					AND m2.comment_id = m.comment_id
					AND m2.restaurant_id <> m.restaurant_id
					AND r2.status <> 'excluded'
					AND m2.status = 'published'
					AND ${countsTowardScore('m2')}
			), '[]'::json) AS other_places
		FROM mentions m
		JOIN restaurants r ON r.id = m.restaurant_id
		JOIN threads t ON t.id = m.thread_id
		WHERE t.included_in_publish = true
			AND r.status <> 'excluded'
			AND m.status = 'published'
			AND ${countsTowardScore('m')}
			AND r.slug = ${params.slug}
		ORDER BY CASE WHEN m.role = 'primary' THEN 0 ELSE 1 END, m.score DESC
	`);
	return json(res.rows as unknown as Mention[], {
		headers: { 'cache-control': PUBLIC_CACHE_CONTROL }
	});
};
