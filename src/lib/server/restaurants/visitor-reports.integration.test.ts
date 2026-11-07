import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('$lib/server/db', () => ({
	db: new Proxy(
		{},
		{
			get(_, key) {
				const value = holder.db[key];
				return typeof value === 'function' ? value.bind(holder.db) : value;
			},
		}
	),
}));

import { fileVisitorReport, loadVisitorReportQueue, resolveVisitorReport } from './visitor-reports';

const url = process.env.PUBLIC_RESTAURANT_TEST_DATABASE_URL;
const schema = `visitor_reports_${randomUUID().replaceAll('-', '')}`;
let client: pg.Client | null = null;

describe.skipIf(!url)('visitor report review against PostgreSQL', () => {
	beforeAll(async () => {
		if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname)) {
			throw new Error('Explicit loopback fixture DB required');
		}
		client = new pg.Client({ connectionString: url });
		await client.connect();
		await client.query(`CREATE SCHEMA "${schema}"`);
		await client.query(`SET search_path TO "${schema}"`);
		const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
		for (const entry of journal.entries) {
			await client.query(
				readFileSync(`drizzle/${entry.tag}.sql`, 'utf8').replaceAll('"public".', `"${schema}".`)
			);
		}
		holder.db = drizzle(client);
		await client.query(
			`INSERT INTO restaurants (name, slug, location, street, cuisine, lat, lng, status)
			 VALUES
			 ('Closed Spot', 'closed-spot', 'Santa Ana', '1 Main', 'Mexican', 33.7, -117.8, 'active'),
			 ('Detail Spot', 'detail-spot', 'Irvine', '2 Main', 'Ramen', 33.6, -117.7, 'active'),
			 ('Chain Spot', 'chain-spot', 'Tustin', '3 Main', 'Burgers', 33.5, -117.6, 'active'),
			 ('Papa Johns', 'papa-johns', 'Irvine', '4 Main', 'Pizza', 33.4, -117.5, 'active'),
			 ('Papa John''s', 'papa-johns-2', 'Irvine', '4 Main', 'Pizza', 33.4, -117.5, 'active')`
		);
	}, 30000);

	afterAll(async () => {
		if (client) {
			try {
				await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
			} finally {
				await client.end();
			}
		}
	});

	it('hides a closed restaurant without deleting it or touching the chain registry', async () => {
		expect(await fileVisitorReport('closed-spot', 'closed', { note: 'Shut' })).toEqual({ result: 'filed' });
		expect(await fileVisitorReport('closed-spot', 'closed', {})).toEqual({ result: 'already_pending' });
		const pending = await loadVisitorReportQueue();
		const report = pending.pending.find((row) => row.restaurant.slug === 'closed-spot');
		expect(report?.type).toBe('closed');
		expect(await resolveVisitorReport(report!.id, { action: 'accept' })).toEqual({ result: 'accepted' });
		const restaurant = await client!.query(`SELECT status, exclusion_reason FROM restaurants WHERE slug = 'closed-spot'`);
		expect(restaurant.rows[0]).toMatchObject({ status: 'excluded', exclusion_reason: 'closed' });
		expect((await client!.query('SELECT count(*)::int AS n FROM excluded_brands')).rows[0].n).toBe(0);
		expect((await client!.query(`SELECT count(*)::int AS n FROM restaurants WHERE slug = 'closed-spot'`)).rows[0].n).toBe(1);
	});

	it('applies only the accepted detail and records the rejection', async () => {
		expect(
			await fileVisitorReport('detail-spot', 'wrong_detail', { name: 'Detail House', cuisine: 'Noodles' })
		).toEqual({ result: 'filed' });
		const pending = await loadVisitorReportQueue();
		const report = pending.pending.find((row) => row.restaurant.slug === 'detail-spot');
		expect(report?.proposals.map((item) => item.key)).toEqual(['name', 'cuisine']);
		expect(
			await resolveVisitorReport(report!.id, {
				action: 'apply',
				fields: { name: 'accepted', cuisine: 'rejected' },
			})
		).toEqual({ result: 'accepted' });
		const restaurant = await client!.query(`SELECT name, cuisine, status FROM restaurants WHERE slug = 'detail-spot'`);
		expect(restaurant.rows[0]).toMatchObject({ name: 'Detail House', cuisine: 'Ramen', status: 'active' });
		const alias = await client!.query(`SELECT name, source FROM restaurant_aliases WHERE restaurant_id = (SELECT id FROM restaurants WHERE slug = 'detail-spot')`);
		expect(alias.rows[0]).toMatchObject({ name: 'Detail Spot', source: 'visitor_report' });
		const stored = await client!.query(`SELECT status, field_decisions FROM visitor_reports WHERE id = $1`, [report!.id]);
		expect(stored.rows[0].status).toBe('accepted');
		expect(stored.rows[0].field_decisions).toEqual({ name: 'accepted', cuisine: 'rejected' });
	});

	it('dismisses a chain report without hiding the restaurant', async () => {
		expect(await fileVisitorReport('chain-spot', 'chain', {})).toEqual({ result: 'filed' });
		const pending = await loadVisitorReportQueue();
		const report = pending.pending.find((row) => row.restaurant.slug === 'chain-spot');
		expect(await resolveVisitorReport(report!.id, { action: 'dismiss' })).toEqual({ result: 'dismissed' });
		const restaurant = await client!.query(`SELECT status, exclusion_reason FROM restaurants WHERE slug = 'chain-spot'`);
		expect(restaurant.rows[0]).toMatchObject({ status: 'active', exclusion_reason: null });
		expect(await resolveVisitorReport(report!.id, { action: 'accept' })).toEqual({ result: 'already_resolved' });
	});

	it('merges a duplicate into the restaurant the admin keeps and preserves the report', async () => {
		const nearby = await client!.query(
			`SELECT slug FROM restaurants WHERE slug <> 'papa-johns' AND abs(lat - 33.4) < 0.0015 AND abs(lng - -117.5) < 0.0015`
		);
		expect(nearby.rows.map((row) => row.slug)).toContain('papa-johns-2');
		expect(await fileVisitorReport('papa-johns', 'duplicate', { duplicateSlug: 'papa-johns-2' })).toEqual({ result: 'filed' });
		const pending = await loadVisitorReportQueue();
		const report = pending.pending.find((row) => row.restaurant.slug === 'papa-johns');
		expect(report?.duplicate?.name).toBe("Papa John's");
		expect(await resolveVisitorReport(report!.id, { action: 'merge', keep: 'other' })).toEqual({ result: 'accepted' });
		expect((await client!.query(`SELECT count(*)::int AS n FROM restaurants WHERE slug = 'papa-johns'`)).rows[0].n).toBe(0);
		const kept = await client!.query(`SELECT name, status FROM restaurants WHERE slug = 'papa-johns-2'`);
		expect(kept.rows[0]).toMatchObject({ name: "Papa John's", status: 'active' });
		const stored = await client!.query(`SELECT status, field_decisions, subject_name FROM visitor_reports WHERE id = $1`, [report!.id]);
		expect(stored.rows[0].status).toBe('accepted');
		expect(stored.rows[0].subject_name).toBe('Papa Johns');
		expect(stored.rows[0].field_decisions.kept).toBe("Papa John's");
	});
});
