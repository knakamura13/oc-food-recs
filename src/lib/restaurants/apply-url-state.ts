import { appState, setFreshnessFilter } from "./stores.svelte";
import type { Restaurant } from "./types";
import type { UrlStateSnapshot } from "./url-state";
import { getLastVisitMs } from "./visit-tracker";

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
  if (parsed.freshnessSource === "visit") {
    const visitMs = getLastVisitMs();
    setFreshnessFilter(visitMs, visitMs === null ? null : "visit");
  } else if (parsed.freshnessCutoff !== undefined) {
    setFreshnessFilter(
      parsed.freshnessCutoff,
      parsed.freshnessCutoff === null ? null : (parsed.freshnessSource ?? "date"),
    );
  }
  if (parsed.sortKey !== undefined) appState.sortKey = parsed.sortKey;
  // A pasted distance URL must not request permission or imply a known location.
  const missingLocation = parsed.sortKey === 'distance' && appState.userLocation === null;
  if (missingLocation) appState.sortKey = appState.searchQuery.trim() ? 'relevance' : 'score';
  if (parsed.sortDirection !== undefined)
    appState.sortDirection = parsed.sortDirection;
  if (missingLocation) appState.sortDirection = 'desc';
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
