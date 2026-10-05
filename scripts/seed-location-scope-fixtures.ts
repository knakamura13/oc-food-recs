import 'dotenv/config';
import pg from 'pg';

const target = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(target.hostname) || !['/issue155_scope_pipeline', '/issue155_scope_e2e'].includes(target.pathname)) {
	throw new Error('Location scope fixtures require a dedicated loopback scope test database');
}
const client = new pg.Client({ connectionString: target.href });
await client.connect();
try {
	await client.query('BEGIN');
	await client.query('TRUNCATE mentions, restaurant_aliases, restaurants, threads RESTART IDENTITY CASCADE');
	await client.query("INSERT INTO threads(id,subreddit,post_id,url,title,comment_count,max_depth) VALUES ('synthetic-scope','synthetic','scope','https://example.com/synthetic','Synthetic scope fixture',2,1)");
	await client.query("INSERT INTO restaurants(name,slug,location,street,lat,lng) VALUES ('Synthetic Multi Kitchen','a-s-burgers','Dana Point','99 Accidental Pin St',33.46,-117.69),('Synthetic Branch Kitchen','a-s-burgers-2','San Juan Capistrano','2 Fictional Way',33.54,-117.67)");
	await client.query("INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role,names_restaurant,comment_date) SELECT r.id,'synthetic-scope','scope-fixture-'||r.slug,'synthetic_scope_author','A synthetic recommendation that describes two different locations with sufficiently detailed invented food experience for testing only.',10,'primary',true,'2025-01-01' FROM restaurants r");
	await client.query('COMMIT');
} catch (error) {
	await client.query('ROLLBACK'); throw error;
} finally { await client.end(); }
