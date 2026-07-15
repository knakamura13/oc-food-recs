# Live Search Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Typing in search live-narrows the restaurant list and map via Fuse, ANDed with existing filters, so `?q=` and empty states match user expectations.

**Architecture:** Add a pure `filterRestaurantsByQuery` helper next to the existing Fuse helpers in `search-restaurants.ts`. Apply it after `filterPageRestaurants` in `+page.svelte` and in `buildPageDescription`. Wire Clear all + map fitBounds debounce to include search. Keep SearchBar jump-to / Enter-cuisine-city behavior unchanged.

**Tech Stack:** SvelteKit 5, Fuse.js, Vitest, Playwright

**Design:** `docs/plans/2026-07-15-live-search-filter-design.md`

---

### Task 1: `filterRestaurantsByQuery` helper (TDD)

**Files:**
- Modify: `src/lib/restaurants/search-restaurants.ts`
- Modify: `src/lib/restaurants/search-restaurants.test.ts`

**Step 1: Write the failing tests**

Add to `search-restaurants.test.ts`:

```ts
import {
  // existing imports…
  filterRestaurantsByQuery,
} from "./search-restaurants";

describe("filterRestaurantsByQuery", () => {
  const restaurants = [
    makeRestaurant({
      slug: "taco-palace",
      name: "Taco Palace",
      cuisine: "Mexican",
      location: "Santa Ana",
    }),
    makeRestaurant({
      slug: "ramen-house",
      name: "Ramen House",
      cuisine: "Japanese",
      location: "Irvine",
    }),
  ];

  it("returns all restaurants when query is empty or whitespace", () => {
    expect(filterRestaurantsByQuery(restaurants, "")).toEqual(restaurants);
    expect(filterRestaurantsByQuery(restaurants, "   ")).toEqual(restaurants);
  });

  it("returns fuzzy matches for a name query", () => {
    const result = filterRestaurantsByQuery(restaurants, "taco");
    expect(result.map((r) => r.slug)).toEqual(["taco-palace"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterRestaurantsByQuery(restaurants, "zzznomatchxyz")).toEqual([]);
  });

  it("matches cuisine text", () => {
    const result = filterRestaurantsByQuery(restaurants, "japanese");
    expect(result.map((r) => r.slug)).toEqual(["ramen-house"]);
  });
});
```

Use the same `makeRestaurant` import pattern already in that test file (or import from `./test-utils` if that file constructs restaurants differently — match existing helpers).

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/restaurants/search-restaurants.test.ts`

Expected: FAIL — `filterRestaurantsByQuery` is not exported / not defined.

**Step 3: Implement the helper**

In `search-restaurants.ts`, add (statically import Fuse — do not lazy-load):

```ts
import Fuse from "fuse.js";

export function filterRestaurantsByQuery(
  restaurants: Restaurant[],
  query: string,
): Restaurant[] {
  const q = query.trim();
  if (!q) return restaurants;

  const fuse = new Fuse(prepareSearchIndex(restaurants), FUSE_SEARCH_OPTIONS);
  return rankSearchResults(fuse.search(q), q).map((r) => {
    const { nameNormalized, cuisineNormalized, locationNormalized, ...rest } =
      r.item;
    void nameNormalized;
    void cuisineNormalized;
    void locationNormalized;
    return rest;
  });
}
```

Prefer stripping the search-index fields cleanly (e.g. omit via destructure as above, or map back via `slug` lookup into the original `restaurants` array so object identity/mention slicing stays intact — **prefer slug lookup** so callers keep original `Restaurant` objects):

```ts
export function filterRestaurantsByQuery(
  restaurants: Restaurant[],
  query: string,
): Restaurant[] {
  const q = query.trim();
  if (!q) return restaurants;

  const bySlug = new Map(restaurants.map((r) => [r.slug, r]));
  const fuse = new Fuse(prepareSearchIndex(restaurants), FUSE_SEARCH_OPTIONS);
  return rankSearchResults(fuse.search(q), q)
    .map((r) => bySlug.get(r.item.slug))
    .filter((r): r is Restaurant => r != null);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/restaurants/search-restaurants.test.ts`

Expected: PASS

**Step 5: Commit** (only if user asked to commit; otherwise skip)

```bash
git add src/lib/restaurants/search-restaurants.ts src/lib/restaurants/search-restaurants.test.ts
git commit -m "$(cat <<'EOF'
feat(search): add filterRestaurantsByQuery helper

EOF
)"
```

---

### Task 2: Apply search after page filters

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/restaurants/page-meta.ts`
- Modify: `src/lib/restaurants/page-meta.test.ts`
- Optional test: extend `src/lib/restaurants/filter-page-restaurants.test.ts` only if you add a thin composer; otherwise cover composition via page-meta / a small new pure helper.

**Preferred composition:** keep `filterPageRestaurants` unchanged; apply search in one place used by both page and meta to stay DRY.

**Step 1: Add a thin composer (optional but recommended)**

Create or add to `filter-page-restaurants.ts`:

```ts
import { filterRestaurantsByQuery } from "./search-restaurants";

export function filterPageRestaurantsWithSearch(
  allRestaurants: Restaurant[],
  state: PageFilterState & { searchQuery: string },
  ctx: PageFilterContext,
): { beforeFreshness: Restaurant[]; filtered: Restaurant[] } {
  const { beforeFreshness, filtered } = filterPageRestaurants(
    allRestaurants,
    state,
    ctx,
  );
  return {
    beforeFreshness,
    filtered: filterRestaurantsByQuery(filtered, state.searchQuery),
  };
}
```

**Step 2: Failing test for composer / meta**

In `page-meta.test.ts`, add a case where `searchQuery: "zzznomatchxyz"` yields a description that reflects **0** matching restaurants (assert the count token `0 community-recommended` or equivalent current phrasing).

