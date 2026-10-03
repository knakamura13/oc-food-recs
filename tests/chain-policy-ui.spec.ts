import { expect, test } from '@playwright/test';

test('legacy chain-toggle links load without a chain toggle', async ({ page }) => {
	const response = await page.goto('/?mompop=0');
	expect(response?.status()).toBe(200);
	await expect(page.locator('.result-count')).toBeVisible();
	await expect(page.getByRole('button', { name: /mom & pop/i })).toHaveCount(0);
	await expect.poll(() => new URL(page.url()).searchParams.has('mompop')).toBe(false);
	await expect(page.locator('.row[id^="restaurant-"]').first()).toBeVisible();
});
