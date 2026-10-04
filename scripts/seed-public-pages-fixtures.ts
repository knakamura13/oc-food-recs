import 'dotenv/config';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const target = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !/fixture|public_pages/.test(target.pathname)) {
	throw new Error('Public-page fixture seed requires a dedicated loopback fixture database');
}
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
	await client.query('BEGIN');
	await client.query('TRUNCATE mentions,restaurants,threads RESTART IDENTITY CASCADE');
	for (const [id, included] of [['orangecounty-public1', true], ['orangecounty-public2', true], ['orangecounty-private1', false]] as const) {
		await client.query('INSERT INTO threads(id,subreddit,post_id,url,title,comment_count,max_depth,included_in_publish) VALUES($1,$2,$3,$4,$5,40,2,$6)',
			[id, 'orangecounty', id.split('-')[1], `https://www.reddit.com/r/orangecounty/comments/${id.split('-')[1]}/`, 'Synthetic source thread', included]);
	}
	for (let id = 1; id <= 17; id++) {
		await client.query('INSERT INTO restaurants(id,name,slug,location,cuisine,lat,lng,status,chain_confidence,street) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
			[id, id === 1 ? 'Fixture Kitchen with a deliberately long restaurant name for responsive reading' : `Fixture Kitchen ${id}`,
				`public-fixture-${id}`, id === 13 ? 'Irvine' : 'Santa Ana', 'Mexican', id === 7 ? null : 33.7455, id === 7 ? null : -117.8677,
				id === 8 ? 'excluded' : 'active', id === 9 ? 'likely_chain' : 'unknown', id === 1 ? '123 Synthetic Street' : null]);
		if ([15, 16, 17].includes(id)) continue;
		for (let n = 1; n <= 2; n++) {
			let body = `${Array(30).fill(n === 1 ? 'tasty' : 'delicious').join(' ')} unique_fixture_${id}_${n}`;
			if (id === 6) body = 'A short recommendation.';
			if (id === 14) body = `${Array(30).fill('duplicate').join(' ')} duplicated_body`;
			if (id === 1 && n === 1) body = `</script><script>window.__injected=true</script> ${'warm tacos '.repeat(90)} __FULL_BODY_TAIL__`;
			await client.query('INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role,status,names_restaurant,comment_date,permalink) VALUES($1,$2,$3,$4,$5,20,$6,$7,$8,$9,$10)',
				[id, id === 10 ? 'orangecounty-private1' : `orangecounty-public${n}`, `comment${id}${n}`,
					id === 13 ? '[deleted]' : `fixture_author_${id}_${n}`, body, id === 12 ? 'endorsement' : 'primary', id === 11 ? 'taken_down' : 'published', id !== 12,
					id === 13 ? null : n === 1 ? '2019-01-01T00:00:00Z' : '2025-01-01T00:00:00Z', `https://www.reddit.com/r/orangecounty/comments/public${n}/_/comment${id}${n}/`]);
		}
	}
	for (const id of [16, 17]) await client.query("INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role,comment_date,permalink) VALUES($1,'orangecounty-public1','removal-fixture','fixture_author','removal_fixture_secret synthetic shared recommendation',15,'primary','2026-01-01','https://www.reddit.com/r/orangecounty/comments/public1/_/removal-fixture/')", [id]);
	await client.query('COMMIT');
	console.log('Seeded 17 synthetic public-page restaurants in dedicated loopback fixture DB.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
