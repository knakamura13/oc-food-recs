import { filterPageRestaurants } from "./filter-page-restaurants";
import { createSliceCache } from "./filter-restaurants";
import { dateExtentOf } from "./stores.svelte";
import type { Restaurant, RestaurantData } from "./types";
import {
  buildSearchParams,
  parseSearchParams,
  type UrlStateSnapshot,
} from "./url-state";

const DEFAULT_TITLE =
  "Best Mom & Pop Restaurants in Orange County | Reddit Community Picks";

export function urlStateFromSearchParams(
  params: URLSearchParams,
): Partial<UrlStateSnapshot> {
  return parseSearchParams(params);
}

export function buildPageTitle(state: Partial<UrlStateSnapshot>): string {
  const parts: string[] = [];
  if (state.searchQuery) parts.push(`"${state.searchQuery}"`);
  if (state.activeCuisines?.length === 1) parts.push(state.activeCuisines[0]);
  else if (state.activeCuisines && state.activeCuisines.length > 1)
    parts.push(`${state.activeCuisines.length} cuisines`);
  if (state.activeCities?.length === 1)
    parts.push(`in ${state.activeCities[0]}`);
  else if (state.activeCities && state.activeCities.length > 1)
    parts.push(`in ${state.activeCities.length} cities`);
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
  const { filtered } = filterPageRestaurants(
    allRestaurants,
    {
      activeSubreddits: state.activeSubreddits ?? [],
      activeCuisines: state.activeCuisines ?? [],
      activeCities: state.activeCities ?? [],
      showUnmapped: state.showUnmapped ?? false,
      freshnessCutoff: state.freshnessCutoff ?? null,
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
  if (state.searchQuery) return `${base} matching "${state.searchQuery}".`;
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

export function buildPageMeta(
  urlState: Partial<UrlStateSnapshot>,
  allRestaurants: Restaurant[],
  meta: RestaurantData["meta"],
  origin: string,
  pathname: string,
  threadSubreddit: Record<string, string>,
): PageMeta {
  return {
    title: buildPageTitle(urlState),
    description: buildPageDescription(
      urlState,
      allRestaurants,
      meta,
      threadSubreddit,
    ),
    shareUrl: buildCanonicalShareUrl(origin, pathname, urlState),
  };
}
