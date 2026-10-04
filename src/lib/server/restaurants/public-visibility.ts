import { sql } from 'drizzle-orm';

export function publicRestaurantVisibility(alias: string) {
	const r = sql.raw(alias);
	return sql`${r}.status <> 'excluded' AND COALESCE(${r}.chain_confidence, 'unknown') <> 'likely_chain'`;
}

