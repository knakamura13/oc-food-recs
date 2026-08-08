# Mobile Result Card Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reflow mobile restaurant results into decision-first editorial entries that give identity and the food recommendation readable width while preserving community proof, controls, expansion, virtualization, and the compact desktop layout.

**Architecture:** Keep the existing `RestaurantList` DOM, state, lazy detail loading, and virtualizer. Add one small semantic wrapper around the `Try:` label, then use a mobile-only CSS grid at `max-width: 600px` to place the row toggle across the full first band, the bookmark over its trailing edge, and community proof plus the chevron in a footer band. Prove the change with browser-level geometry assertions because jsdom cannot validate responsive layout, then retain component tests for interaction and accessible state.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, scoped component CSS, Vitest and Testing Library, Playwright, TanStack Virtual Core.

---

## Constraints and success criteria

- Change only the mobile result presentation at `600px` and below; do not alter the desktop row layout.
- Keep restaurant name, cuisine, location, points, endorsements, mentions, bookmark, and expansion available in the collapsed result.
- At a 390px viewport, give the content toggle at least 280px of usable width.
- Clamp the collapsed recommendation to at most two lines.
- Give bookmark and chevron pointer targets at least 44 × 44px; keep the content toggle as the single keyboard expansion stop so the redundant chevron does not add a duplicate tab stop.
- Keep typical populated collapsed results at or below 170px at 390px; results without recommendations should be shorter.
- Preserve virtual-row measurement through sorting, filtering, expansion, collapse, and viewport changes.
- Honor `prefers-reduced-motion` and retain current map/list highlighting.
- Do not add photos, summaries, ratings, persistence, or backend work.

### Task 1: Add failing mobile geometry coverage

**Files:**

- Create: `tests/mobile-result-card.spec.ts`
- Reference: `playwright.config.ts`

**Step 1: Write a reusable geometry reader**

Create a Playwright helper that finds the first rendered `.row` containing `.dish-teaser`, then measures the row, content toggle, teaser, bookmark, chevron, and computed teaser line height.

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';

async function firstRecommendationRow(page: Page): Promise<Locator> {
	const row = page.locator('.row').filter({ has: page.locator('.dish-teaser') }).first();
	await expect(row).toBeVisible({ timeout: 30_000 });
	return row;
}

