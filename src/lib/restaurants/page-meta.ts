import { filterPageRestaurantsWithSearch } from "./filter-page-restaurants";
import { createSliceCache } from "./filter-restaurants";
import { dateExtentOf } from "./stores.svelte";
import type { Restaurant, RestaurantData } from "./types";
import { buildSearchParams, type UrlStateSnapshot } from "./url-state";

export const DEFAULT_TITLE =
  "Best Mom & Pop Restaurants in Orange County | Reddit Community Picks";

export function buildPageTitle(
  state: Partial<UrlStateSnapshot>,
  restaurantName?: string | null,
): string {
  const parts: string[] = [];
  if (state.searchQuery) parts.push(`"${state.searchQuery}"`);
  if (state.activeCuisines?.length === 1) parts.push(state.activeCuisines[0]);
  else if (state.activeCuisines && state.activeCuisines.length > 1)
    parts.push(`${state.activeCuisines.length} cuisines`);
  if (state.activeCities?.length === 1)
    parts.push(`in ${state.activeCities[0]}`);
  else if (state.activeCities && state.activeCities.length > 1)
    parts.push(`in ${state.activeCities.length} cities`);
  if (state.activeSubreddits?.length === 1)
    parts.push(`r/${state.activeSubreddits[0]}`);
  else if (state.activeSubreddits && state.activeSubreddits.length > 1)
    parts.push(`${state.activeSubreddits.length} subreddits`);
  if (state.freshnessCutoff != null) parts.push("recent");
  if (restaurantName) parts.push(restaurantName);
  else if (state.selectedRestaurantSlug)
    parts.push(state.selectedRestaurantSlug);
  if (state.sortKey && state.sortKey !== "score") {
    parts.push(state.sortKey === "name" ? "by name" : "by recency");
  }
  if (state.showUnmapped) parts.push("unmapped");
  if (parts.length === 0) return DEFAULT_TITLE;
  return `${parts.join(" ")} — OC Food Recs`;
}

export function buildPageDescription(
  state: Partial<UrlStateSnapshot>,
  allRestaurants: Restaurant[],
  meta: RestaurantData["meta"],
  threadSubreddit: Record<string, string>,
): string {
  const dateExtent = dateExtentOf(allRestaurants);
  const { filtered } = filterPageRestaurantsWithSearch(
    allRestaurants,
    {
      activeSubreddits: state.activeSubreddits ?? [],
      activeCuisines: state.activeCuisines ?? [],
      activeCities: state.activeCities ?? [],
      showUnmapped: state.showUnmapped ?? false,
      freshnessCutoff: state.freshnessCutoff ?? null,
      searchQuery: state.searchQuery ?? "",
    },
    {
      threadSubreddit,
      dateExtent,
      subredditSliceCache: createSliceCache(),
      recencySliceCache: createSliceCache(),
    },
  );

  const count = filtered.length;
  const base = `${count} community-recommended mom and pop restaurants in Orange County`;
  const trimmedSearch = state.searchQuery?.trim() ?? "";
  if (trimmedSearch) return `${base} matching "${trimmedSearch}".`;
  if (
    (state.activeCuisines?.length ?? 0) > 0 ||
    (state.activeCities?.length ?? 0) > 0
  ) {
    return `${base} with your current filters applied.`;
  }

  const threadCount = meta.source_threads.length;
  return `Explore ${allRestaurants.length} community-recommended mom and pop restaurants in Orange County, CA — curated from ${threadCount} Reddit ${threadCount === 1 ? "thread" : "threads"} and ${meta.total_comments_processed} comments.`;
}

export function buildCanonicalShareUrl(
  origin: string,
  pathname: string,
  state: Partial<UrlStateSnapshot>,
): string {
  const full: UrlStateSnapshot = {
    searchQuery: state.searchQuery ?? "",
    activeCuisines: state.activeCuisines ?? [],
    activeCities: state.activeCities ?? [],
    activeSubreddits: state.activeSubreddits ?? [],
    freshnessCutoff: state.freshnessCutoff ?? null,
    freshnessSource: state.freshnessSource ?? null,
    showUnmapped: state.showUnmapped ?? false,
    sortKey: state.sortKey ?? "score",
    sortDirection: state.sortDirection ?? "desc",
    selectedRestaurantSlug: state.selectedRestaurantSlug ?? null,
  };
  const qs = buildSearchParams(full).toString();
  const path = pathname || "/";
  return qs ? `${origin}${path}?${qs}` : `${origin}${path}`;
}

export interface PageMeta {
  title: string;
  description: string;
  shareUrl: string;
}

function restaurantNameForSlug(
  slug: string | null | undefined,
  allRestaurants: Restaurant[],
): string | null {
  if (!slug) return null;
  return allRestaurants.find((r) => r.slug === slug)?.name ?? null;
}

export function buildPageMeta(
  urlState: Partial<UrlStateSnapshot>,
  allRestaurants: Restaurant[],
  meta: RestaurantData["meta"],
  origin: string,
  pathname: string,
  threadSubreddit: Record<string, string>,
): PageMeta {
  return {
    title: buildPageTitle(
      urlState,
      restaurantNameForSlug(urlState.selectedRestaurantSlug, allRestaurants),
    ),
    description: buildPageDescription(
      urlState,
      allRestaurants,
      meta,
      threadSubreddit,
    ),
    shareUrl: buildCanonicalShareUrl(origin, pathname, urlState),
  };
}
