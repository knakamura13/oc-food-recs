import type { SortDirection, SortKey } from "./types";

/** How the shared freshness cutoff was chosen — last visit vs histogram date. */
export type FreshnessSource = "visit" | "date";

/** Query token for "New since last visit". Distinct from a date so a histogram
 *  pick on the same UTC calendar day does not round-trip as last-visit. */
export const FRESHNESS_SINCE_VISIT = "visit";

/** Fields synced between appState and URL search params. */
export interface UrlStateSnapshot {
  searchQuery: string;
  activeCuisines: string[];
  activeCities: string[];
  activeSubreddits: string[];
  freshnessCutoff: number | null;
  freshnessSource: FreshnessSource | null;
  showUnmapped: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  selectedRestaurantSlug: string | null;
}

const VALID_SORT_KEYS = new Set<SortKey>(["score", "name", "recency"]);

export function parseSearchParams(
  params: URLSearchParams,
): Partial<UrlStateSnapshot> {
  const result: Partial<UrlStateSnapshot> = {};

  const q = params.get("q");
  if (q) result.searchQuery = q;

  const cuisine = params.get("cuisine");
  if (cuisine) result.activeCuisines = cuisine.split(",").filter(Boolean);

  const city = params.get("city");
  if (city) result.activeCities = city.split(",").filter(Boolean);

  const subreddit = params.get("subreddit");
  if (subreddit) result.activeSubreddits = subreddit.split(",").filter(Boolean);

  const since = params.get("since");
  if (since === FRESHNESS_SINCE_VISIT) {
    result.freshnessSource = "visit";
  } else if (since) {
    const t = Date.parse(since);
    if (!Number.isNaN(t)) {
      result.freshnessCutoff = t;
      result.freshnessSource = "date";
    }
  }

  const sort = params.get("sort");
  if (sort === "name" || sort === "score" || sort === "recency") {
    result.sortKey = sort;
  }

  const sortDir = params.get("sortdir");
  if (sortDir === "asc" || sortDir === "desc") {
    result.sortDirection = sortDir;
  }

  const restaurant = params.get("restaurant");
  if (restaurant) result.selectedRestaurantSlug = restaurant;

  const unmapped = params.get("unmapped");
  if (unmapped === "1" || unmapped === "true") {
    result.showUnmapped = true;
  }

  return result;
}

export function buildSearchParams(state: UrlStateSnapshot): URLSearchParams {
  const params = new URLSearchParams();

  if (state.searchQuery) params.set("q", state.searchQuery);
  if (state.activeCuisines.length > 0)
    params.set("cuisine", state.activeCuisines.join(","));
  if (state.activeCities.length > 0)
    params.set("city", state.activeCities.join(","));
  if (state.activeSubreddits.length > 0)
    params.set("subreddit", state.activeSubreddits.join(","));
  if (state.sortKey !== "score") params.set("sort", state.sortKey);
  if (state.sortDirection !== "desc")
    params.set("sortdir", state.sortDirection);
  if (state.selectedRestaurantSlug)
    params.set("restaurant", state.selectedRestaurantSlug);
  if (state.freshnessSource === "visit" && state.freshnessCutoff !== null) {
    params.set("since", FRESHNESS_SINCE_VISIT);
  } else if (state.freshnessCutoff !== null) {
    params.set(
      "since",
      new Date(state.freshnessCutoff).toISOString().slice(0, 10),
    );
  }
  if (state.showUnmapped) params.set("unmapped", "1");

  return params;
}

export function buildSearchQueryString(state: UrlStateSnapshot): string {
  return buildSearchParams(state).toString();
}

export function isValidSortKey(value: string): value is SortKey {
  return VALID_SORT_KEYS.has(value as SortKey);
}
