import type { ExplorerPageData } from "$lib/restaurants/explorer-page-data";
import {
	buildEagerPageMeta,
	hasPageMetaFilters,
	type PageMetaAggregates
} from '$lib/restaurants/page-meta';
import { countsTowardScore } from '$lib/server/restaurants/counts-toward-score';
import { db } from "$lib/server/db";
import type {
  ListMention,
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
import { PUBLIC_CACHE_CONTROL } from "$lib/server/cache-control";
import type { PageServerLoad } from "./$types";

interface RestaurantRow {
  name: string;
  slug: string;
  location: string | null;
  street: string | null;
  cuisine: string | null;
  lat: number | null;
  lng: number | null;
  aggregate_score: number;
  mention_count: number;
  source_threads: string[];
  dish_rec_count: number;
  snippet_candidates: SnippetCandidate[];
  mentions: ListMention[];
  chain_confidence: string | null;
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

async function loadHomePage(
  urlState: ReturnType<typeof parseSearchParams>,
  pageOrigin: string,
): Promise<ExplorerPageData> {
  // Restaurants joined with their mentions; aggregated to one row per restaurant.
  // Only restaurants whose mentions belong to published threads are returned.
  const restaurantsResult = await db.execute(sql`
		WITH published_mentions AS (
			SELECT m.*
			FROM mentions m
			JOIN threads t ON t.id = m.thread_id
			WHERE t.included_in_publish = true
				AND m.status = 'published'
				AND ${countsTowardScore('m')}
		),
		comment_spread AS (
			-- How many restaurants each comment names. Counted over published_mentions only,
			-- i.e. mentions that pass countsTowardScore: a restaurant a comment merely
			-- co-occurs with (names_restaurant = false) doesn't dilute the ones it names.
			-- Restaurants later hidden (status = 'excluded') still count: a comment
			-- listing six places, chains included, is a list, not six endorsements.
			SELECT thread_id, comment_id, COUNT(DISTINCT restaurant_id) AS co_mentions
			FROM published_mentions
			GROUP BY thread_id, comment_id
		),
		ranked_mentions AS (
			-- Rank each author's mentions of a restaurant by score so the same
			-- person recommending the same place over and over can't read as
			-- broad consensus. Anonymous authors are each their own voice.
			-- credit splits one comment's upvotes across the restaurants it names.
			SELECT
				pm.*,
				1.0::float8 / cs.co_mentions AS credit,
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
			JOIN comment_spread cs
				ON cs.thread_id = pm.thread_id AND cs.comment_id = pm.comment_id
		),
		restaurant_mentions AS (
			SELECT
				r.id,
				r.name,
				r.slug,
				r.location,
				r.street,
				r.cuisine,
				r.lat,
				r.lng,
				COALESCE(r.chain_confidence, 'unknown') AS chain_confidence,
				-- Geometric ½ decay per repeat (must match REPEAT_AUTHOR_DECAY), each mention
				-- paid its co-mention share (credit = 1/n). The voices shrink is applied below.
				COALESCE(SUM(rm.score * rm.credit * POWER(0.5, rm.author_rank - 1)), 0) AS weighted_sum,
				-- Distinct contributors = count of rank-1 mentions (= voices).
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
							'comment_date', rm.comment_date,
							'credit', rm.credit
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
				) AS snippet_candidates,
				MAX(rm.comment_date) AS newest
			FROM restaurants r
			INNER JOIN ranked_mentions rm ON rm.restaurant_id = r.id
			-- Hide registry-excluded restaurants (chains / corporate groups). Only the
			-- authoritative 'excluded' status is hidden. 'pending_review' stays in the
			-- payload as likely_chain so the Mom & pop chip can filter it.
			WHERE r.status <> 'excluded'
			GROUP BY r.id, r.name, r.slug, r.location, r.street, r.cuisine, r.lat, r.lng, r.chain_confidence
		)
		SELECT
			name,
			slug,
			location,
			street,
			cuisine,
			lat,
			lng,
			chain_confidence,
			-- Shrink low-evidence rows: voices/(voices+2.0) (must match VOICE_SHRINK_PRIOR).
			-- ROUND on numeric rounds half away from zero, like the client's Math.round.
			ROUND((weighted_sum * mention_count / (mention_count + 2.0))::numeric)::int AS aggregate_score,
			mention_count,
			source_threads,
			mentions,
			dish_rec_count,
			snippet_candidates
		FROM restaurant_mentions
		-- Past the first ~100 rows most scores differ by a point or two, so break ties by
		-- breadth, then freshness, before falling back to the name.
		ORDER BY aggregate_score DESC, mention_count DESC, newest DESC NULLS LAST, name ASC
	`);

  const restaurantRows = restaurantsResult.rows as unknown as RestaurantRow[];
  const restaurants: Restaurant[] = restaurantRows.map((row) => ({
    name: row.name,
    slug: row.slug,
    location: row.location,
    street: row.street?.trim() || null,
    cuisine: row.cuisine,
    lat: row.lat,
    lng: row.lng,
    chain_confidence:
      row.chain_confidence === "independent" ||
      row.chain_confidence === "likely_chain" ||
      row.chain_confidence === "unknown"
        ? row.chain_confidence
        : "unknown",
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
      credit: m.credit,
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

  return {
    dataset: {
      restaurants,
      meta,
    },
    urlState,
    pageOrigin,
  };
}

async function loadPageMeta(
	urlState: ReturnType<typeof parseSearchParams>,
	pageOrigin: string,
	pathname: string
) {
	let restaurantName: string | null = null;
	if (urlState.selectedRestaurantSlug) {
		const restaurantResult = await db.execute(sql`
			SELECT r.name
			FROM restaurants r
			WHERE r.slug = ${urlState.selectedRestaurantSlug}
				AND r.status <> 'excluded'
				AND EXISTS (
					SELECT 1
					FROM mentions m
					JOIN threads t ON t.id = m.thread_id
					WHERE m.restaurant_id = r.id
						AND t.included_in_publish = true
				)
			LIMIT 1
		`);
		restaurantName =
			(restaurantResult.rows[0] as { name: string } | undefined)?.name ?? null;
	}

	let aggregates: PageMetaAggregates = {
		restaurantCount: 0,
		threadCount: 0,
		commentCount: 0
	};

	if (!hasPageMetaFilters(urlState)) {
		const [restaurantResult, threadResult] = await Promise.all([
			db.execute(sql`
				SELECT COUNT(DISTINCT r.id)::int AS restaurant_count
				FROM restaurants r
				JOIN mentions m ON m.restaurant_id = r.id
				JOIN threads t ON t.id = m.thread_id
				WHERE t.included_in_publish = true
					AND r.status <> 'excluded'
			`),
			db.execute(sql`
				SELECT
					COUNT(*)::int AS thread_count,
					COALESCE(SUM(t.comment_count), 0)::int AS comment_count
				FROM threads t
				WHERE t.included_in_publish = true
			`)
		]);

		aggregates = {
			restaurantCount: Number(restaurantResult.rows[0]?.restaurant_count ?? 0),
			threadCount: Number(threadResult.rows[0]?.thread_count ?? 0),
			commentCount: Number(threadResult.rows[0]?.comment_count ?? 0)
		};
	}

	return buildEagerPageMeta(
		urlState,
		aggregates,
		pageOrigin,
		pathname,
		restaurantName
	);
}

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  // Edge-cacheable (Railway CDN): data edits reach visitors within the s-maxage window.
  setHeaders({ "cache-control": PUBLIC_CACHE_CONTROL });
  // Read URL in the load body so SvelteKit tracks search-param dependencies.
  // Keep the full dataset streamed while the three summary aggregates resolve,
  // so the page can render crawlable head metadata before the explorer mounts.
  const urlState = parseSearchParams(url.searchParams);
  const home = loadHomePage(urlState, url.origin);
  void home.catch(() => {});
  const pageMeta = await loadPageMeta(urlState, url.origin, url.pathname);
  return { home, pageMeta, pageOrigin: url.origin };
};
