import { expect, test } from '@playwright/test';
import pg from 'pg';

test.skip(process.env.PUBLIC_PAGES_E2E !== '1', 'Requires dedicated synthetic public-page fixtures');
test.beforeEach(async ({ page }) => { await page.route('**/api/events', route => route.fulfill({ status: 204 })); });

for (const width of [320, 390, 1280]) {
	test(`${width}px SSR detail works without JavaScript and keeps source links reachable`, async ({ browser }, info) => {
		test.skip((width === 1280) !== (info.project.name === 'Desktop Chrome'));
		const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 } });
		const page = await context.newPage();
		await page.goto(`${test.info().project.use.baseURL ?? 'http://localhost:5174'}/r/public-fixture-1`);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Fixture Kitchen');
		await expect(page.getByRole('heading', { level: 2, name: 'What the community says' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Read the full comment on Reddit →' }).first()).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		await page.screenshot({ path: info.outputPath(`detail-${width}.png`), fullPage: true, scale: 'css' });
		await page.goto(`${test.info().project.use.baseURL ?? 'http://localhost:5174'}/city/santa-ana`);
		await expect(page.getByRole('heading', { level: 1, name: 'Restaurants in Santa Ana' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Read the full comment on Reddit' }).first()).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		await page.screenshot({ path: info.outputPath(`hub-${width}.png`), fullPage: true, scale: 'css' });
		await context.close();
	});
}

test('initial HTML, structured data and sitemap use the shared publication contract', async ({ request, page }) => {
	const response = await request.get('/r/public-fixture-1');
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe('public, s-maxage=300, must-revalidate');
	const html = await response.text();
	expect(html).toContain('index,follow');
	expect(html).toContain('Last mentioned Jan 2025');
	expect(html).not.toContain('__FULL_BODY_TAIL__');
	expect(html).toContain('application/ld+json');
	await page.goto('/r/public-fixture-1');
	expect(await page.evaluate(() => (window as any).__injected)).toBeUndefined();
	const structured = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}');
	expect(structured['@graph'][0]['@type']).toBe('Restaurant');
	expect(JSON.stringify(structured)).not.toMatch(/aggregateRating|reviewRating/);
	for (const id of [6, 7, 14]) {
		const thin = await request.get(`/r/public-fixture-${id}`);
		expect(thin.status()).toBe(200); expect(await thin.text()).toContain('noindex,follow');
	}
	for (const id of [8, 9, 10, 11, 12, 15, 999]) {
		const hidden = await request.get(`/r/public-fixture-${id}`);
		expect(hidden.status()).toBe(404); expect(hidden.headers()['cache-control']).toBe('no-store');
		expect(await hidden.text()).not.toContain('unique_fixture');
		expect(await (await request.get(`/api/r/public-fixture-${id}.json`)).json()).toEqual([]);
	}
	const nullDate = await request.get('/r/public-fixture-13');
	expect(await nullDate.text()).toContain('Mention date unknown');
	const sitemap = await (await request.get('/sitemap.xml')).text();
	const xml = await page.evaluate(text => {
		const document = new DOMParser().parseFromString(text, 'application/xml');
		return { error: document.querySelector('parsererror')?.textContent, urls: [...document.querySelectorAll('loc')].map(el => el.textContent) };
	}, sitemap);
	expect(xml.error).toBeUndefined();
	expect(xml.urls).toContain('https://oc-food.up.railway.app/r/public-fixture-1');
	expect(xml.urls).toContain('https://oc-food.up.railway.app/city/santa-ana');
	expect(xml.urls).toContain('https://oc-food.up.railway.app/cuisine/mexican');
	for (const id of [6, 7, 8, 9, 10, 11, 12, 14, 15]) expect(sitemap).not.toContain(`/r/public-fixture-${id}<`);
	expect(sitemap).not.toContain('/city/irvine');
	const robots = await (await request.get('/robots.txt')).text();
	expect(robots).toContain('Disallow: /api/'); expect(robots).toContain('Disallow: /admin/');
	expect(robots).toContain('Sitemap: https://oc-food.up.railway.app/sitemap.xml');
	for (const path of ['/city/santa-ana', '/cuisine/mexican']) expect(await (await request.get(path)).text()).toContain('index,follow');
	expect(await (await request.get('/city/irvine')).text()).toContain('noindex,follow');
	expect((await request.get('/city/not-a-real-category')).status()).toBe(404);
	expect(await (await request.get('/?restaurant=public-fixture-1')).text()).toContain('noindex,follow');
});

test('ordinary clicks and keyboard open the drawer; modified clicks open the canonical detail', async ({ page, context }) => {
	await page.goto('/');
	const link = page.locator('.row-toggle').first();
	await expect(link).toHaveAttribute('href', /^\/r\//);
	await link.focus(); await page.keyboard.press('Enter');
	await expect(page.locator('.row.expanded')).toHaveCount(1);
	await link.click(); await expect(page.locator('.row.expanded')).toHaveCount(0);
	await link.focus(); await page.keyboard.press('Space'); await expect(page.locator('.row.expanded')).toHaveCount(1);
	await page.keyboard.press('Space'); await expect(page.locator('.row.expanded')).toHaveCount(0);
	const [opened] = await Promise.all([context.waitForEvent('page'), link.click({ modifiers: ['ControlOrMeta'] })]);
	await opened.waitForURL(/\/r\//);
	await opened.waitForLoadState();
	expect(opened.url()).toContain('/r/'); await opened.close();
	const [middle] = await Promise.all([context.waitForEvent('page'), link.click({ button: 'middle' })]);
	await middle.waitForURL(/\/r\//); await middle.close();
});

test('a fixture comment takedown disappears from SSR HTML, serialized data, JSON-LD, API, search and hub preview', async ({ request }, info) => {
	test.skip(info.project.name !== 'Desktop Chrome');
	const target = new URL(process.env.DATABASE_URL!);
	if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/fixture/.test(target.pathname)) throw new Error('Dedicated loopback fixture DB required');
	const client = new pg.Client({ connectionString: target.href }); await client.connect();
	try {
		await client.query("UPDATE mentions SET status = 'taken_down' WHERE thread_id = 'orangecounty-public1' AND comment_id = 'removal-fixture'");
		for (const id of [16, 17]) {
			const response = await request.get(`/r/public-fixture-${id}`);
			expect(response.status()).toBe(404); expect(await response.text()).not.toContain('removal_fixture_secret');
			expect(await (await request.get(`/api/r/public-fixture-${id}.json`)).json()).toEqual([]);
		}
		expect(await (await request.get('/api/search?q=removal_fixture_secret')).text()).not.toContain('removal_fixture_secret');
		expect(await (await request.get('/city/santa-ana')).text()).not.toContain('removal_fixture_secret');
		expect(await (await request.get('/sitemap.xml')).text()).not.toContain('public-fixture-16');
	} finally {
		await client.query("UPDATE mentions SET status = 'published' WHERE thread_id = 'orangecounty-public1' AND comment_id = 'removal-fixture'");
		await client.end();
	}
});
