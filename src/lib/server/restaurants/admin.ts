import { normalizeSearchText } from "$lib/restaurants/normalize-name";
import { db } from "$lib/server/db";
import { excludedBrands, mentions, restaurants } from "$lib/server/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";

export type ExclusionReason = "chain" | "corporate_group";

export interface ReviewRestaurant {
  id: number;
  name: string;
  slug: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  exclusionReason: string | null;
  reviewedAt: Date | string | null;
  mentionCount?: number;
}

/** Re-export shared normalization used by ingest matchers and client search. */
export const normalizeBrandName = normalizeSearchText;

/** Restaurants flagged as likely duplicates (sub-threshold merge pairs). */
export async function loadDuplicateQueue(
  limit = 200,
): Promise<ReviewRestaurant[]> {
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      location: restaurants.location,
      lat: restaurants.lat,
      lng: restaurants.lng,
      status: restaurants.status,
      exclusionReason: restaurants.exclusionReason,
      reviewedAt: restaurants.reviewedAt,
      mentionCount: sql<number>`(
        SELECT COUNT(*)::int FROM mentions m WHERE m.restaurant_id = ${restaurants.id}
      )`.as("mention_count"),
    })
    .from(restaurants)
    .where(
      and(
        eq(restaurants.status, "pending_review"),
        eq(restaurants.exclusionReason, "duplicate_candidate"),
      ),
    )
    .orderBy(restaurants.name)
    .limit(limit);

  return rows as ReviewRestaurant[];
}

/** Merge loser into winner (mentions reassigned, loser row deleted). */
export async function mergeRestaurants(
  winnerId: number,
  loserId: number,
): Promise<void> {
  if (winnerId === loserId)
    throw new Error("Cannot merge a restaurant with itself.");

  const [winner] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, winnerId))
    .limit(1);
  const [loser] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, loserId))
    .limit(1);
  if (!winner || !loser) throw new Error("Restaurant not found.");

  await db.execute(sql`
    DELETE FROM mentions m1
    WHERE m1.restaurant_id = ${loserId}
    AND EXISTS (
      SELECT 1 FROM mentions m2
      WHERE m2.restaurant_id = ${winnerId}
      AND m2.thread_id = m1.thread_id
      AND m2.comment_id = m1.comment_id
    )
  `);

  await db
    .update(mentions)
    .set({ restaurantId: winnerId })
    .where(eq(mentions.restaurantId, loserId));

  const mergedName =
    loser.name.length > winner.name.length ? loser.name : winner.name;

  await db
    .update(restaurants)
    .set({
      name: mergedName,
      location: winner.location ?? loser.location,
      cuisine: winner.cuisine ?? loser.cuisine,
      lat: winner.lat ?? loser.lat,
      lng: winner.lng ?? loser.lng,
      status: "active",
      exclusionReason: null,
      reviewedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(restaurants.id, winnerId));

  await db.delete(restaurants).where(eq(restaurants.id, loserId));
}

/** Dismiss duplicate flag and restore restaurant to the public site. */
export async function dismissDuplicateCandidate(
  restaurantId: number,
): Promise<void> {
  await restoreRestaurantActive(restaurantId);
}

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
      lat: restaurants.lat,
      lng: restaurants.lng,
      status: restaurants.status,
      exclusionReason: restaurants.exclusionReason,
      reviewedAt: restaurants.reviewedAt,
    })
    .from(restaurants)
    .where(ne(restaurants.status, "active"))
    .orderBy(restaurants.name)
    .limit(limit)) as ReviewRestaurant[];

  return partitionExclusionQueue(rows);
}

/** Pure partition for tests and admin UI. */
export function partitionExclusionQueue(rows: ReviewRestaurant[]): {
  pendingReview: ReviewRestaurant[];
  excluded: ReviewRestaurant[];
} {
  return {
    pendingReview: rows.filter(
      (r) =>
        r.status === "pending_review" &&
        r.exclusionReason !== "duplicate_candidate",
    ),
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
