import 'dotenv/config';
import type { Config } from 'drizzle-kit';

// Railway's external proxy uses a self-signed cert, and pg v9 defaults to
// verify-full even for sslmode=require. Accept the cert for local dev /
// migration runs; production traffic over Railway's private network doesn't
// need SSL at all.
const usingRailwayProxy = (process.env.DATABASE_URL ?? '').includes('proxy.rlwy.net');

export default {
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? '',
		ssl: usingRailwayProxy ? { rejectUnauthorized: false } : undefined,
	},
	strict: true,
	verbose: true,
} satisfies Config;
