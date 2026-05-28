import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleClient | null = null;

function getDb(): DrizzleClient {
	if (_db) return _db;
	if (!env.DATABASE_URL) {
		throw new Error(
			'DATABASE_URL is not set. Copy .env.example to .env and fill in the Railway Postgres connection string.'
		);
	}
	// Railway's external proxy uses a self-signed cert and pg v9 defaults to verify-full
	// even with sslmode=require; relax verification when going through the proxy.
	// Internal-network connections from Railway services don't need SSL at all.
	const usingProxy = env.DATABASE_URL.includes('proxy.rlwy.net');
	const pool = new pg.Pool({
		connectionString: env.DATABASE_URL,
		ssl: usingProxy ? { rejectUnauthorized: false } : undefined
	});
	_db = drizzle(pool, { schema });
	return _db;
}

// Proxy preserves the `db.execute(...)` / `db.select(...)` call surface while
// deferring the env-var check (and pool creation) to first access. This lets
// `vite build` analyze server modules without a live database — only an actual
// request, or any other access to a `db` property, triggers the connection.
export const db = new Proxy({} as DrizzleClient, {
	get(_target, prop, receiver) {
		const client = getDb();
		const value = Reflect.get(client as object, prop, receiver);
		return typeof value === 'function' ? value.bind(client) : value;
	}
});

export { schema };
export type { Thread, NewThread, Restaurant, NewRestaurant, Mention, NewMention } from './schema';
