import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { Mention } from '$lib/restaurants/types';
import type { EntryGenerator, RequestHandler } from './$types';

// Prerendered at build time: one static JSON per restaurant slug. Holds the full
// per-restaurant mentions (comment bodies, permalinks, classifications) that are only
// shown when a card is expanded, so they stay out of the initial prerendered page payload.
export const prerender = true;

export const entries: EntryGenerator = async () => {
	const res = await db.execute(sql`
		SELECT DISTINCT r.slug
		FROM restaurants r
		JOIN mentions m ON m.restaurant_id = r.id
		JOIN threads t ON t.id = m.thread_id
		WHERE t.included_in_publish = true
	`);
	return (res.rows as unknown as { slug: string }[]).map((r) => ({ slug: r.slug }));
};

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
			m.classification
		FROM mentions m
		JOIN restaurants r ON r.id = m.restaurant_id
		JOIN threads t ON t.id = m.thread_id
		WHERE t.included_in_publish = true
			AND r.slug = ${params.slug}
		ORDER BY CASE WHEN m.role = 'primary' THEN 0 ELSE 1 END, m.score DESC
	`);
	return json(res.rows as unknown as Mention[]);
};
