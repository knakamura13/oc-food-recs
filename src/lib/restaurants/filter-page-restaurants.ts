import type { Restaurant } from "./types";
import { normalizeCity, normalizeCuisine } from "./stores.svelte";
import {
  createSliceCache,
  sliceRestaurantMentions,
} from "./filter-restaurants";

export interface PageFilterState {
  activeSubreddits: string[];
  activeCuisines: string[];
  activeCities: string[];
  showUnmapped: boolean;
  freshnessCutoff: number | null;
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
    "activeSubreddits" | "activeCuisines" | "activeCities" | "showUnmapped"
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
      const normalized = normalizeCuisine(r.cuisine);
      return state.activeCuisines.includes(normalized);
    });
  }

  if (state.activeCities.length > 0) {
    result = result.filter((r) => {
      const normalized = normalizeCity(r.location);
      return normalized ? state.activeCities.includes(normalized) : false;
    });
  }

  if (!state.showUnmapped) {
    result = result.filter((r) => r.lat != null && r.lng != null);
  }

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
