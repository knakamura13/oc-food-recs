import { describe, expect, it } from 'vitest';
import { handle, rewriteFontUrls } from './hooks.server';

function run(method: string, path: string, headers: Record<string, string> = {}) {
	const event = {
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}`, { method, headers })
	};
	const resolve = async () => new Response('ok', { headers: { 'cache-control': 'public, s-maxage=300' } });
	return handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
}

describe('handle cache-control', () => {
	it('never lets shared caches keep non-GET responses', async () => {
		const res = await run('POST', '/api/r/some-slug/report-chain');
		expect(res.headers.get('cache-control')).toBe('private, no-store');
	});

	it('leaves public GET cache headers alone', async () => {
		const res = await run('GET', '/');
		expect(res.headers.get('cache-control')).toBe('public, s-maxage=300');
	});
});

describe('rewriteFontUrls', () => {
	it('points known fonts at hashed immutable assets and leaves unknown ones', () => {
		const out = rewriteFontUrls(
			'a(/fonts/dm-sans-normal-400-latin.woff2) b(/fonts/missing.woff2)'
		);
		expect(out).toMatch(/a\(\/.*assets.*dm-sans-normal-400-latin\.[\w-]+\.woff2\)|a\(.*dm-sans-normal-400-latin.*\.woff2\)/);
		expect(out).toContain('b(/fonts/missing.woff2)');
	});
});
