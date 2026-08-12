import type { ExplorerPageData } from "$lib/restaurants/explorer-page-data";
import { buildPageMeta } from "$lib/restaurants/page-meta";
import { db } from "$lib/server/db";
import type {
  Mention,
  Restaurant,
  RestaurantData,
  ThreadSummary,
} from "$lib/restaurants/types";
import { parseSearchParams } from "$lib/restaurants/url-state";
import {
  pickTopCommentSnippet,
  type SnippetCandidate,
} from "$lib/restaurants/top-comment-snippet";
import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

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
  dish_rec_count: number;
  snippet_candidates: SnippetCandidate[];
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
  total_comments_processed: number;
}

function threadSubredditLookup(
  threads: ThreadSummary[],
): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const t of threads) lookup[t.id] = t.subreddit;
  return lookup;
}

async function loadHomePage(
  urlState: ReturnType<typeof parseSearchParams>,
  pageOrigin: string,
  pathname: string,
): Promise<ExplorerPageData> {
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
							'thread_id', rm.thread_id,
							'author', rm.author,
							'score', rm.score,
							'role', rm.role,
							'comment_date', rm.comment_date
						)
						ORDER BY
							CASE WHEN rm.role = 'primary' THEN 0 ELSE 1 END,
							rm.score DESC
					) FILTER (WHERE rm.id IS NOT NULL),
					'[]'::json
				) AS mentions,
				COUNT(*) FILTER (WHERE rm.classification = 'dish_rec')::int AS dish_rec_count,
				COALESCE(
					JSON_AGG(
						JSON_BUILD_OBJECT(
							'body', rm.body,
							'score', rm.score,
							'classification', rm.classification
						)
					) FILTER (
						WHERE rm.id IS NOT NULL
							AND TRIM(rm.body) <> ''
							AND (
								rm.classification IS NULL
								OR rm.classification NOT IN ('filler', 'question')
							)
					),
					'[]'::json
				) AS snippet_candidates
			FROM restaurants r
			INNER JOIN ranked_mentions rm ON rm.restaurant_id = r.id
			-- Hide registry-excluded restaurants (chains / corporate groups). Only the
			-- authoritative 'excluded' status is hidden; 'pending_review' stays public
			-- (a fuzzy flag for the admin queue, not a confirmed exclusion).
			WHERE r.status <> 'excluded'
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
			mentions,
			dish_rec_count,
			snippet_candidates
		FROM restaurant_mentions
		ORDER BY aggregate_score DESC, name ASC
	`);

  const restaurantRows = restaurantsResult.rows as unknown as RestaurantRow[];
  const restaurants: Restaurant[] = restaurantRows.map((row) => ({
    name: row.name,
    slug: row.slug,
    location: row.location,
    cuisine: row.cuisine,
    lat: row.lat,
    lng: row.lng,
    aggregate_score: row.aggregate_score,
    mention_count: row.mention_count,
    dish_rec_count: row.dish_rec_count ?? 0,
    top_comment_snippet: pickTopCommentSnippet(
      row.name,
      row.snippet_candidates ?? [],
    ),
    source_threads: row.source_threads ?? [],
    mentions: (row.mentions ?? []).map((m) => ({
      thread_id: m.thread_id,
      author: m.author,
      score: m.score,
      role: m.role,
      comment_date: m.comment_date,
    })),
    endorsement_count: (row.mentions ?? []).filter(
      (m) => m.role === "endorsement",
    ).length,
  }));

  if (import.meta.env.DEV) {
    const jsonBytes = JSON.stringify(restaurants).length;
    console.info(
      `[+page.server] ${restaurants.length} restaurants, ~${Math.round(jsonBytes / 1024)}KB payload`,
    );
  }

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
    restaurant_count: row.restaurant_count,
  }));

  // Total comments processed = sum of per-thread comment_count over published threads.
  const statsResult = await db.execute(sql`
		SELECT COALESCE(SUM(t.comment_count), 0)::int AS total_comments_processed
		FROM threads t
		WHERE t.included_in_publish = true
	`);

  const statsRow = (statsResult.rows[0] ?? {}) as Partial<StatsRow>;

  const meta: RestaurantData["meta"] = {
    source_threads: sourceThreads,
    total_comments_processed: statsRow.total_comments_processed ?? 0,
  };

  const pageMeta = buildPageMeta(
    urlState,
    restaurants,
    meta,
    pageOrigin,
    pathname,
    threadSubredditLookup(sourceThreads),
  );

  return {
    dataset: {
      restaurants,
      meta,
    },
    urlState,
    pageMeta,
    pageOrigin,
  };
}

export const load: PageServerLoad = ({ url }) => {
  // Read URL in the load body so SvelteKit tracks search-param dependencies.
  // The DB work is returned as a promise so the explorer shell can stream
  // before Postgres finishes — first paint is SSR/DB-bound, not client nav.
  const urlState = parseSearchParams(url.searchParams);
  const home = loadHomePage(urlState, url.origin, url.pathname);
  void home.catch(() => {});
  return { home };
};