async function readGeometry(row: Locator) {
	return row.evaluate((element) => {
		const box = (selector: string) => {
			const target = element.querySelector<HTMLElement>(selector);
			if (!target) throw new Error(`Missing ${selector}`);
			const rect = target.getBoundingClientRect();
			return { width: rect.width, height: rect.height };
		};
		const teaser = element.querySelector<HTMLElement>('.dish-teaser');
		if (!teaser) throw new Error('Missing teaser');
		return {
			row: box('.row-header'),
			content: box('.row-toggle'),
			teaser: box('.dish-teaser'),
			bookmark: box('.row-save-btn'),
			chevron: box('.row-chevron-btn'),
			teaserLineHeight: Number.parseFloat(getComputedStyle(teaser).lineHeight)
		};
	});
}
```

**Step 2: Write the 390px failing test**

Run only in the Mobile Chrome project, set the viewport to 390 × 844, navigate to `/`, and assert the agreed geometry.

```ts
test('390px results prioritize restaurant content and keep full-size controls', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile viewport only');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	const geometry = await readGeometry(await firstRecommendationRow(page));
	expect(geometry.content.width).toBeGreaterThanOrEqual(280);
	expect(geometry.teaser.height / geometry.teaserLineHeight).toBeLessThanOrEqual(2.1);
	expect(geometry.bookmark.width).toBeGreaterThanOrEqual(44);
	expect(geometry.bookmark.height).toBeGreaterThanOrEqual(44);
	expect(geometry.chevron.width).toBeGreaterThanOrEqual(44);
	expect(geometry.chevron.height).toBeGreaterThanOrEqual(44);
	expect(geometry.row.height).toBeLessThanOrEqual(170);
});
```

**Step 3: Write the 600px failing test**

Reuse the helper at 600 × 900. Require the teaser to remain two lines or fewer and both controls to remain 44px targets; allow a maximum 170px row so the layout does not become oversized at the breakpoint.

**Step 4: Write the desktop preservation test**

Run only in Desktop Chrome. Measure `.row-toggle` and `.row-stats`; assert their vertical centers differ by no more than 2px, proving they remain in the existing horizontal desktop row rather than inheriting the mobile bands.

**Step 5: Run the new spec and verify the mobile tests fail for the measured production problem**

Run:

```bash
npm run test:e2e -- tests/mobile-result-card.spec.ts
```

Expected before implementation: the 390px test fails because content width is approximately 91px, the teaser exceeds two lines, and the current controls are approximately 36px and 20px. The desktop assertion should pass.

**Step 6: Commit the failing test**

```bash
git add tests/mobile-result-card.spec.ts
git commit -m "test(restaurants): capture mobile result row geometry"
```

### Task 2: Implement the Pocket Field Note mobile bands

**Files:**

- Modify: `src/lib/restaurants/components/RestaurantList.svelte:432-500`
- Modify: `src/lib/restaurants/components/RestaurantList.svelte:827-1058`
- Test: `tests/mobile-result-card.spec.ts`

**Step 1: Give the recommendation lead-in its own styling hook**

Replace the teaser body with the smallest semantic change:

```svelte
{#if restaurant.top_dish_snippet}
	<p class="dish-teaser"><span class="dish-label">Try:</span> {restaurant.top_dish_snippet}</p>
{/if}
```

Do not move or duplicate restaurant data and do not add a second mobile-specific row component.

**Step 2: Add the mobile grid without changing base desktop styles**

Append one scoped media query after the base row styles. The row toggle spans both columns so its teaser receives the full card width; right padding reserves the bookmark’s overlay space. Community proof and chevron form the second grid row.

```css
@media (max-width: 600px) {
	.row-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 44px;
		grid-template-rows: auto 44px;
		column-gap: 0.5rem;
		row-gap: 0.625rem;
		align-items: start;
		padding: 0.75rem 0.75rem 0.625rem;
	}

	.row-toggle {
		grid-column: 1 / -1;
		grid-row: 1;
		width: 100%;
		padding-right: 3.25rem;
	}

	.row-save-btn {
		grid-column: 2;
		grid-row: 1;
		width: 44px;
		height: 44px;
		margin: -0.5rem 0 0;
		padding: 0;
		justify-self: end;
	}

	.row-stats {
		grid-column: 1;
		grid-row: 2;
		align-self: stretch;
		align-items: center;
		gap: 0.75rem;
		border-top: 1px solid #e8e0d6;
	}

	.row-chevron-btn {
		grid-column: 2;
		grid-row: 2;
		width: 44px;
		height: 44px;
		justify-content: center;
		border-top: 1px solid #e8e0d6;
	}

	.row-name {
		font-size: 1.25rem;
		line-height: 1.2;
	}

	.dish-teaser {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		margin-top: 0.5rem;
		font-size: 0.875rem;
		font-style: normal;
		line-height: 1.43;
	}

	.dish-label {
		color: #ff4500;
		font-weight: 600;
	}
}
```

Tune only the numeric spacing needed to meet the tests. Do not add rounded-card shadows or alter the existing desktop palette.

**Step 3: Add visible keyboard focus around the content toggle**

Add a `:focus-visible` outline to `.row-toggle` with `2px #ff4500` and `2px` offset. Keep the chevron at `tabindex="-1"` because it duplicates the row toggle’s expansion action; its 44px size is a pointer target, while keyboard users expand from the content toggle.

**Step 4: Preserve reduced-motion behavior**

Do not add entrance animation to virtual rows. Retain the existing drawer transition and ensure the current `.no-motion` path still removes it. The selected rail and surface changes should remain non-positional color transitions.

**Step 5: Run the geometry tests and adjust only until they pass**

Run:

