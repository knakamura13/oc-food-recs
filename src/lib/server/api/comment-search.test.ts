import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('$lib/server/db', () => ({ db: { execute } }));

async function request(query = '') {
	const { GET } = await import('../../../routes/api/search/+server');
	return GET({ url: new URL(`https://example.test/api/search${query}`) } as never);
}

describe('GET /api/search', () => {
	beforeEach(() => execute.mockReset().mockResolvedValue({ rows: [] }));

	it('returns no matches for blank input without querying the database', async () => {
		const response = await request('?q=%20%20');
		expect(await response.json()).toEqual([]);
		expect(execute).not.toHaveBeenCalled();
	});

	it.each(['?q=' + 'a'.repeat(161), '?q=patio&limit=0', '?q=patio&limit=101', '?q=patio&limit=1.5', '?q=patio&limit=nope'])(
		'rejects invalid input %s before querying', async (query) => {
			await expect(request(query)).rejects.toMatchObject({ status: 400 });
			expect(execute).not.toHaveBeenCalled();
		}
	);

	it('binds normalized input instead of interpolating query syntax into SQL', async () => {
		const q = "patio'); DROP TABLE mentions; --";
		await request(`?q=${encodeURIComponent(`  ${q}  `)}&limit=12`);
		const compiled = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
		expect(compiled.sql).not.toContain(q);
		expect(compiled.params).toContain(q);
		expect(compiled.params).toContain(12);
	});

	it('returns the minimal plain-text result without public caching', async () => {
		execute.mockResolvedValue({ rows: [{ slug: 'patio-place', rank: 0.1, quote: '<script>patio</script>', private: 'not public' }] });
		const response = await request('?q=patio');
		expect(await response.json()).toEqual([{ slug: 'patio-place', rank: 0.1, quote: '<script>patio</script>' }]);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
