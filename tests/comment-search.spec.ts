import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
});

test('comment API finds a quoted attribute and rejects a spelling near-miss', async ({ request }) => {
	const response = await request.get('/api/search', { params: { q: '"al pastor"' } });
	expect(response.ok()).toBe(true);
	expect(response.headers()['cache-control']).toBe('no-store');
	expect(await response.json()).toEqual([{ slug: 'la-taco-spot', rank: expect.any(Number), quote: expect.stringContaining('al pastor') }]);
	const nearMiss = await request.get('/api/search', { params: { q: 'tonkotsuu' } });
	expect(await nearMiss.json()).toEqual([]);
});

test('comment matches appear as labelled escaped quotes and obey the city filter', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('combobox');
	await search.fill('tonkotsu');
	const row = page.locator('#restaurant-ramen-house');
	await expect(row).toBeVisible();
	await expect(row.locator('.comment-match')).toContainText('Mentioned in comments');
	await expect(row.locator('.comment-match')).toContainText('Tonkotsu is incredible');
	await expect(page.locator('#restaurant-la-taco-spot')).toHaveCount(0);
	await search.fill('');
	await expect(page.locator('#restaurant-la-taco-spot')).toBeVisible();
	await page.getByRole('button', { name: /^City/ }).click();
	await page.getByRole('option', { name: /^Santa Ana/ }).click();
	await search.click();
	await search.fill('tonkotsu');
	await expect(page.locator('.row')).toHaveCount(0);
	await page.getByRole('button', { name: 'Remove Santa Ana filter' }).click();
	await expect(row).toBeVisible();
	await search.fill('');
	await expect(page.locator('.comment-match')).toHaveCount(0);
	await expect(page.locator('#restaurant-la-taco-spot')).toBeVisible();
});

test('a failed comment lookup keeps name hits visible and reports partial search', async ({ page }) => {
	await page.route('**/api/search?*', (route) => route.fulfill({ status: 503 }));
	await page.goto('/');
	await page.getByRole('combobox').fill('Ramen');
	await expect(page.locator('#restaurant-ramen-house')).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Comment search unavailable' })).toBeVisible();
});