Also add unit coverage for `filterPageRestaurantsWithSearch` if introduced:

```ts
it("ANDs search with cuisine filter", () => {
  const restaurants = [
    makeRestaurant({ slug: "taco", name: "Taco Palace", cuisine: "Mexican" }),
    makeRestaurant({
      slug: "sushi",
      name: "Sushi Spot",
      cuisine: "Japanese",
    }),
  ];
  const { filtered } = filterPageRestaurantsWithSearch(
    restaurants,
    {
      activeSubreddits: [],
      activeCuisines: ["Mexican"],
      activeCities: [],
      showUnmapped: true,
      freshnessCutoff: null,
      searchQuery: "taco",
    },
    {
      threadSubreddit: {},
      dateExtent: { min: 0, max: Date.now() },
      subredditSliceCache: createSliceCache(),
      recencySliceCache: createSliceCache(),
    },
  );
  expect(filtered.map((r) => r.slug)).toEqual(["taco"]);
});
```

**Step 3: Wire `+page.svelte`**

- Import `filterPageRestaurantsWithSearch` (or apply `filterRestaurantsByQuery` inline after `pageFilterResult`).
- Include `searchQuery: appState.searchQuery` in the derived filter call.
- Ensure `filteredRestaurants` is the post-search set (list + map already bind to it).

**Step 4: Wire `buildPageDescription`**

Use the same composer / `filterRestaurantsByQuery` on `filtered` before computing `count`.

**Step 5: Run tests**

Run:

```bash
npx vitest run src/lib/restaurants/search-restaurants.test.ts \
  src/lib/restaurants/page-meta.test.ts \
  src/lib/restaurants/filter-page-restaurants.test.ts
```

Expected: PASS

**Step 6: Commit** (only if user asked)

```bash
git commit -m "$(cat <<'EOF'
feat(search): apply query to list and page meta filters

EOF
)"
```

---

### Task 3: Clear all + map fitBounds include search

**Files:**
- Modify: `src/lib/restaurants/stores.svelte.ts` (if Clear-all default should include search)
- Modify: `src/lib/restaurants/components/FilterBar.svelte`
- Modify: `src/lib/restaurants/components/FilterBar.test.ts` (and/or `stores.test.ts`)
- Modify: `src/routes/+page.svelte` (fitBounds effect)

**Step 1: Failing tests**

- Assert `clearExplorerFilters()` clears `searchQuery` by default (update `clearExplorerFilters` so search is always cleared on Clear all; keep `includeSearch` only if still needed elsewhere, or flip default to always clear search when calling from FilterBar: `clearExplorerFilters({ includeSearch: true })`).
- Prefer: FilterBar `clearAllFilters` calls `clearExplorerFilters({ includeSearch: true })` and `hasActiveFilters` includes `appState.searchQuery.trim().length > 0`.

**Step 2: Implement FilterBar changes**

```ts
function clearAllFilters() {
  clearExplorerFilters({ includeSearch: true });
}

let hasActiveFilters = $derived(
  appState.activeCuisines.length > 0 ||
    appState.activeCities.length > 0 ||
    appState.activeSubreddits.length > 0 ||
    appState.freshnessCutoff !== null ||
    appState.showUnmapped ||
    appState.showSavedOnly ||
    appState.searchQuery.trim().length > 0,
);
```

**Step 3: Debounce map fitBounds on search**

In `+page.svelte`, either:

- Extend the cuisine/city/subreddit/`saved` fitBounds `$effect` key with `appState.searchQuery.trim()`, **or**
- Add a dedicated debounced `$effect` (preferred, matching freshness) that sets `fitBoundsTarget` from `filteredRestaurants` when search changes, ~250ms debounce, skip first run.

When search is cleared and no other filters are active, reset bounds to full OC set (same as clearing other filters).

**Step 4: Run unit tests for FilterBar / stores**

Run: `npx vitest run src/lib/restaurants/components/FilterBar.test.ts src/lib/restaurants/stores.test.ts`

Expected: PASS

**Step 5: Commit** (only if user asked)

```bash
git commit -m "$(cat <<'EOF'
fix(search): clear search with Clear all and fit map on query

EOF
)"
```

---

### Task 4: Verify E2E + SearchBar regressions

**Files:**
- Verify: `tests/url-share.spec.ts`
- Verify: `src/lib/restaurants/components/SearchBar.test.ts`

**Step 1: Run SearchBar unit tests**

Run: `npx vitest run src/lib/restaurants/components/SearchBar.test.ts`

Expected: PASS (behavior unchanged).

**Step 2: Run url-share Playwright test**

Run: `npx playwright test tests/url-share.spec.ts --project="Desktop Chrome"`

Expected: `search query param filters the list` PASSES (empty title for `/?q=zzznomatchxyz`).

**Step 3: Manual smoke (if server available)**

1. Open `/`
2. Type `taco` — list count and map pins shrink live
3. Clear (X) — full filtered set returns
4. Apply Cuisine + search — results are intersection
5. Clear all — search box empties

**Step 4: Full unit suite**

Run: `npm test`

Expected: PASS

**Step 5: Commit** (only if user asked)

```bash
git commit -m "$(cat <<'EOF'
test(search): verify live query filtering against share URL e2e

EOF
)"
```

---

## Execution notes

- Do **not** change list sort to relevance in this plan.
- Do **not** make SearchBar index only `filteredRestaurants` (keep `allRestaurants` for jump-to discovery).
- Prefer slug-lookup when mapping Fuse hits back to `Restaurant` objects so mention/score identity is preserved.
- User has a standing rule: never `git commit` unless they explicitly ask — skip commit steps unless instructed.
