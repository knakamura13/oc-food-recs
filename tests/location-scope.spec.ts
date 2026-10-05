import { expect, test } from '@playwright/test';

test.skip(process.env.LOCATION_SCOPE_E2E !== '1', 'Requires isolated scope fixtures');
for (const width of [320, 1280]) {
	test(`${width}px multiple-location SSR labels and links remain usable`, async ({ browser }, info) => {
		test.skip((width === 1280) !== (info.project.name === 'Desktop Chrome'));
		const context = await browser.newContext({ javaScriptEnabled: false, baseURL: String(test.info().project.use.baseURL), viewport: { width, height: 844 } });
		const page = await context.newPage();
		await page.goto('/r/a-s-burgers');
		await expect(page.getByText('Multiple locations — Dana Point and San Juan Capistrano')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Dana Point — 34344 Pacific Coast Hwy' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'San Juan Capistrano — 28698 Camino Capistrano' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Find on Google Maps' })).toHaveCount(0);
		expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex,follow');
		const structured = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}');
		expect(structured['@graph'][0].address).toBeUndefined(); expect(structured['@graph'][0].geo).toBeUndefined();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		const link = page.getByRole('link', { name: 'Dana Point — 34344 Pacific Coast Hwy' });
		await link.focus(); await expect(link).toBeFocused();
		await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'San Juan Capistrano — 28698 Camino Capistrano' })).toBeFocused();
		await page.screenshot({ path: info.outputPath(`scope-${width}.png`), fullPage: true });
		await context.close();
	});
}
test('scope survives accidental database geography and leaves branch sources independent', async ({ request, page }) => {
	const html = await (await request.get('/r/a-s-burgers')).text();
	expect(html).not.toContain('99 Accidental Pin St');
	expect(html).toContain('1 source comment from 1 contributor across 1 thread');
	const sources = await (await request.get('/api/r/a-s-burgers.json')).json(); expect(sources).toHaveLength(1);
	const branch = await (await request.get('/api/r/a-s-burgers-2.json')).json(); expect(branch).toHaveLength(1); expect(branch[0].comment_id).not.toBe(sources[0].comment_id);
	expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/r/a-s-burgers<');
	await page.goto('/?restaurant=a-s-burgers');
	await page.getByRole('button', { name: /Include.*unmapped restaurant/ }).click();
	const row = page.getByRole('link', { name: /^Synthetic Multi Kitchen/ });
	if (await row.getAttribute('aria-expanded') !== 'true') await row.click();
	await expect(page.locator('.drawer').getByText(/Multiple locations/)).toBeVisible();
	await expect(page.locator('.drawer').getByText(/isn’t pinned on the map yet/)).toHaveCount(0);
	await expect(page.locator('.drawer').getByRole('link', { name: /Open.*in Google Maps/ })).toHaveCount(0);
	await expect(page.locator('.drawer').getByRole('button', { name: 'Show on map' })).toHaveCount(0);
});
