import type { Restaurant } from "./types";
import {
  normalizeCity,
  cuisineFacetKey,
  isUnmappedRestaurant,
} from "./stores.svelte";
import {
  createSliceCache,
  sliceRestaurantMentions,
} from "./filter-restaurants";
import { searchRankBySlug } from "./search-restaurants";
import { passesMomAndPopFilter } from "./mom-and-pop";
import type { CommentSearchHit } from './comment-search';

import { distanceMiles, type Coordinates } from './distance';

export interface PageFilterState {
  activeSubreddits: string[];
  activeCuisines: string[];
  activeCities: string[];
  showUnmapped: boolean;
  freshnessCutoff: number | null;
  userLocation?: Coordinates | null;
  radiusMiles?: number | null;
}

export interface PageFilterContext {
  threadSubreddit: Record<string, string>;
  dateExtent: { min: number; max: number };
  subredditSliceCache: ReturnType<typeof createSliceCache>;
  recencySliceCache: ReturnType<typeof createSliceCache>;
}

/** Filters before recency (cuisine, city, subreddit, unmapped). */
export function filterBeforeFreshness(
  restaurants: Restaurant[],
  state: Pick<
    PageFilterState,
    | "activeSubreddits"
    | "activeCuisines"
    | "activeCities"
    | "showUnmapped"
    | "userLocation"
    | "radiusMiles"
  >,
  ctx: Pick<PageFilterContext, "threadSubreddit" | "subredditSliceCache">,
): Restaurant[] {
  let result = restaurants;

  if (state.activeSubreddits.length > 0) {
    const active = new Set(state.activeSubreddits);
    const subredditKey = state.activeSubreddits.join(",");
    result = result.flatMap((r) => {
      const kept = r.mentions.filter((m) => {
        const sub = ctx.threadSubreddit[m.thread_id];
        return sub ? active.has(sub) : false;
      });
      const sliced = sliceRestaurantMentions(
        r,
        kept,
        ctx.subredditSliceCache,
        `${r.slug}|sub:${subredditKey}`,
      );
      return sliced ? [sliced] : [];
    });
  }

  if (state.activeCuisines.length > 0) {
    result = result.filter((r) => {
      return state.activeCuisines.includes(cuisineFacetKey(r.cuisine));
    });
  }

  if (state.activeCities.length > 0) {
    result = result.filter((r) => {
      const normalized = normalizeCity(r.location);
      return normalized ? state.activeCities.includes(normalized) : false;
    });
  }

  if (!state.showUnmapped) {
    result = result.filter((r) => !isUnmappedRestaurant(r));
  }

  if (state.userLocation && state.radiusMiles != null) {
    result = result.filter(r => {
      const miles = distanceMiles(state.userLocation!, r);
      return miles !== null && miles <= state.radiusMiles!;
    });
  }
  result = result.filter((r) => passesMomAndPopFilter(r));

  return result;
}

/** Applies mention-level recency filter on top of pre-freshness results. */
export function applyFreshnessFilter(
  restaurants: Restaurant[],
  cutoff: number | null,
  dateExtentMin: number,
  recencySliceCache: ReturnType<typeof createSliceCache>,
): Restaurant[] {
  if (cutoff === null || cutoff <= dateExtentMin) return restaurants;
  return restaurants.flatMap((r) => {
    const kept = r.mentions.filter((m) => {
      if (!m.comment_date) return true;
      const t = Date.parse(m.comment_date);
      return Number.isNaN(t) || t >= cutoff;
    });
    const sliced = sliceRestaurantMentions(
      r,
      kept,
      recencySliceCache,
      `${r.slug}|cutoff:${cutoff}`,
    );
    return sliced ? [sliced] : [];
  });
}

export function filterPageRestaurants(
  allRestaurants: Restaurant[],
  state: PageFilterState,
  ctx: PageFilterContext,
): { beforeFreshness: Restaurant[]; filtered: Restaurant[] } {
  const beforeFreshness = filterBeforeFreshness(allRestaurants, state, ctx);
  const filtered = applyFreshnessFilter(
    beforeFreshness,
    state.freshnessCutoff,
    ctx.dateExtent.min,
    ctx.recencySliceCache,
  );
  return { beforeFreshness, filtered };
}

/** Keeps restaurants that matched the search, in relevance order. */
function applySearchRank(
  restaurants: Restaurant[],
  rank: Map<string, number> | null,
): Restaurant[] {
  if (!rank) return restaurants;
  return restaurants
    .filter((r) => rank.has(r.slug))
    .sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!);
}

/**
 * Result order is Fuse relevance order whenever `searchQuery` is non-blank; the list's
 * "Relevance" sort reads that order.
 */
export function filterPageRestaurantsWithSearch(
  allRestaurants: Restaurant[],
  state: PageFilterState & { searchQuery: string; commentMatches?: CommentSearchHit[] },
  ctx: PageFilterContext,
): {
  beforeFreshness: Restaurant[];
  filtered: Restaurant[];
  unmappedCount: number;
} {
  const includingUnmapped = filterPageRestaurants(
    allRestaurants,
    { ...state, showUnmapped: true },
    ctx,
  );
  const searched = applySearchRank(
    includingUnmapped.filtered,
    searchRankBySlug(allRestaurants, state.searchQuery, state.commentMatches),
  );
  const unmappedCount = searched.filter(isUnmappedRestaurant).length;
  if (state.showUnmapped) {
    return {
      beforeFreshness: includingUnmapped.beforeFreshness,
      filtered: searched,
      unmappedCount,
    };
  }
  return {
    beforeFreshness: includingUnmapped.beforeFreshness.filter(
      (restaurant) => !isUnmappedRestaurant(restaurant),
    ),
    filtered: searched.filter(
      (restaurant) => !isUnmappedRestaurant(restaurant),
    ),
    unmappedCount,
  };
}

export interface FacetPopulations {
  cuisine: Restaurant[];
  city: Restaurant[];
  subreddit: Restaurant[];
}

/**
 * Per-facet populations for the filter menus: every active filter (including search,
 * recency and unmapped) EXCEPT the facet's own, so a count equals the number
 * of rows the list would show after selecting that option (standard faceted counts).
 */
export function filterPageFacetPopulations(
  allRestaurants: Restaurant[],
  state: PageFilterState & { searchQuery: string; commentMatches?: CommentSearchHit[] },
  ctx: PageFilterContext,
): FacetPopulations {
  const rank = searchRankBySlug(allRestaurants, state.searchQuery, state.commentMatches);
  const without = (omit: Partial<PageFilterState>) =>
    applySearchRank(
      filterPageRestaurants(allRestaurants, { ...state, ...omit }, ctx).filtered,
      rank,
    );
  return {
    cuisine: without({ activeCuisines: [] }),
    city: without({ activeCities: [] }),
    subreddit: without({ activeSubreddits: [] }),
  };
}
