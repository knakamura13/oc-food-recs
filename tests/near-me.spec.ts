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
			// The toolbar scrolls sideways on the narrowest phones; reaching a control by scrolling counts.
			await control.scrollIntoViewIfNeeded();
			const box = await control.boundingBox();
			// Phones need 44 pt touch targets. On desktop the control matches the other
			// filter buttons (WCAG 2.2 minimum is 24 px) instead of standing out at 44.
			expect(box!.height).toBeGreaterThanOrEqual(width < 1024 ? 44 : 24);
			if (width >= 1024) expect(box!.height).toBeLessThanOrEqual(36);
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

test('the map shares and removes the session marker without enabling radius', async ({ page }, info) => {
	await page.goto('/');
	await expect(page.locator('.row-toggle').first()).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Near me', exact: true }).click();
	const radius = page.getByRole('combobox', { name: 'Distance radius' });
	await expect(radius).toHaveValue('');
	const mobile = /Mobile Chrome|iPhone WebKit/.test(info.project.name);
	if (mobile) await page.getByRole('button', { name: 'Open map', exact: true }).click();
	await expect(page.locator('path[fill="#4285f4"]')).toHaveCount(1);
	await page.getByRole('button', { name: 'Jump to my current location' }).click();
	if (mobile) await page.getByRole('dialog', { name: 'Restaurant map' }).getByRole('button', { name: 'Close map', exact: true }).click();
	await expect(radius).toHaveValue('');
	await page.getByRole('button', { name: 'Forget location', exact: true }).click();
	if (mobile) await page.getByRole('button', { name: 'Open map', exact: true }).click();
	await expect(page.locator('path[fill="#4285f4"]')).toHaveCount(0);
});
