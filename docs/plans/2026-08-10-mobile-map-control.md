# Mobile Map Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the obstructing floating mobile map preview and replace it with an explicit, accessible Map disclosure that preserves the existing desktop split view.

**Architecture:** `FilterBar.svelte` renders the mobile disclosure control, while `+page.svelte` remains the single owner of the map sheet lifecycle, responsive breakpoint, scroll lock, focus management, and list inertness. `RestaurantList.svelte` passes the exact Show on map opener back to the page so focus can be restored. `Map.svelte` keeps responsibility for Leaflet and its existing location states.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest, Testing Library, Playwright, Leaflet, scoped component CSS.

---

## Task 1: Add the mobile Map disclosure control

**Files:**

- Modify: `src/lib/restaurants/components/FilterBar.test.ts`
- Modify: `src/lib/restaurants/components/FilterBar.svelte`

### Step 1: Write the failing component tests

Add focused tests that render `FilterBar` with an `onMapToggle` callback and prove that the new control:

- has visible text `Map` and the accessible name `Open map` while closed;
- references `restaurant-map-panel` through `aria-controls`;
- exposes `aria-expanded="false"` while closed;
- invokes the callback with its button element when activated; and
- changes to `aria-expanded="true"` and the accessible name `Close map` when `mapExpanded` is true.

Query the element through a stable `.mobile-map-trigger` selector so jsdom's desktop media-query behavior does not hide it from role queries.

### Step 2: Run the focused test and confirm RED

Run:

```sh
npx vitest run src/lib/restaurants/components/FilterBar.test.ts
```

Expected: FAIL because the filter bar does not yet accept map props or render a mobile map control.

### Step 3: Implement the smallest control API

In `FilterBar.svelte`:

- add optional `mapExpanded` and `onMapToggle` props with backward-compatible defaults;
- render a native `type="button"` control beside the existing saved/share controls;
- use a Lucide map icon aliased so it does not shadow JavaScript's built-in `Map` used by the component;
- keep the visible label `Map`, change the accessible name between `Open map` and `Close map`, and wire `aria-expanded`/`aria-controls`;
- pass `event.currentTarget` to the callback; and
- hide the control by default, showing it only below the existing 1024px breakpoint.

Match the existing `.dropdown-trigger` and `.has-active` visual language rather than introducing a new button treatment.

### Step 4: Run the focused test and confirm GREEN

Run:

```sh
npx vitest run src/lib/restaurants/components/FilterBar.test.ts
```

Expected: PASS.

### Step 5: Commit

```sh
git add src/lib/restaurants/components/FilterBar.svelte src/lib/restaurants/components/FilterBar.test.ts
git commit -m "feat(ui): add mobile map control"
```

## Task 2: Specify the mobile sheet lifecycle in the browser

**Files:**

- Modify: `tests/mobile-map.spec.ts`

### Step 1: Replace the obsolete floating-preview assertions

Rewrite the mobile test around the approved disclosure behavior. Before production changes, assert that:

- `Open map` is visible and reports `aria-expanded="false"`;
- `#restaurant-map-panel` is not visible while closed;
- the result list is not inert while closed;
- opening by keyboard changes `aria-expanded` to true and focuses `Close map`;
- the list becomes inert while the sheet is open;
- Leaflet becomes visible in the sheet;
- search remains enabled and operable above the sheet;
- Escape closes the sheet, removes inertness, and restores focus to the Map opener; and
- the collapsed map contributes no focusable Leaflet application or markers.

Add a Show on map case that expands a restaurant, activates its Show on map button, verifies the sheet opens and Close receives focus, then verifies closing returns focus to that original button.

### Step 2: Add responsive obstruction coverage

For viewport widths 320, 390, 600, and 768, prove the closed map panel is hidden and representative visible result-card actions can be hit without the map receiving the click. Also assert `document.documentElement.scrollWidth <= window.innerWidth` to catch new horizontal overflow.

Retain desktop coverage and strengthen it to prove:

- the inline map remains visible at 1024 and 1280px;
- no mobile Map control is visible;
- the outer map pane is not exposed as a button; and
- Leaflet controls remain interactive.

### Step 3: Run the focused browser spec and confirm RED

Run:

```sh
npx playwright test tests/mobile-map.spec.ts --project='Mobile Chrome'
```

Expected: FAIL because the current app has no Map disclosure, keeps the floating preview visible, and lacks focus/Escape/inert behavior.

Do not weaken assertions to accommodate the old UI.

