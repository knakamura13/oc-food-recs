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
