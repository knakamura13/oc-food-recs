import { normalizeSearchText } from "$lib/restaurants/normalize-name";
import { db } from "$lib/server/db";
import { excludedBrands, restaurants } from "$lib/server/db/schema";
import { eq, ne, sql } from "drizzle-orm";

export type ExclusionReason = "chain" | "corporate_group";

export interface ReviewRestaurant {
  id: number;
  name: string;
  slug: string;
  location: string | null;
  status: string;
  exclusionReason: string | null;
  reviewedAt: Date | string | null;
}

/** Re-export shared normalization used by ingest matchers and client search. */
export const normalizeBrandName = normalizeSearchText;

/** Restaurants needing attention: pending_review (fuzzy flags) and excluded (hidden). */
export async function loadExclusionQueue(limit = 200): Promise<{
  pendingReview: ReviewRestaurant[];
  excluded: ReviewRestaurant[];
}> {
  const rows = (await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      location: restaurants.location,
      status: restaurants.status,
      exclusionReason: restaurants.exclusionReason,
      reviewedAt: restaurants.reviewedAt,
    })
    .from(restaurants)
    .where(ne(restaurants.status, "active"))
    .orderBy(restaurants.name)
    .limit(limit)) as ReviewRestaurant[];

  return {
    pendingReview: rows.filter((r) => r.status === "pending_review"),
    excluded: rows.filter((r) => r.status === "excluded"),
  };
}

/**
 * Confirm an exclusion. Stamps `reviewed_at` so re-ingest and the apply_exclusions sweep
 * never silently flip it back — a human decision is permanent until changed here.
 */
export async function markRestaurantExcluded(
  restaurantId: number,
  reason: ExclusionReason,
): Promise<void> {
  const updated = await db
    .update(restaurants)
    .set({
      status: "excluded",
      exclusionReason: reason,
      reviewedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(restaurants.id, restaurantId))
    .returning({ id: restaurants.id });
  if (updated.length === 0) throw new Error("Restaurant not found.");
}

/**
 * Restore a restaurant to the public site. Also stamps `reviewed_at` so a false-positive
 * fuzzy flag (or a registry hit the human disagrees with) is not re-applied on the next run.
 */
export async function restoreRestaurantActive(
  restaurantId: number,
): Promise<void> {
  const updated = await db
    .update(restaurants)
    .set({
      status: "active",
      exclusionReason: null,
      reviewedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(restaurants.id, restaurantId))
    .returning({ id: restaurants.id });
  if (updated.length === 0) throw new Error("Restaurant not found.");
}

/** Add (or refresh) a brand in the curated registry. Idempotent on normalized_name. */
export async function addBrandToRegistry(
  brandName: string,
  reason: ExclusionReason,
  groupName: string | null,
): Promise<void> {
  const normalized = normalizeBrandName(brandName);
  if (!normalized) throw new Error("Brand name is empty after normalization.");
  await db
    .insert(excludedBrands)
    .values({ brandName, reason, groupName, normalizedName: normalized })
    .onConflictDoUpdate({
      target: excludedBrands.normalizedName,
      set: { brandName, reason, groupName },
    });
}
