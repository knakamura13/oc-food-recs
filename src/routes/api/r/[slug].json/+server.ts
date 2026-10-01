import { db } from '$lib/server/db';
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
			m.comment_date
		FROM mentions m
		JOIN restaurants r ON r.id = m.restaurant_id
		JOIN threads t ON t.id = m.thread_id
		WHERE t.included_in_publish = true
			AND r.status <> 'excluded'
			AND r.slug = ${params.slug}
		ORDER BY CASE WHEN m.role = 'primary' THEN 0 ELSE 1 END, m.score DESC
	`);
	return json(res.rows as unknown as Mention[], {
		headers: { 'cache-control': PUBLIC_CACHE_CONTROL }
	});
};
