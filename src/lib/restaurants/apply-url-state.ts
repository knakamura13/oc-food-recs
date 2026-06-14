import { appState } from "./stores.svelte";
import type { Restaurant } from "./types";
import type { UrlStateSnapshot } from "./url-state";

/** Apply parsed URL params to global appState (client hydration). */
export function applyUrlStateSnapshot(
  parsed: Partial<UrlStateSnapshot>,
  restaurants: Restaurant[] = [],
): void {
  if (parsed.searchQuery !== undefined)
    appState.searchQuery = parsed.searchQuery;
  if (parsed.activeCuisines !== undefined)
    appState.activeCuisines = parsed.activeCuisines;
  if (parsed.activeCities !== undefined)
    appState.activeCities = parsed.activeCities;
  if (parsed.activeSubreddits !== undefined)
    appState.activeSubreddits = parsed.activeSubreddits;
  if (parsed.freshnessCutoff !== undefined)
    appState.freshnessCutoff = parsed.freshnessCutoff;
  if (parsed.sortKey !== undefined) appState.sortKey = parsed.sortKey;
  if (parsed.sortDirection !== undefined)
    appState.sortDirection = parsed.sortDirection;
  if (parsed.showUnmapped !== undefined)
    appState.showUnmapped = parsed.showUnmapped;

  const restaurant = parsed.selectedRestaurantSlug;
  if (restaurant) {
    appState.selectedRestaurantSlug = restaurant;
    const match = restaurants.find((r) => r.slug === restaurant);
    if (match) {
      appState.listScrollTarget = match.slug;
      if (match.lat != null && match.lng != null) {
        appState.mapTarget = {
          slug: match.slug,
          lat: match.lat,
          lng: match.lng,
        };
      }
    }
  }
}
