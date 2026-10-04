// Explicit loopback database only; fixtures live in an isolated schema and are removed afterward.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('$lib/server/db', () => ({ db: new Proxy({}, { get(_, key) { const value = holder.db[key]; return typeof value === 'function' ? value.bind(holder.db) : value; } }) }));
import { getPublicRestaurant, listPublicRestaurants, getPublicMentions, getPublicRestaurantRedirect } from './public-restaurant';
import { publicHubs, sitemapXml, restaurantStructuredData, jsonLd } from './public-pages';
import { takeDownMention } from './admin';
import { commentSearchQuery } from './comment-search';
import { GET as api } from '../../../routes/api/r/[slug].json/+server';
import { load as detail } from '../../../routes/r/[slug]/+page.server';
import { loadHub } from './hub-load';
import { load as explorer } from '../../../routes/+page.server';

const url = process.env.PUBLIC_RESTAURANT_TEST_DATABASE_URL;
const schema = `public_pages_${randomUUID().replaceAll('-', '')}`;
let client: pg.Client | null = null;
describe.skipIf(!url)('public pages PostgreSQL publication and moderation', () => {
	beforeAll(async () => {
		if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname)) throw new Error('Explicit loopback fixture DB required');
		client = new pg.Client({ connectionString: url }); await client.connect();
		await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
		const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
		for (const entry of journal.entries) await client.query(readFileSync(`drizzle/${entry.tag}.sql`, 'utf8').replaceAll('"public".', `"${schema}".`));
		holder.db = drizzle(client);
		await client.query(`INSERT INTO threads (id,subreddit,post_id,url,title,comment_count,max_depth,included_in_publish)
			VALUES ('test-one','test','one','https://reddit.com/r/test/comments/one','Synthetic',10,1,true),
			('test-two','test','two','https://reddit.com/r/test/comments/two','Synthetic',10,1,true),
			('test-private','test','private','https://reddit.com/r/test/comments/private','Private',10,1,false)`);
		for (let id = 1; id <= 12; id++) {
			await client.query('INSERT INTO restaurants(id,name,slug,location,cuisine,lat,lng,status,chain_confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
				[id, `Fixture ${id}`, `fixture-${id}`, 'Santa Ana', 'Mexican', id === 7 ? null : 33.7, id === 7 ? null : -117.8, id === 8 ? 'excluded' : 'active', id === 9 ? 'likely_chain' : 'unknown']);
			for (let n = 1; n <= 2; n++) {
				const body = id === 6 ? 'Thin recommendation.' : `${Array(30).fill(`flavor${id}${n}`).join(' ')} patio_unique_${id}_${n}`;
				await client.query('INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role,status,names_restaurant,comment_date,permalink) VALUES($1,$2,$3,$4,$5,10,$6,$7,$8,$9,$10)',
					[id, id === 10 ? 'test-private' : n === 1 ? 'test-one' : 'test-two', `c${id}${n}`, `author${id}${n}`, body, id === 12 ? 'endorsement' : 'primary', id === 11 ? 'taken_down' : 'published', id !== 12, n === 1 ? '2020-01-01' : '2025-01-01', `https://reddit.com/r/test/comments/one/c${id}${n}`]);
			}
		}
		// One shared, very long comment is not unique evidence for either attached restaurant.
		for (const id of [1, 6, 9]) await client.query("INSERT INTO mentions(restaurant_id,thread_id,comment_id,author,body,score,role,comment_date) VALUES($1,'test-one','shared','shared_author',$2,10,'primary','2026-01-01')", [id, `shared_secret ${'great flavor '.repeat(80)}hidden_tail`]);
	}, 30000);
	afterAll(async () => { if (client) { try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await client.end(); } } });
	it('enforces all public gates, keeps unknown confidence and preserves API empty arrays', async () => {
		for (const id of [8, 9, 10, 11, 12]) {
			expect(await getPublicRestaurant(`fixture-${id}`)).toBeNull();
			expect(await getPublicMentions(`fixture-${id}`)).toEqual([]);
		}
		expect((await getPublicRestaurant('fixture-1'))?.indexable).toBe(true);
		expect((await getPublicRestaurant('fixture-6'))?.indexable).toBe(false);
		expect((await getPublicRestaurant('fixture-7'))?.indexable).toBe(false);
		expect(await getPublicRestaurant("' OR true --")).toBeNull();
		const related = (await getPublicMentions('fixture-1')).find(m => m.comment_id === 'shared')!.other_places!;
		expect(related.map(r => r.slug)).toEqual(['fixture-6']);
	});
	it('keeps removed and unnamed evidence out of explorer data and eager metadata', async () => {
		for (const id of [11, 12]) {
			const loaded = await explorer({ url: new URL(`https://example.test/?restaurant=fixture-${id}`), setHeaders() {} } as never) as any;
			expect(JSON.stringify(loaded.pageMeta)).not.toContain(`Fixture ${id}`);
			const home = await loaded.home;
			expect(JSON.stringify(home)).not.toContain(`patio_unique_${id}`);
		}
	});
	it('bounds standalone data and JSON-LD while retaining full interactive API bodies', async () => {
		const restaurant = (await getPublicRestaurant('fixture-1'))!;
		expect(JSON.stringify(restaurant)).not.toContain('hidden_tail');
		expect(JSON.stringify(restaurantStructuredData(restaurant, 'https://example.test'))).not.toContain('hidden_tail');
		expect((await getPublicMentions('fixture-1')).find(m => m.comment_id === 'shared')!.body).toContain('hidden_tail');
	});
	it('propagates a shared takedown through API, load data, search, hubs, sitemap and dates', async () => {
		expect(await takeDownMention('test-one', 'shared')).toBe(3);
		const restaurant = (await getPublicRestaurant('fixture-1'))!;
		expect(restaurant.lastmod).toBe('2025-01-01T00:00:00.000Z');
		const headers: Record<string,string> = {};
		const loaded = await detail({ params: { slug: 'fixture-1' }, setHeaders: (h: Record<string,string>) => Object.assign(headers, h) } as never);
		expect(JSON.stringify(loaded)).not.toContain('shared_secret');
		expect(headers['cache-control']).toBe('public, s-maxage=300, must-revalidate');
		const response = await api({ params: { slug: 'fixture-1' } } as never);
		expect(await response.text()).not.toContain('shared_secret');
		const query = new PgDialect().sqlToQuery(commentSearchQuery('shared_secret', 50));
		expect((await client!.query(query.sql, query.params)).rows).toEqual([]);
		const hub = await loadHub('city', 'santa-ana', () => {});
		expect(JSON.stringify(hub)).not.toContain('shared_secret');
		const catalog = await listPublicRestaurants();
		expect(sitemapXml(catalog, 'https://example.test')).not.toContain('2026-01-01');
		// Losing a distinct comment changes eligibility without changing restaurant visibility.
		await takeDownMention('test-two', 'c12');
		expect((await getPublicRestaurant('fixture-1'))!.indexable).toBe(false);
		const reduced = await listPublicRestaurants();
		expect(sitemapXml(reduced, 'https://example.test')).not.toContain('/r/fixture-1<');
		expect(publicHubs(reduced, 'city')[0].indexable).toBe(false);
		await takeDownMention('test-one', 'c11');
		expect(await getPublicRestaurant('fixture-1')).toBeNull();
		await expect(detail({ params: { slug: 'fixture-1' }, setHeaders() {} } as never)).rejects.toMatchObject({ status: 404 });
	});
	it('executes the ingestion SQL without resurrecting removed or newly attached copies', async () => {
		const source = readFileSync('scripts/reddit_pipeline.py', 'utf8');
		const inserts = [...source.matchAll(/INSERT INTO mentions[\s\S]*?RETURNING id/g)].map(m => m[0]);
		expect(inserts).toHaveLength(2);
		for (const [index, insert] of inserts.entries()) {
			let parameter = 0;
			const statement = insert.replace(/%s/g, () => `$${++parameter}`);
			const params = [2, 'test-one', 'c11', null, 'synthetic', 'republished_secret', 10,
				...(index === 1 ? ['dish_rec'] : []), '2020-01-01', true];
			await client!.query(statement, params);
			const status = await client!.query("SELECT status FROM mentions WHERE restaurant_id=2 AND thread_id='test-one' AND comment_id='c11'");
			expect(status.rows[0].status).toBe('taken_down');
			expect(JSON.stringify(await getPublicMentions('fixture-2'))).not.toContain('republished_secret');
		}
		const cleanup = source.match(/"(DELETE FROM mentions WHERE thread_id = %s AND status = 'published')"/)![1];
		await client!.query(cleanup.replace('%s', '$1'), ['test-one']);
		expect((await client!.query("SELECT COUNT(*)::int AS count FROM mentions WHERE thread_id='test-one' AND comment_id='c11' AND status='taken_down'")).rows[0].count).toBe(2);
	});

	it('does not invent aliases and redirects only a verified merge to a public winner', async () => {
		expect(await getPublicRestaurantRedirect('invented-alias')).toBeNull();
		await client!.query("INSERT INTO merge_log(winner_id,loser_id,loser_slug,loser_name,moved_mention_ids,deleted_mention_ids) VALUES(2,999,'old-fixture','Old fixture','{}','{}')");
		expect(await getPublicRestaurantRedirect('old-fixture')).toBe('fixture-2');
		await expect(detail({ params: { slug: 'old-fixture' }, setHeaders() {} } as never)).rejects.toMatchObject({ status: 308, location: '/r/fixture-2' });
	});
});