## Task 3: Implement the accessible map sheet lifecycle

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/restaurants/components/RestaurantList.svelte`
- Modify: `tests/mobile-map.spec.ts` only if selectors need to target stable semantics rather than presentation

### Step 1: Give `+page.svelte` explicit open and close operations

Replace direct `mapExpanded` mutations with small named operations that:

- remember the opener element;
- open only the mobile sheet path while preserving the desktop inline map;
- wait for Svelte's DOM update and focus the Close button;
- close on button activation or Escape;
- restore focus to a still-connected opener after the closed state is rendered; and
- clear the saved opener after closing.

Wire the FilterBar callback to the toggle operation. Bind the existing Close button so it can receive focus. Add one window-level Escape handler scoped to an expanded mobile map.

### Step 2: Remove the collapsed wrapper-as-button behavior

Give the map pane the stable ID `restaurant-map-panel`. Remove its `role="button"`, `tabindex`, click-to-expand handler, and Enter/Space wrapper handler.

On viewports below 1024px:

- hide the map pane completely while closed;
- expose it as the existing fixed sheet only while expanded;
- keep the closed Leaflet surface out of pointer hit-testing and the accessibility tree; and
- mark only the covered `.list-pane` inert while the sheet is open.

On desktop, retain the inline split pane and Leaflet's own application semantics. Do not make the result list inert.

### Step 3: Preserve Show on map context

Change `RestaurantList`'s `onShowOnMap` callback to receive the native button that initiated the action. Pass that button to the page's open operation. Preserve the current selection/map-target update and desktop scroll-into-view behavior.

### Step 4: Run the mobile browser spec and confirm GREEN

Run:

```sh
npx playwright test tests/mobile-map.spec.ts --project='Mobile Chrome'
```

Expected: PASS, including keyboard focus, Escape, inertness, all four narrow widths, and Show on map restoration.

### Step 5: Run the desktop regression case

Run:

```sh
npx playwright test tests/mobile-map.spec.ts --project='Desktop Chrome'
```

Expected: PASS with the existing inline map visible and interactive.

### Step 6: Commit

```sh
git add src/routes/+page.svelte src/lib/restaurants/components/RestaurantList.svelte tests/mobile-map.spec.ts
git commit -m "fix(ui): remove obstructing mobile map preview"
```

## Task 4: Evaluate and cover deferred map loading

**Files:**

- Modify if needed: `src/lib/restaurants/components/Map.svelte`
- Modify if needed: `src/lib/restaurants/components/Map.test.ts`

### Step 1: Inspect the first-open transition under browser throttling

Use Playwright's slow-network emulation or block Leaflet briefly, open the mobile map, and observe the sheet before `.leaflet-container` is ready.

If the current sheet already communicates progress through an existing visible state, leave `Map.svelte` unchanged. If it presents a blank unexplained panel, continue.

### Step 2: Write a failing loading-state test if the problem is demonstrated

Add a focused component or browser assertion for a polite `Loading map…` status and `aria-busy="true"` before initialization, followed by its removal once Leaflet is ready.

Run the focused test and confirm it fails against the blank state.

### Step 3: Add the minimal loading treatment if needed

Track map readiness separately from initialization start. Render a lightweight status layer inside the existing panel until markers and controls are ready. Reuse existing colors, spacing, and reduced-motion behavior; do not add an asset or dependency.

Run the focused test and confirm it passes.

### Step 4: Commit only if this task produced a verified change

```sh
git add src/lib/restaurants/components/Map.svelte src/lib/restaurants/components/Map.test.ts
git commit -m "fix(ui): clarify deferred map loading"
```

## Task 5: Full end-user validation

**Files:**

- Modify only when a validation failure demonstrates a regression
- Capture evidence outside the repository, for example under `/tmp/oc-food-map-control/`

### Step 1: Run all relevant automated validation

Run:

```sh
npm test
npm run check
npm run build
npx playwright test tests/mobile-map.spec.ts
```

Expected: all commands exit 0. Record exact test/check counts and any pre-existing install audit warnings separately from product failures.

### Step 2: Inspect representative mobile widths

At 320x700, 390x844, 600x900, and 768x1024:

- scroll through several virtualized rows with the map closed;
- activate Save and Expand actions that pass through the former floating-map area;
- open with the filter-bar Map control and with Show on map;
- exercise keyboard Tab/Enter/Escape and verify focus restoration;
- keep the sheet open while changing search/filter state;
- verify geolocation disabled/loading/error feedback remains readable;
- check for clipping, overlap, layout shift, horizontal overflow, and console errors; and
- capture closed/open screenshots at one phone width and one tablet width.

### Step 3: Inspect desktop boundaries

At 1024x768 and 1280x800, verify the split map/list layout, map markers, zoom/location controls, result expansion, and scrolling are unchanged. Capture a desktop screenshot.

### Step 4: Verify reduced motion and accessibility semantics

Emulate `prefers-reduced-motion: reduce`, repeat open/close, and confirm no transition is required to understand state. Inspect the accessibility tree to confirm exactly one mobile disclosure when closed, no hidden Leaflet stops, a named expanded map region/application, and no button wrapping the desktop Leaflet application.

### Step 5: Correct demonstrated failures and rerun the affected checks

Keep fixes within this initiative. Do not fold unrelated filtering, virtualization, or aesthetic cleanup into the branch.

### Step 6: Review the final diff and commit validation fixes

```sh
git diff --check
git status --short
git diff 95e136c --stat
```

If validation required corrections, commit them with a focused `fix(ui): ...` message. Leave screenshots outside the repository unless a repository convention explicitly requires committed artifacts.
