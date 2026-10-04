import { sql } from 'drizzle-orm';
import { countsTowardScore } from './counts-toward-score';
import { publicRestaurantVisibility } from './public-visibility';

export interface CommentSearchResult {
	slug: string;
	rank: number;
	quote: string;
}

/** Match public comments using English lexemes/quoted phrases, never fuzzy prose similarity. */
export function commentSearchQuery(query: string, limit: number) {
	return sql`
		WITH search AS (
			SELECT websearch_to_tsquery('english', ${query}) AS query
		), best_mentions AS (
			SELECT DISTINCT ON (r.id)
				r.id, r.slug, m.body,
				ts_rank_cd(m.body_tsv, search.query) AS rank
			FROM mentions m
			JOIN restaurants r ON r.id = m.restaurant_id
			JOIN threads t ON t.id = m.thread_id
			CROSS JOIN search
			WHERE m.body_tsv @@ search.query
				AND ${publicRestaurantVisibility('r')}
				AND t.included_in_publish = true
				AND m.status = 'published'
				AND ${countsTowardScore('m')}
			ORDER BY r.id, rank DESC, m.score DESC, m.id ASC
		), limited AS (
			SELECT slug, body, rank
			FROM best_mentions
			ORDER BY rank DESC, slug ASC
			LIMIT ${limit}
		)
		SELECT slug, rank,
			ts_headline('english', body, search.query,
				'StartSel="", StopSel="", MaxWords=35, MinWords=15, MaxFragments=1') AS quote
		FROM limited CROSS JOIN search
		ORDER BY rank DESC, slug ASC
	`;
}
