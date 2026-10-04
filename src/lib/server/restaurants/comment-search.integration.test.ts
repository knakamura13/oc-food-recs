// Run with COMMENT_SEARCH_TEST_DATABASE_URL pointing at a disposable loopback PostgreSQL DB.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';
import { commentSearchQuery } from './comment-search';

const url = process.env.COMMENT_SEARCH_TEST_DATABASE_URL;
const schema = `comment_search_${randomUUID().replaceAll('-', '')}`;
const client = url ? new pg.Client({ connectionString: url }) : null;
let connected = false;
let schemaCreated = false;

describe.skipIf(!url)('comment attribute search PostgreSQL integration', () => {
	beforeAll(async () => {
		if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url!).hostname)) {
			throw new Error('Comment search integration tests require an explicit loopback database');
		}
		await client!.connect();
		connected = true;
		await client!.query(`CREATE SCHEMA "${schema}"`);
		schemaCreated = true;
		await client!.query(`SET search_path TO "${schema}"`);
		const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
		for (const entry of journal.entries) {
			// Historical FK migrations qualify public explicitly; keep every fixture in our schema.
			const migration = readFileSync(`drizzle/${entry.tag}.sql`, 'utf8').replaceAll('"public".', `"${schema}".`);
			await client!.query(migration);
		}
		await client!.query(`
			INSERT INTO threads (id, subreddit, post_id, url, title, comment_count, max_depth, included_in_publish)
			VALUES ('public', 'test', '1', 'https://example.test/1', 'Synthetic fixture', 1, 1, true),
			       ('private', 'test', '2', 'https://example.test/2', 'Unpublished fixture', 1, 1, false);
			INSERT INTO restaurants (id, name, slug, status, chain_confidence)
			VALUES (1, 'Patio Place', 'patio-place', 'active', 'unknown'),
			       (2, 'Excluded Place', 'excluded-place', 'excluded', 'likely_chain'),
			       (3, 'Queued Place', 'queued-place', 'pending_review', 'unknown'),
			       (4, 'Unpublished Place', 'unpublished-place', 'active', 'unknown'),
			       (5, 'Removed Place', 'removed-place', 'active', 'unknown'),
			       (6, 'Unrelated Place', 'unrelated-place', 'active', 'unknown'),
		       (7, 'Nonadjacent Place', 'nonadjacent-place', 'active', 'independent'),
		       (8, 'Hidden Confidence', 'hidden-confidence', 'pending_review', 'likely_chain');
			INSERT INTO mentions (id, restaurant_id, thread_id, comment_id, author, body, score, role, status, names_restaurant)
			VALUES (1, 1, 'public', '1', 'synthetic', 'A relaxing patio with happy hour and dumplings.', 10, 'primary', 'published', true),
			       (2, 1, 'public', '2', 'synthetic', 'Happy hour patio patio patio patio patio.', 20, 'primary', 'published', true),
			       (3, 2, 'public', '3', 'synthetic', 'Happy hour patio.', 99, 'primary', 'published', true),
			       (4, 3, 'public', '4', 'synthetic', 'Happy hour patio.', 5, 'primary', 'published', true),
			       (5, 4, 'private', '5', 'synthetic', 'Happy hour patio.', 99, 'primary', 'published', true),
			       (6, 5, 'public', '6', 'synthetic', 'Happy hour patio.', 99, 'primary', 'taken_down', true),
			       (7, 6, 'public', '7', 'synthetic', 'Happy hour patio.', 99, 'endorsement', 'published', false),
		       (8, 7, 'public', '8', 'synthetic', 'Happy diners stay for an hour on the patio.', 5, 'primary', 'published', true),
		       (9, 8, 'public', '9', 'synthetic', 'Happy hour patio.', 99, 'primary', 'published', true);
		`);
	}, 30_000);

	afterAll(async () => {
		if (!client || !connected) return;
		try {
			if (schemaCreated) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
		} finally {
			await client.end();
		}
	});

	async function search(q: string, limit = 50) {
		const compiled = new PgDialect().sqlToQuery(commentSearchQuery(q, limit));
		return (await client!.query(compiled.sql, compiled.params)).rows;
	}

	it('keeps unknown queued rows while enforcing restaurant, thread, mention and naming gates', async () => {
		expect((await search('patio')).map((row) => row.slug).sort()).toEqual(['nonadjacent-place', 'patio-place', 'queued-place']);
	});

	it('matches English lexemes and quoted phrase positions without fuzzy prose matches', async () => {
		expect((await search('dumpling')).map((row) => row.slug)).toEqual(['patio-place']);
		expect(await search('pattoo')).toEqual([]);
		expect((await search('"happy hour"')).map((row) => row.slug).sort()).toEqual(['patio-place', 'queued-place']);
		expect((await search('happy hour')).map((row) => row.slug).sort()).toEqual(['nonadjacent-place', 'patio-place', 'queued-place']);
		expect(await search('the and')).toEqual([]);
	});

	it('returns the strongest quote only once per restaurant with deterministic limits', async () => {
		const rows = await search('patio');
		expect(rows[0]).toMatchObject({ slug: 'patio-place', quote: 'Happy hour patio patio patio patio patio' });
		expect(rows[0].rank).toBeGreaterThan(rows[1].rank);
		expect(rows.filter((row) => row.slug === 'patio-place')).toHaveLength(1);
		expect(await search('patio', 1)).toEqual(rows.slice(0, 1));
		expect(await search('patio')).toEqual(rows);
	});

	it('recomputes the stored vector on updates and returns an excerpt without highlight HTML', async () => {
		await client!.query("UPDATE mentions SET body = '<script>alert(1)</script> <b>omakase</b> on the patio.' WHERE id = 1");
		const rows = await search('omakase');
		expect(rows).toHaveLength(1);
		expect(rows[0].quote).toContain('omakase');
		expect(rows[0].quote).not.toContain('<b>');
		expect(await search('dumpling')).toEqual([]);
	});

	it('creates a generated stored vector and a GIN index', async () => {
		const column = await client!.query("SELECT attgenerated FROM pg_attribute WHERE attrelid = 'mentions'::regclass AND attname = 'body_tsv'");
		expect(column.rows[0].attgenerated).toBe('s');
		const indexes = await client!.query('SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2', [schema, 'mentions']);
		expect(indexes.rows.some((row) => /USING gin \(body_tsv\)/.test(row.indexdef))).toBe(true);
	});
});
