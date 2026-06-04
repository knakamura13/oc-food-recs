import { db } from '$lib/server/db';
import type { Mention, Restaurant, RestaurantData, SubredditStat, ThreadSummary } from '$lib/restaurants/types';
import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const prerender = true;

interface RestaurantRow {
	name: string;
	slug: string;
	location: string | null;
	cuisine: string | null;
	lat: number | null;
	lng: number | null;
	aggregate_score: number;
	mention_count: number;
	source_threads: string[];
	mentions: Mention[];
}

interface ThreadRow {
	id: string;
	title: string;
	url: string;
	subreddit: string;
	post_id: string;
	comment_count: number;
	restaurant_count: number;
}

interface StatsRow {
	total_restaurants: number;
	total_comments_processed: number;
	geocoded_count: number;
	unmapped_count: number;
	kept_endorsement_types: string[];
	generated_at: string;
}

export const load: PageServerLoad = async (): Promise<{ dataset: RestaurantData }> => {
	// Restaurants joined with their mentions; aggregated to one row per restaurant.
	// Only restaurants whose mentions belong to published threads are returned.
	const restaurantsResult = await db.execute(sql`
		WITH published_mentions AS (
			SELECT m.*
			FROM mentions m
			JOIN threads t ON t.id = m.thread_id
			WHERE t.included_in_publish = true
		),
		ranked_mentions AS (
			-- Rank each author's mentions of a restaurant by score so the same
			-- person recommending the same place over and over can't read as
			-- broad consensus. Anonymous authors are each their own voice.
			SELECT
				pm.*,
				CASE
					WHEN COALESCE(NULLIF(TRIM(pm.author), ''), '[deleted]')
						IN ('[deleted]', '[removed]')
					THEN 1
					ELSE ROW_NUMBER() OVER (
						PARTITION BY pm.restaurant_id, pm.author
						ORDER BY pm.score DESC, pm.id ASC
					)
				END AS author_rank
			FROM published_mentions pm
		),
		restaurant_mentions AS (
			SELECT
				r.id,
				r.name,
				r.slug,
				r.location,
				r.cuisine,
				r.lat,
				r.lng,
				-- Geometric ½ decay per repeat (must match REPEAT_AUTHOR_DECAY).
				COALESCE(SUM(rm.score * POWER(0.5, rm.author_rank - 1)), 0)::int AS aggregate_score,
				-- Distinct contributors = count of rank-1 mentions.
				COUNT(*) FILTER (WHERE rm.author_rank = 1)::int AS mention_count,
				COALESCE(
					ARRAY_AGG(DISTINCT rm.thread_id) FILTER (WHERE rm.thread_id IS NOT NULL),
					ARRAY[]::text[]
				) AS source_threads,
				COALESCE(
					JSON_AGG(
						JSON_BUILD_OBJECT(
							'comment_id', rm.comment_id,
							'thread_id', rm.thread_id,
							'permalink', rm.permalink,
							'author', rm.author,
							'body', rm.body,
							'score', rm.score,
							'role', rm.role,
							'classification', rm.classification
						)
						ORDER BY
							CASE WHEN rm.role = 'primary' THEN 0 ELSE 1 END,
							rm.score DESC
					) FILTER (WHERE rm.id IS NOT NULL),
					'[]'::json
				) AS mentions
			FROM restaurants r
			INNER JOIN ranked_mentions rm ON rm.restaurant_id = r.id
			GROUP BY r.id, r.name, r.slug, r.location, r.cuisine, r.lat, r.lng
		)
		SELECT
			name,
			slug,
			location,
			cuisine,
			lat,
			lng,
			aggregate_score,
			mention_count,
			source_threads,
			mentions
		FROM restaurant_mentions
		ORDER BY aggregate_score DESC, name ASC
	`);

	const restaurantRows = restaurantsResult.rows as unknown as RestaurantRow[];
	// Thread summaries — restaurant_count is the distinct count of restaurants
	// represented by published mentions in that thread.
	const threadsResult = await db.execute(sql`
		SELECT
			t.id,
			t.title,
			t.url,
			t.subreddit,
			t.post_id,
			t.comment_count,
			COALESCE(COUNT(DISTINCT m.restaurant_id), 0)::int AS restaurant_count
		FROM threads t
		LEFT JOIN mentions m ON m.thread_id = t.id
		WHERE t.included_in_publish = true
		GROUP BY t.id, t.title, t.url, t.subreddit, t.post_id, t.comment_count
		ORDER BY t.fetched_at ASC
	`);

	const threadRows = threadsResult.rows as unknown as ThreadRow[];
	const sourceThreads: ThreadSummary[] = threadRows.map((row) => ({
		id: row.id,
		title: row.title,
		url: row.url,
		subreddit: row.subreddit,
		post_id: row.post_id,
		comment_count: row.comment_count,
		restaurant_count: row.restaurant_count
	}));

	// thread_id -> subreddit, for per-subreddit aggregate precomputation.
	const threadSub: Record<string, string> = {};
	for (const t of sourceThreads) threadSub[t.id] = t.subreddit;

	// Weighted aggregate (mirrors weightedAggregates in stores.svelte.ts): an author's best
	// mention counts fully; repeats decay 0.5^rank. Anonymous authors each count as one voice.
	const ANON = new Set(['[deleted]', '[removed]', '']);
	function weightedAgg(ms: Mention[]): { aggregate_score: number; mention_count: number } {
		const byAuthor = new Map<string, Mention[]>();
		let score = 0;
		let count = 0;
		for (const m of ms) {
			const a = (m.author ?? '').trim();
			if (ANON.has(a)) {
				score += m.score;
				count += 1;
				continue;
			}
			const list = byAuthor.get(a) ?? [];
			list.push(m);
			byAuthor.set(a, list);
		}
		for (const list of byAuthor.values()) {
			list.sort((a, b) => b.score - a.score);
			list.forEach((m, i) => {
				score += m.score * Math.pow(0.5, i);
			});
			count += 1;
		}
		return { aggregate_score: Math.round(score), mention_count: count };
	}

	const restaurants: Restaurant[] = restaurantRows.map((row) => {
		const mentions = row.mentions ?? [];
		const bySub = new Map<string, Mention[]>();
		for (const m of mentions) {
			const sub = threadSub[m.thread_id];
			if (!sub) continue;
			const list = bySub.get(sub) ?? [];
			list.push(m);
			bySub.set(sub, list);
		}
		const subreddit_stats: Record<string, SubredditStat> = {};
		for (const [sub, ms] of bySub) {
			const agg = weightedAgg(ms);
			subreddit_stats[sub] = {
				aggregate_score: agg.aggregate_score,
				mention_count: agg.mention_count,
				endorsement_count: ms.filter((m) => m.role === 'endorsement').length
			};
		}
		return {
			name: row.name,
			slug: row.slug,
			location: row.location,
			cuisine: row.cuisine,
			lat: row.lat,
			lng: row.lng,
			aggregate_score: row.aggregate_score,
			mention_count: row.mention_count,
			endorsement_count: mentions.filter((m) => m.role === 'endorsement').length,
			source_threads: row.source_threads ?? [],
			subreddit_stats
		};
	});

	// Aggregate stats over the published slice — total comments processed sums
	// the per-thread comment_count, the distinct classifications observed, and
	// the geocoded / unmapped restaurant counts.
	const statsResult = await db.execute(sql`
		SELECT
			(
				SELECT COUNT(DISTINCT r.id)::int
				FROM restaurants r
				INNER JOIN mentions m ON m.restaurant_id = r.id
				INNER JOIN threads t ON t.id = m.thread_id
				WHERE t.included_in_publish = true
			) AS total_restaurants,
			(
				SELECT COALESCE(SUM(t.comment_count), 0)::int
				FROM threads t
				WHERE t.included_in_publish = true
			) AS total_comments_processed,
			(
				SELECT COUNT(DISTINCT r.id)::int
				FROM restaurants r
				INNER JOIN mentions m ON m.restaurant_id = r.id
				INNER JOIN threads t ON t.id = m.thread_id
				WHERE t.included_in_publish = true
					AND r.lat IS NOT NULL
					AND r.lng IS NOT NULL
			) AS geocoded_count,
			(
				SELECT COUNT(DISTINCT r.id)::int
				FROM restaurants r
				INNER JOIN mentions m ON m.restaurant_id = r.id
				INNER JOIN threads t ON t.id = m.thread_id
				WHERE t.included_in_publish = true
					AND (r.lat IS NULL OR r.lng IS NULL)
			) AS unmapped_count,
			COALESCE(
				(
					SELECT ARRAY_AGG(DISTINCT m.classification)
					FROM mentions m
					INNER JOIN threads t ON t.id = m.thread_id
					WHERE t.included_in_publish = true
						AND m.classification IS NOT NULL
				),
				ARRAY[]::text[]
			) AS kept_endorsement_types,
			NOW()::text AS generated_at
	`);

	const statsRow = (statsResult.rows[0] ?? {}) as Partial<StatsRow>;

	const meta: RestaurantData['meta'] = {
		source_threads: sourceThreads,
		total_restaurants: statsRow.total_restaurants ?? restaurants.length,
		total_comments_processed: statsRow.total_comments_processed ?? 0,
		model_used: '',
		generated_at: statsRow.generated_at ?? new Date().toISOString(),
		kept_endorsement_types: statsRow.kept_endorsement_types ?? [],
		geocoded_count: statsRow.geocoded_count ?? 0,
		unmapped_count: statsRow.unmapped_count ?? 0
	};

	return {
		dataset: {
			restaurants,
			meta
		}
	};
};
