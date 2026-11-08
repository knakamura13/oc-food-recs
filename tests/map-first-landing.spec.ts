import { expect, test, type Page } from '@playwright/test';

// Phones land on the map with the list in its sheet; closing the map is the list-only state.
test.beforeEach(async ({ page }) => {
	await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
});

const isPhone = (name: string) => /Mobile Chrome|iPhone WebKit/.test(name);

async function landOn(page: Page, url = '/', size = { width: 390, height: 844 }) {
	await page.setViewportSize(size);
	await page.goto(url);
	await expect(page.locator('.list-pane.sheet')).toBeVisible({ timeout: 30_000 });
}

test('a phone lands on the map with the list in the sheet and nothing focused', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	await landOn(page);

	await expect(page.locator('dialog.map-pane')).toHaveAttribute('open', '');
	await expect(page.locator('.leaflet-container')).toBeVisible();
	await expect(page.locator('.controls-bar.over-map')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Close map' })).toBeVisible();
	await expect(page.locator('.map-fab')).toBeHidden();
	await expect(page.locator('.sheet-summary')).toContainText('in this area');
	// Opening on load must not pull focus onto a button or scroll the page.
	expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
	// The sheet starts at peek, so most of the screen is map.
	const sheet = await page.locator('.list-pane.sheet').boundingBox();
	expect(sheet!.height).toBeLessThan(844 * 0.45);
});

test('Full list leaves the map for the whole list, hero and footer, and the choice survives a reload', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	await landOn(page);

	const fullList = page.getByRole('button', { name: 'Full list' });
	expect((await fullList.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await fullList.click();

	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);
	await expect(page.locator('h1')).toBeVisible();
	await expect(page.locator('.row[id^="restaurant-"]').first()).toBeVisible();
	await expect(page.locator('.map-fab')).toBeVisible();
	await expect(page.locator('.list-scroll .site-footer')).toBeAttached();

	// The visitor chose the list, so a reload keeps it.
	await page.reload();
	await expect(page.locator('.row[id^="restaurant-"]').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);

	// The floating Map button brings the map back, and that choice is remembered too.
	await page.getByRole('button', { name: 'Open map', exact: true }).click();
	await expect(page.locator('.list-pane.sheet')).toBeVisible();
	await page.reload();
	await expect(page.locator('.list-pane.sheet')).toBeVisible({ timeout: 30_000 });
});

test('the list view runs to the bottom of the screen and ends with the footer links', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	await landOn(page);
	await page.getByRole('button', { name: 'Full list' }).click();
	const scroller = page.locator('.list-scroll');
	await expect(scroller).toBeVisible();

	// No separate beige band: the page's own footer is hidden and the scroller reaches the bottom edge.
	await expect(page.locator('main ~ .site-footer')).toBeHidden();
	const viewportHeight = await page.evaluate(() => window.innerHeight);
	await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
	await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
	await page.waitForTimeout(300);
	const box = (await scroller.boundingBox())!;
	expect(Math.round(box.y + box.height)).toBe(viewportHeight);

	// The footer links are reachable at the end of the list, clear of the floating Map button.
	const about = scroller.getByRole('link', { name: /About, sources and removal requests/ });
	await expect(about).toBeVisible();
	const aboutBox = (await about.boundingBox())!;
	const fab = (await page.locator('.map-fab').boundingBox())!;
	expect(aboutBox.y + aboutBox.height).toBeLessThanOrEqual(fab.y);
	await expect(scroller.getByRole('link', { name: 'Browse cities and cuisines' })).toBeVisible();
});

test('a tab cloned from a list-view tab still lands on the map', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	// A new tab opened from another tab inherits its sessionStorage but not its window.name.
	await page.addInitScript(() => sessionStorage.setItem('oc-phone-view', 'list:oc-tab-someone-else'));
	await landOn(page);
});

test('returning to phone width after a breakpoint round trip reopens the map', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	await landOn(page, '/', { width: 768, height: 1000 });
	await page.setViewportSize({ width: 1024, height: 768 });
	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);
	await page.setViewportSize({ width: 768, height: 1000 });
	await expect(page.locator('.list-pane.sheet')).toBeVisible();

	// A visitor who chose the list is not pulled back to the map by the same round trip.
	await page.getByRole('button', { name: 'Full list' }).click();
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.setViewportSize({ width: 768, height: 1000 });
	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);
});

test('Escape and Close map both reach a list view that can reopen the map', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	await landOn(page);

	await page.keyboard.press('Escape');
	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Open map', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Open map', exact: true }).click();
	await expect(page.locator('.list-pane.sheet')).toBeVisible();
	await page.getByRole('button', { name: 'Close map' }).click();
	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);
	await expect(page.locator('h1')).toBeVisible();
});

test('deep links land on the map with their filters, and a shared restaurant lifts the sheet', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	await landOn(page, '/?city=Santa%20Ana');
	await expect(page.locator('.controls-bar.over-map')).toContainText('Santa Ana');
	expect(new URL(page.url()).searchParams.get('city')).toBe('Santa Ana');

	const peek = (await page.locator('.list-pane.sheet').boundingBox())!.height;
	const slug = await page.locator('.row[id^="restaurant-"]').first().getAttribute('id');
	await landOn(page, `/?restaurant=${slug!.replace('restaurant-', '')}`);
	await expect(page.locator(`#${slug}`)).toHaveClass(/expanded/);
	await expect
		.poll(async () => (await page.locator('.list-pane.sheet').boundingBox())!.height)
		.toBeGreaterThan(peek);
});

test('320x568 keeps the chips, Close map, Full list and the sheet on screen', async ({ page }, info) => {
	test.skip(!isPhone(info.project.name), 'Phone viewport only');
	await landOn(page, '/', { width: 320, height: 568 });

	for (const locator of [
		page.locator('.controls-bar.over-map'),
		page.getByRole('button', { name: 'Close map' }),
		page.getByRole('button', { name: 'Full list' }),
		page.locator('.list-pane.sheet')
	]) {
		const box = (await locator.boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(320);
		expect(box.y + box.height).toBeLessThanOrEqual(568);
	}
	const sheet = (await page.locator('.list-pane.sheet').boundingBox())!;
	const controls = (await page.locator('.controls-bar.over-map').boundingBox())!;
	expect(sheet.y).toBeGreaterThan(controls.y + controls.height);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('desktop keeps the split list and map with no sheet', async ({ page }, info) => {
	test.skip(isPhone(info.project.name), 'Desktop viewport only');
	await page.goto('/');
	await expect(page.locator('.row[id^="restaurant-"]').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('.list-pane.sheet')).toHaveCount(0);
	await expect(page.locator('.sheet-full-list')).toHaveCount(0);
	await expect(page.locator('.map-pane')).toBeVisible();
	await expect(page.locator('h1')).toBeVisible();
});
