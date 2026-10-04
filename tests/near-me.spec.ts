import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.route('**/api/events', route => route.fulfill({ status: 204 }));
	await page.addInitScript(() => {
		(window as any).locationRequests = 0;
		Object.defineProperty(navigator, 'geolocation', { value: {
			getCurrentPosition(success: PositionCallback) {
				(window as any).locationRequests++;
				success({ coords: { latitude: 33.7455, longitude: -117.8677 } } as GeolocationPosition);
			}
		} });
	});
});

for (const width of [320, 390, 1280]) {
	test(`${width}px location remains ephemeral and controls stay reachable`, async ({ page }, info) => {
		test.skip((width === 1280) !== (info.project.name === 'Desktop Chrome'));
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/?sort=distance');
		await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 45000 });
		expect(await page.evaluate(() => (window as any).locationRequests)).toBe(0);
		await page.getByRole('button', { name: 'Near me', exact: true }).click();
		const radius = page.getByRole('combobox', { name: 'Distance radius' });
		await expect(radius).toHaveValue('');
		await expect(page.getByRole('button', { name: /sorted by distance, nearest first/i })).toBeVisible();
		for (const control of [radius, page.getByRole('button', { name: 'Near me', exact: true })]) {
			const box = await control.boundingBox();
			expect(box!.height).toBeGreaterThanOrEqual(44);
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(width);
		}
		await radius.selectOption('5');
		await expect(page.getByRole('button', { name: 'Remove radius filter' })).toBeVisible();
		expect(page.url()).not.toMatch(/radius|latitude|longitude|sort=distance/);
		await page.getByRole('button', { name: 'Clear all', exact: true }).click();
		await expect(radius).toHaveValue('');
		await page.getByRole('button', { name: 'Forget location', exact: true }).click();
		await expect(radius).toHaveCount(0);
		await expect(page.getByRole('button', { name: /sorted by score, highest first/i })).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		await page.screenshot({ path: info.outputPath(`near-me-${width}.png`), scale: 'css' });
		await page.reload();
		await expect(page.getByRole('button', { name: 'Near me', exact: true })).toBeVisible();
		await expect(radius).toHaveCount(0);
		expect(await page.evaluate(() => (window as any).locationRequests)).toBe(0);
	});
}
