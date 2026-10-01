-- Ranking preview for issue #151: the default leaderboard before and after the
-- co-mention split + voices shrink. Read-only; safe against any DB.
--
--   psql "$DATABASE_URL" -f scripts/rank_preview.sql
--
-- Prints the old top 20 and the new top 20 (score, voices, mentions) and a summary of
-- the new top 10. `voices` is the payload's mention_count; `mentions` counts every row.
-- Keep the `after` math in step with
-- src/routes/+page.server.ts (comment_spread / ranked_mentions / final SELECT) and
-- weightedAggregates in src/lib/restaurants/stores.svelte.ts.
--
-- Co-mentions are counted only over mentions that pass countsTowardScore
-- (published threads AND role = 'primary' OR names_restaurant IS NOT FALSE).

\pset pager off

CREATE TEMP VIEW preview_scored AS
WITH published_mentions AS (
	SELECT m.*
	FROM mentions m
	JOIN threads t ON t.id = m.thread_id
	WHERE t.included_in_publish = true
		AND (m.role = 'primary' OR m.names_restaurant IS NOT FALSE)
),
comment_spread AS (
	SELECT thread_id, comment_id, COUNT(DISTINCT restaurant_id) AS co_mentions
	FROM published_mentions
	GROUP BY thread_id, comment_id
),
ranked_mentions AS (
	SELECT
		pm.*,
		1.0::float8 / cs.co_mentions AS credit,
		CASE
			WHEN COALESCE(NULLIF(TRIM(pm.author), ''), '[deleted]') IN ('[deleted]', '[removed]')
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
per_restaurant AS (
	SELECT
		r.id,
		r.name,
		COALESCE(r.chain_confidence, 'unknown') AS chain_confidence,
		(r.lat IS NOT NULL AND r.lng IS NOT NULL) AS mapped,
		COALESCE(SUM(rm.score * POWER(0.5, rm.author_rank - 1)), 0) AS old_sum,
		COALESCE(SUM(rm.score * rm.credit * POWER(0.5, rm.author_rank - 1)), 0) AS new_sum,
		COUNT(*) FILTER (WHERE rm.author_rank = 1)::int AS voices,
		COUNT(*)::int AS mentions,
		MAX(rm.comment_date) AS newest
	FROM restaurants r
	INNER JOIN ranked_mentions rm ON rm.restaurant_id = r.id
	WHERE r.status <> 'excluded'
	GROUP BY r.id, r.name, r.chain_confidence, r.lat, r.lng
)
SELECT
	*,
	old_sum::int AS old_score,
	ROUND((new_sum * voices / (voices + 2.0))::numeric)::int AS new_score
FROM per_restaurant;

\echo '== BEFORE: aggregate_score DESC, name ASC (top 20) =='
SELECT ROW_NUMBER() OVER () AS rank, name, old_score AS score, voices, mentions, chain_confidence, mapped
FROM (SELECT * FROM preview_scored ORDER BY old_score DESC, name ASC LIMIT 20) t;

\echo '== AFTER: split + voices/(voices+2.0); score DESC, voices DESC, newest DESC, name ASC (top 20) =='
SELECT ROW_NUMBER() OVER () AS rank, name, new_score AS score, voices, mentions, chain_confidence, mapped
FROM (
	SELECT * FROM preview_scored
	ORDER BY new_score DESC, voices DESC, newest DESC NULLS LAST, name ASC
	LIMIT 20
) t;

\echo '== AFTER top 10: chains, single-voice rows, unmapped =='
SELECT
	COUNT(*) FILTER (WHERE chain_confidence = 'likely_chain') AS chains,
	COUNT(*) FILTER (WHERE voices = 1) AS single_voice,
	COUNT(*) FILTER (WHERE NOT mapped) AS unmapped
FROM (
	SELECT * FROM preview_scored
	ORDER BY new_score DESC, voices DESC, newest DESC NULLS LAST, name ASC
	LIMIT 10
) t;

\echo '== Distinct scores across all rows (before vs after) =='
SELECT COUNT(*) AS restaurants, COUNT(DISTINCT old_score) AS distinct_old, COUNT(DISTINCT new_score) AS distinct_new
FROM preview_scored;
