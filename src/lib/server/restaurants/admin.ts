import { normalizeSearchText } from "$lib/restaurants/normalize-name";
import { db } from "$lib/server/db";
import {
  excludedBrands,
  mentions,
  mergeLog,
  restaurantAliases,
  restaurants,
} from "$lib/server/db/schema";
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

  await db.transaction(async (tx) => {
    const [winner] = await tx
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, winnerId))
      .limit(1);
    const [loser] = await tx
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, loserId))
      .limit(1);
    if (!winner || !loser) throw new Error("Restaurant not found.");

    const deleted = await tx.execute<{ id: number | string }>(sql`
      DELETE FROM mentions m1
      WHERE m1.restaurant_id = ${loserId}
      AND EXISTS (
        SELECT 1 FROM mentions m2
        WHERE m2.restaurant_id = ${winnerId}
        AND m2.thread_id = m1.thread_id
        AND m2.comment_id = m1.comment_id
      )
      RETURNING m1.id
    `);

    const moved = await tx
      .update(mentions)
      .set({ restaurantId: winnerId })
      .where(eq(mentions.restaurantId, loserId))
      .returning({ id: mentions.id });

    const merged = {
      name: loser.name.length > winner.name.length ? loser.name : winner.name,
      location: winner.location ?? loser.location,
      lat: winner.lat ?? loser.lat,
      lng: winner.lng ?? loser.lng,
    };

    await tx
      .update(restaurants)
      .set({
        ...merged,
        cuisine: winner.cuisine ?? loser.cuisine,
        status: "active",
        exclusionReason: null,
        chainConfidence: "independent",
        reviewedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(restaurants.id, winnerId));

    // Undo record + aliases so a re-ingest resolves both pre-merge rows to the winner
    // instead of re-minting the loser or forking the renamed winner (#152).
    await tx.insert(mergeLog).values({
      winnerId,
      loserId,
      loserSlug: loser.slug,
      loserName: loser.name,
      loserLocation: loser.location,
      loserStreet: loser.street,
      loserLat: loser.lat,
      loserLng: loser.lng,
      movedMentionIds: moved.map((m) => m.id),
      deletedMentionIds: deleted.rows.map((r) => Number(r.id)),
    });

    // Chained merges: aliases that pointed at the loser must follow it to the winner
    // (the FK would otherwise cascade-delete them with the loser row).
    await tx
      .update(restaurantAliases)
      .set({ restaurantId: winnerId })
      .where(eq(restaurantAliases.restaurantId, loserId));

    // Snapshot of each pre-merge row as the ingest would match it. The winner's snapshot
    // is only needed when the merge changed its match features.
    const winnerChanged =
      merged.name !== winner.name ||
      merged.location !== winner.location ||
      merged.lat !== winner.lat ||
      merged.lng !== winner.lng;
    await tx.insert(restaurantAliases).values(
      (winnerChanged ? [loser, winner] : [loser]).map((r) => ({
        restaurantId: winnerId,
        name: r.name,
        location: r.location,
        street: r.street,
        lat: r.lat,
        lng: r.lng,
        source: "merge",
      })),
    );

    await tx.delete(restaurants).where(eq(restaurants.id, loserId));
  });
}

/**
 * Rename a restaurant, keeping its slug. Snapshots the pre-rename row into
 * `restaurant_aliases` (source 'rename') so a re-ingest of the old spelling still
 * resolves to this row instead of forking a new one (#152, #156). Stamps `reviewed_at`
 * so the ingest upsert never reverts the human-chosen name.
 */
export async function renameRestaurant(
  id: number,
  newName: string,
): Promise<void> {
  const name = newName.trim();
  if (!name) throw new Error("Name is required.");

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, id))
      .limit(1);
    if (!row) throw new Error("Restaurant not found.");
    if (name === row.name)
      throw new Error("New name is the same as the current name.");

    await tx.insert(restaurantAliases).values({
      restaurantId: id,
      name: row.name,
      location: row.location,
      street: row.street,
      lat: row.lat,
      lng: row.lng,
      source: "rename",
    });

    await tx
      .update(restaurants)
      .set({ name, reviewedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(restaurants.id, id));
  });
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
      chainConfidence: "likely_chain",
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
      chainConfidence: "independent",
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

export type ReportChainResult =
  | "queued"
  | "already_excluded"
  | "already_queued"
  | "reviewed_keep_active"
  | "not_found";

/**
 * Public "Report a chain" action. Queues the restaurant for /admin/exclusions
 * without adding it to the denylist and without flipping chain_confidence to
 * likely_chain (that would hide it from the default-on Mom & pop map).
 * Human-reviewed rows are not overwritten.
 */
export async function reportRestaurantAsChain(
  slug: string,
): Promise<ReportChainResult> {
  const trimmed = slug.trim();
  if (!trimmed) return "not_found";

  const [row] = await db
    .select({
      id: restaurants.id,
      status: restaurants.status,
      reviewedAt: restaurants.reviewedAt,
    })
    .from(restaurants)
    .where(eq(restaurants.slug, trimmed))
    .limit(1);

  if (!row) return "not_found";
  if (row.status === "excluded") return "already_excluded";
  if (row.reviewedAt) return "reviewed_keep_active";
  if (row.status === "pending_review") return "already_queued";

  const updated = await db
    .update(restaurants)
    .set({
      status: "pending_review",
      exclusionReason: "user_reported_chain",
      updatedAt: sql`now()`,
    })
    .where(and(eq(restaurants.id, row.id), sql`reviewed_at IS NULL`))
    .returning({ id: restaurants.id });

  return updated.length === 0 ? "already_queued" : "queued";
}
