import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

if (!env.DATABASE_URL) {
	throw new Error(
		'DATABASE_URL is not set. Copy .env.example to .env and fill in the Railway Postgres connection string.'
	);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { schema };
export type { Thread, NewThread, Restaurant, NewRestaurant, Mention, NewMention } from './schema';
