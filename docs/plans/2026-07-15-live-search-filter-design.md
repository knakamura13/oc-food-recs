# Live Search Filter — Design

**Date:** 2026-07-15  
**Status:** Approved  
**Approach:** A — Fuse filter in the shared pipeline

## Problem

The search box looks and shares like a result filter (`placeholder`, `?q=` URL sync, page meta, empty-state copy, and `tests/url-share.spec.ts`), but `searchQuery` only drives the autocomplete dropdown. The list and map stay unfiltered until the user picks a restaurant or hits Enter on an exact cuisine/city. That mismatches the average user's mental model.

## Goal

Typing in search live-narrows the restaurant list and map to Fuse matches, ANDed with existing structured filters, without changing jump-to / Enter-cuisine-city behavior.

## Non-goals

- Relevance-based list sort (keep Score / Recent / Name)
- Auto-clearing cuisine/city when a dropdown pick conflicts with other filters
- Redesigning SearchBar UI or filter chrome
- Debounced list updates (list updates every keystroke; only map fitBounds is debounced)

## Behavior

1. Non-empty trimmed `searchQuery` further narrows restaurants after cuisine / city / subreddit / unmapped / recency (and Saved as today).
2. Dropdown remains jump-to; Enter on exact cuisine/city still clears query and applies that filter.
3. Selecting a dropdown result still sets `searchQuery` to the restaurant name (list collapses to matching results).
4. Clearing the search box restores the pre-search filtered set immediately.
5. “Clear all” also clears `searchQuery`.
6. Map `fitBounds` on search changes is debounced (~250ms), same pattern as recency.

## Data flow

1. **`filterRestaurantsByQuery(restaurants, query)`** in `search-restaurants.ts`: empty/whitespace → passthrough; else Fuse with `FUSE_SEARCH_OPTIONS` + `rankSearchResults` → matched restaurants (ranked order for membership only).
2. **`+page.svelte`**: after `filterPageRestaurants(...)`, apply the helper with `appState.searchQuery`; list, map, and result count use the final set.
3. **`buildPageDescription`**: same search step so SSR meta counts match client / shared URLs.
4. **SearchBar**: unchanged; still indexes `allRestaurants` with the same Fuse options.
5. **FilterBar / `clearExplorerFilters`**: Clear all includes search; `hasActiveFilters` includes non-empty search.
6. **Map**: debounce fitBounds when `searchQuery` changes (~250ms).

## Edge cases

| Case | Behavior |
|------|----------|
| Empty / whitespace query | No search filter |
| Dropdown pick outside other active filters | Stays hidden (existing AND semantics; out of scope to auto-clear) |
| Enter exact cuisine/city | Clears query, applies filter (unchanged) |
| List order while searching | Existing sort keys only |
| Motion preferences | Unchanged; only fitBounds timing debounced |

## Testing

- Unit: `filterRestaurantsByQuery` (empty, exact, fuzzy, no-match)
- Unit: structured filters ∩ search
- Unit: `buildPageDescription` respects `searchQuery` count
- Unit: Clear all clears `searchQuery`
- E2E: `/?q=zzznomatchxyz` → “No restaurants found”; optional live typing shrinks result count

## Success criteria

- Typing “taco” immediately narrows list + map pins
- Shared `?q=` URLs show the same filtered empty/non-empty state
- Clear all fully resets search
- Existing SearchBar Jump / Enter cuisine-city tests still pass
