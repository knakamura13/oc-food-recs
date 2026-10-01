import { sql } from 'drizzle-orm';

/**
 * A mention feeds scores, counts and the drawer when it is the primary comment or its body
 * names the restaurant (`mentions.names_restaurant`). NULL means the backfill has not reached
 * the row yet and counts, so deploying before the backfill leaves rankings unchanged.
 */
export function countsTowardScore(alias: string) {
	const m = sql.raw(alias);
	return sql`(${m}.role = 'primary' OR ${m}.names_restaurant IS NOT FALSE)`;
}