```bash
npm run test:e2e -- tests/mobile-result-card.spec.ts
```

Expected: both mobile geometry tests and the desktop preservation test pass.

**Step 6: Run component and type validation**

Run:

```bash
npm test -- src/lib/restaurants/components/RestaurantList.test.ts
npm run check
```

Expected: all focused tests pass; Svelte reports 0 errors and 0 warnings.

**Step 7: Commit the responsive implementation**

```bash
git add src/lib/restaurants/components/RestaurantList.svelte
git commit -m "feat(restaurants): reflow mobile result cards"
```

### Task 3: Cover interaction and virtual-row stability

**Files:**

- Modify: `src/lib/restaurants/components/RestaurantList.test.ts:18-55`
- Modify: `tests/mobile-result-card.spec.ts`

**Step 1: Write the component interaction test**

Give the test restaurant a `top_dish_snippet`, render the list, click the content toggle, and assert `aria-expanded="true"`. Click the bookmark separately and assert it does not collapse the row. Use the existing accessible button labels rather than CSS selectors for the interaction assertions.

**Step 2: Run the component test before any implementation adjustment**

Run:

```bash
npm test -- src/lib/restaurants/components/RestaurantList.test.ts
```

Expected: the expansion assertion passes with existing behavior. If bookmark setup exposes a local-storage mock gap, make the minimal test-only adjustment; do not change production behavior.

**Step 3: Add a mobile expand/collapse geometry test**

At 390px, click the first recommendation row, wait for its drawer to open, and assert the next rendered `.virtual-row` starts at or below the expanded row’s bottom. Collapse it and assert the list returns to non-overlapping rows. This guards the virtualizer’s measured-size cache after responsive row heights change.

**Step 4: Run the interaction and geometry suites**

Run:

```bash
npm test -- src/lib/restaurants/components/RestaurantList.test.ts
npm run test:e2e -- tests/mobile-result-card.spec.ts tests/mobile-map.spec.ts
```

Expected: all focused component and browser tests pass.

**Step 5: Commit interaction coverage**

```bash
git add src/lib/restaurants/components/RestaurantList.test.ts tests/mobile-result-card.spec.ts
git commit -m "test(restaurants): cover responsive result interactions"
```

### Task 4: Perform final responsive QA and validation

**Files:**

- Verify: `src/lib/restaurants/components/RestaurantList.svelte`
- Verify: `tests/mobile-result-card.spec.ts`

**Step 1: Start the app with the authorized QA database**

The worktree must retain the copied `.env` described in `CLAUDE.md`.

```bash
npm run dev -- --host 127.0.0.1 --port 5175
```

**Step 2: Capture mobile and breakpoint evidence**

Inspect and capture the same populated result at 320 × 720, 390 × 844, and 600 × 900. Record content width, teaser line count, control sizes, and row height. Exercise long names, missing tags, no recommendation, saved, new, and expanded states.

**Step 3: Confirm desktop is unchanged**

At 1280 × 800, compare the production row and implementation side by side. The map/list split, horizontal result density, metric placement, and hover synchronization must remain unchanged.

**Step 4: Run the complete validation set**

Run:

```bash
npm test
npm run check
npm run test:e2e
npm run build
git diff --check
```

Expected: 104 or more unit/component tests pass, Svelte reports 0 errors and 0 warnings, all browser projects pass, the production build exits 0, and `git diff --check` produces no output.

**Step 5: Review the final diff for scope**

Expected implementation files are only:

- `src/lib/restaurants/components/RestaurantList.svelte`
- `src/lib/restaurants/components/RestaurantList.test.ts`
- `tests/mobile-result-card.spec.ts`

Reject unrelated filter, map, data, or desktop visual changes.

**Step 6: Commit final QA-only adjustments, if any**

```bash
git add src/lib/restaurants/components/RestaurantList.svelte src/lib/restaurants/components/RestaurantList.test.ts tests/mobile-result-card.spec.ts
git commit -m "fix(restaurants): finalize mobile result card polish"
```

Skip this commit when QA requires no further changes.
