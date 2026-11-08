import { expect, test } from '@playwright/test';

// A phone 720px tall or less scrolls the page instead of `.list-scroll`. The virtualizer must
// follow the window there, or it mounts every row.
test('375x667 mounts a bounded set of rows and keeps the whole list reachable', async ({ page }, testInfo) => {
	test.skip(!/Mobile Chrome|iPhone WebKit/.test(testInfo.project.name), 'Phone viewport only');
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/');

	const rows = page.locator('.virtual-row');
	await expect(rows.first()).toBeVisible({ timeout: 30_000 });
	expect(await rows.count()).toBeLessThanOrEqual(40);

	// Scroll the page to its end; row heights settle as they mount, so repeat until it stops moving.
	await expect
		.poll(async () => {
			return page.evaluate(async () => {
				window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
				await new Promise((resolve) => setTimeout(resolve, 150));
				const last = [...document.querySelectorAll('.virtual-row')].at(-1);
				const total = Number(document.querySelector('.result-count')?.textContent?.match(/of ([\d,]+)/)?.[1].replace(/,/g, '') ?? 0);
				const lastIndex = Number((last as HTMLElement | undefined)?.dataset.index ?? -1);
				const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
				return atEnd && (total === 0 || lastIndex >= 0);
			});
		}, { timeout: 15_000 })
		.toBe(true);
	expect(await rows.count()).toBeLessThanOrEqual(40);

	// Expand and collapse still work from the end of the list.
	const lastRow = page.locator('.row').last();
	const toggle = lastRow.locator('.row-toggle');
	await toggle.click();
	await expect(lastRow).toHaveClass(/expanded/);
	await toggle.click();
	await expect(lastRow).not.toHaveClass(/expanded/);
});
