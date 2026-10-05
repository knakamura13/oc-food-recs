import { applyRestaurantCuration } from './restaurant-curation';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { countsTowardScore } from './counts-toward-score';
import { excerptBody, publicIndexability, validCoordinates } from '$lib/restaurants/indexability';
import type { Mention, LocationScope } from '$lib/restaurants/types';

import { publicRestaurantVisibility } from './public-visibility';

export interface RawPublicMention extends Mention {
	co_mentions: number;
	body_restaurants: number;
}
export interface PublicMention extends Mention { is_excerpt: boolean }
export interface PublicRestaurant extends LocationScope {
	name: string; slug: string; location: string | null; street: string | null;
	cuisine: string | null; lat: number | null; lng: number | null;
	mentions: PublicMention[]; mention_count: number; thread_count: number;
	people_count: number; aggregate_score: number; unique_word_count: number;
	indexable: boolean; lastmod: string | null;
}
interface RawRestaurant extends Omit<PublicRestaurant, 'mentions'> { mentions: RawPublicMention[] }

/** One scoped query for a detail, or one batch for the indexing catalog. */
async function loadRows(slug?: string): Promise<RawRestaurant[]> {
	const result = await db.execute(sql`
		SELECT r.name, r.slug, r.location, r.street, r.cuisine, r.lat, r.lng,
			json_agg(json_build_object(
				'comment_id', m.comment_id, 'thread_id', m.thread_id,
				'permalink', m.permalink, 'author', m.author, 'body', m.body,
				'score', m.score, 'role', m.role, 'classification', m.classification,
				'comment_date', m.comment_date,
				'co_mentions', (SELECT COUNT(DISTINCT m2.restaurant_id) FROM mentions m2
					WHERE m2.thread_id = m.thread_id AND m2.comment_id = m.comment_id
					AND m2.status = 'published' AND ${countsTowardScore('m2')}),
				'body_restaurants', (SELECT COUNT(DISTINCT m3.restaurant_id) FROM mentions m3
					JOIN threads t3 ON t3.id = m3.thread_id WHERE m3.body = m.body
					AND t3.included_in_publish = true AND m3.status = 'published' AND ${countsTowardScore('m3')}),
				'other_places', COALESCE((SELECT json_agg(json_build_object('slug', r2.slug, 'name', r2.name) ORDER BY r2.name)
					FROM mentions m4 JOIN restaurants r2 ON r2.id = m4.restaurant_id
					JOIN threads t2 ON t2.id = m4.thread_id
					WHERE m4.thread_id = m.thread_id AND m4.comment_id = m.comment_id
					AND m4.restaurant_id <> m.restaurant_id AND ${publicRestaurantVisibility('r2')}
					AND t2.included_in_publish = true AND m4.status = 'published' AND ${countsTowardScore('m4')}
				), '[]'::json)
			) ORDER BY CASE WHEN m.role = 'primary' THEN 0 ELSE 1 END, m.score DESC, m.id) AS mentions
		FROM restaurants r JOIN mentions m ON m.restaurant_id = r.id
		JOIN threads t ON t.id = m.thread_id
		WHERE ${publicRestaurantVisibility('r')} AND t.included_in_publish = true
			AND m.status = 'published' AND ${countsTowardScore('m')}
			${slug === undefined ? sql`` : sql`AND r.slug = ${slug}`}
		GROUP BY r.id ORDER BY r.name, r.slug
	`);
	return result.rows as unknown as RawRestaurant[];
}

export function presentPublicRestaurant(row: RawRestaurant): PublicRestaurant {
	const policy = publicIndexability(row.lat, row.lng, row.mentions);
	const mapped = validCoordinates(row.lat, row.lng);
	const authorCounts = new Map<string, number>();
	let weighted = 0;
	for (const m of [...row.mentions].sort((a, b) => b.score - a.score)) {
		const anonymous = !m.author.trim() || ['[deleted]', '[removed]'].includes(m.author.trim());
		const key = anonymous ? `${m.thread_id}/${m.comment_id}` : m.author;
		const repeat = authorCounts.get(key) ?? 0;
		authorCounts.set(key, repeat + 1);
		weighted += m.score / Math.max(1, m.co_mentions) * Math.pow(0.5, repeat);
	}
	return applyRestaurantCuration({
		name: row.name, slug: row.slug, location: row.location, street: row.street,
		cuisine: row.cuisine, lat: mapped ? row.lat : null, lng: mapped ? row.lng : null,
		...policy, people_count: authorCounts.size,
		aggregate_score: Math.round(weighted * authorCounts.size / (authorCounts.size + 2)),
		mentions: row.mentions.map(({ co_mentions: _, body_restaurants: __, ...m }) => ({
			...m, ...excerptBody(m.body), comment_date: m.comment_date ? new Date(m.comment_date).toISOString() : null
		}))
	});
}
export async function getPublicRestaurant(slug: string): Promise<PublicRestaurant | null> {
	const [row] = await loadRows(slug);
	return row ? presentPublicRestaurant(row) : null;
}
export async function listPublicRestaurants(): Promise<PublicRestaurant[]> {
	return (await loadRows()).map(presentPublicRestaurant);
}
export async function getPublicMentions(slug: string): Promise<Mention[]> {
	const [row] = await loadRows(slug);
	return row?.mentions.map(({ co_mentions: _, body_restaurants: __, ...m }) => m) ?? [];
}
export async function getPublicRestaurantRedirect(slug: string): Promise<string | null> {
	const result = await db.execute(sql`SELECT r.slug FROM merge_log ml
		JOIN restaurants r ON r.id = ml.winner_id
		WHERE ml.loser_slug = ${slug} AND ${publicRestaurantVisibility('r')}
		AND NOT EXISTS (SELECT 1 FROM restaurants current_restaurant WHERE current_restaurant.slug = ${slug})
		AND EXISTS (SELECT 1 FROM mentions m JOIN threads t ON t.id = m.thread_id
			WHERE m.restaurant_id = r.id AND m.status = 'published' AND t.included_in_publish = true AND ${countsTowardScore('m')})
		ORDER BY ml.created_at DESC LIMIT 1`);
	return (result.rows[0]?.slug as string | undefined) ?? null;
}
