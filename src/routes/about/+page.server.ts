import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { PUBLIC_CACHE_CONTROL } from '$lib/server/cache-control';
import { countsTowardScore } from '$lib/server/restaurants/counts-toward-score';
import { groupThreadsBySubreddit, type AboutThread, type Coverage } from './about-data';
import type { PageServerLoad } from './$types';

// Rendered per request (cached at the edge), never prerendered: the numbers come from the live
// database and the Railway build has no guaranteed DB access.
export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': PUBLIC_CACHE_CONTROL });

	const [threadResult, coverageResult] = await Promise.all([
		db.execute(sql`
			SELECT t.id, t.title, t.url, t.subreddit, t.comment_count
			FROM threads t
			WHERE t.included_in_publish = true
		`),
		db.execute(sql`
			WITH published_mentions AS (
				SELECT m.*
				FROM mentions m
				JOIN threads t ON t.id = m.thread_id
				WHERE t.included_in_publish = true
					AND m.status = 'published'
					AND ${countsTowardScore('m')}
			),
			shown AS (
				SELECT r.*
				FROM restaurants r
				WHERE r.status <> 'excluded'
					AND EXISTS (SELECT 1 FROM published_mentions pm WHERE pm.restaurant_id = r.id)
			),
			hidden AS (
				SELECT r.exclusion_reason
				FROM restaurants r
				WHERE r.status = 'excluded'
					AND EXISTS (
						SELECT 1 FROM mentions m JOIN threads t ON t.id = m.thread_id
						WHERE m.restaurant_id = r.id AND t.included_in_publish = true
					)
			)
			SELECT
				(SELECT COUNT(*) FROM shown)::int AS restaurants,
				(SELECT COUNT(*) FROM published_mentions)::int AS quotes,
				(
					SELECT COUNT(DISTINCT author) FROM published_mentions
					WHERE TRIM(author) <> '' AND author NOT IN ('[deleted]', '[removed]')
				)::int AS redditors,
				(SELECT COUNT(*) FROM threads WHERE included_in_publish = true)::int AS threads,
				(SELECT COUNT(DISTINCT subreddit) FROM threads WHERE included_in_publish = true)::int AS subreddits,
				(SELECT COALESCE(SUM(comment_count), 0) FROM threads WHERE included_in_publish = true)::int AS comments_read,
				(SELECT COUNT(*) FROM shown WHERE lat IS NULL OR lng IS NULL)::int AS without_coordinates,
				(SELECT COUNT(*) FROM shown WHERE NULLIF(TRIM(cuisine), '') IS NULL)::int AS without_cuisine,
				(SELECT COUNT(*) FROM hidden WHERE exclusion_reason IS DISTINCT FROM 'closed')::int AS chains_excluded,
				(SELECT COUNT(*) FROM hidden WHERE exclusion_reason = 'closed')::int AS closed_excluded,
				(SELECT MAX(fetched_at) FROM threads WHERE included_in_publish = true) AS snapshot_at
		`)
	]);

	const threads = (
		threadResult.rows as unknown as {
			id: string;
			title: string;
			url: string;
			subreddit: string;
			comment_count: number;
		}[]
	).map(
		(row): AboutThread => ({
			id: row.id,
			title: row.title,
			url: row.url,
			subreddit: row.subreddit,
			commentCount: row.comment_count
		})
	);

	const c = coverageResult.rows[0] as unknown as {
		restaurants: number;
		quotes: number;
		redditors: number;
		threads: number;
		subreddits: number;
		comments_read: number;
		without_coordinates: number;
		without_cuisine: number;
		chains_excluded: number;
		closed_excluded: number;
		snapshot_at: Date | string | null;
	};
	const coverage: Coverage = {
		restaurants: c.restaurants,
		quotes: c.quotes,
		redditors: c.redditors,
		threads: c.threads,
		subreddits: c.subreddits,
		commentsRead: c.comments_read,
		withoutCoordinates: c.without_coordinates,
		withoutCuisine: c.without_cuisine,
		chainsExcluded: c.chains_excluded,
		closedExcluded: c.closed_excluded,
		snapshotAt: c.snapshot_at ? new Date(c.snapshot_at).toISOString() : null
	};

	return { groups: groupThreadsBySubreddit(threads), coverage };
};
