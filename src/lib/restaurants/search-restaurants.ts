import Fuse from "fuse.js";
import type { IFuseOptions, FuseResult } from "fuse.js";
import type { Restaurant } from "./types";
import { normalizeSearchText } from "./normalize-name";

export interface SearchableRestaurant extends Restaurant {
  nameNormalized: string;
  cuisineNormalized: string;
  locationNormalized: string;
}

export const FUSE_SEARCH_OPTIONS: IFuseOptions<SearchableRestaurant> = {
  keys: [
    { name: "nameNormalized", weight: 0.55 },
    { name: "name", weight: 0.25 },
    { name: "cuisineNormalized", weight: 0.12 },
    { name: "locationNormalized", weight: 0.08 },
  ],
  threshold: 0.4,
  distance: 200,
  includeScore: true,
};

export function prepareSearchIndex(
  restaurants: Restaurant[],
): SearchableRestaurant[] {
  return restaurants.map((restaurant) => ({
    ...restaurant,
    nameNormalized: normalizeSearchText(restaurant.name),
    cuisineNormalized: restaurant.cuisine
      ? normalizeSearchText(restaurant.cuisine)
      : "",
    locationNormalized: restaurant.location
      ? normalizeSearchText(restaurant.location)
      : "",
  }));
}

/** Lower tier = better match. Tier 3 is fuzzy-only (no normalized name signal). */
export function getNameMatchTier(
  normalizedName: string,
  normalizedQuery: string,
): number {
  if (!normalizedQuery) return 3;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  return 3;
}

export function rankSearchResults(
  results: FuseResult<SearchableRestaurant>[],
  query: string,
): FuseResult<SearchableRestaurant>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return results;

  return [...results].sort((a, b) => {
    const tierA = getNameMatchTier(a.item.nameNormalized, normalizedQuery);
    const tierB = getNameMatchTier(b.item.nameNormalized, normalizedQuery);
    if (tierA !== tierB) return tierA - tierB;

    const scoreA = a.score ?? 1;
    const scoreB = b.score ?? 1;
    if (scoreA !== scoreB) return scoreA - scoreB;

    return b.item.aggregate_score - a.item.aggregate_score;
  });
}

let cachedRestaurants: Restaurant[] | null = null;
let cachedSlugKey: string | null = null;
let cachedFuse: Fuse<SearchableRestaurant> | null = null;

function restaurantListSlugKey(restaurants: Restaurant[]): string {
  return restaurants.map((restaurant) => restaurant.slug).join("\0");
}

/** Reuse one Fuse index while the restaurant set (identity or slugs) is unchanged. */
export function getCachedRestaurantFuse(
  restaurants: Restaurant[],
): Fuse<SearchableRestaurant> {
  if (cachedFuse && cachedRestaurants === restaurants) return cachedFuse;

  const slugKey = restaurantListSlugKey(restaurants);
  if (cachedFuse && cachedSlugKey === slugKey) {
    cachedRestaurants = restaurants;
    return cachedFuse;
  }

  cachedRestaurants = restaurants;
  cachedSlugKey = slugKey;
  cachedFuse = new Fuse(prepareSearchIndex(restaurants), FUSE_SEARCH_OPTIONS);
  return cachedFuse;
}

export function resetRestaurantFuseCache(): void {
  cachedRestaurants = null;
  cachedSlugKey = null;
  cachedFuse = null;
}

export function filterRestaurantsByQuery(
  restaurants: Restaurant[],
  query: string,
): Restaurant[] {
  const q = query.trim();
  if (!q) return restaurants;
  const bySlug = new Map(restaurants.map((r) => [r.slug, r]));
  const fuse = getCachedRestaurantFuse(restaurants);
  return rankSearchResults(fuse.search(q), q)
    .map((r) => bySlug.get(r.item.slug))
    .filter((r): r is Restaurant => r != null);
}
