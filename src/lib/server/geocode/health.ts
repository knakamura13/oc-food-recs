import { db } from "$lib/server/db";
import { geocodeCache, restaurants } from "$lib/server/db/schema";
import { and, desc, isNull, sql } from "drizzle-orm";

const unresolvedAndNotClosed = sql`
	(${restaurants.lat} is null or ${restaurants.lng} is null)
	and not exists (
		select 1
		from ${geocodeCache}
		where ${geocodeCache.query} = lower(concat_ws(
			'|',
			${restaurants.name},
			nullif(trim(${restaurants.street}), ''),
			nullif(trim(${restaurants.location}), '')
		))
		and ${geocodeCache.detail} = 'google: closed permanently'
	)
`;

export interface GeocodeHealthStats {
  totalCached: number;
  successes: number;
  failures: number;
  activeNegative: number;
  successRate: number;
  providerBreakdown: Array<{ provider: string; count: number }>;
  topFailures: Array<{ detail: string | null; count: number }>;
  topCities: Array<{ city: string | null; count: number }>;
}

export interface UnresolvedRestaurant {
  id: number;
  name: string;
  slug: string;
  location: string | null;
  street: string | null;
  cuisine: string | null;
}

export interface NegativeCacheEntry {
  id: number;
  query: string;
  provider: string;
  detail: string | null;
  retryAfter: Date | null;
  active: boolean;
}

export async function loadGeocodeHealthStats(): Promise<GeocodeHealthStats> {
  const [totals] = await db
    .select({
      totalCached: sql<number>`count(*)::int`,
      successes: sql<number>`count(*) filter (where ${geocodeCache.lat} is not null)::int`,
      failures: sql<number>`count(*) filter (where ${geocodeCache.lat} is null)::int`,
      activeNegative: sql<number>`count(*) filter (where ${geocodeCache.lat} is null and ${geocodeCache.retryAfter} > now())::int`,
    })
    .from(geocodeCache);

  const totalCached = totals?.totalCached ?? 0;
  const successes = totals?.successes ?? 0;
  const failures = totals?.failures ?? 0;
  const activeNegative = totals?.activeNegative ?? 0;

  const providerBreakdown = await db
    .select({
      provider: geocodeCache.provider,
      count: sql<number>`count(*)::int`,
    })
    .from(geocodeCache)
    .where(sql`${geocodeCache.lat} is not null`)
    .groupBy(geocodeCache.provider)
    .orderBy(desc(sql`count(*)`));

  const topFailures = await db
    .select({
      detail: geocodeCache.detail,
      count: sql<number>`count(*)::int`,
    })
    .from(geocodeCache)
    .where(sql`${geocodeCache.lat} is null`)
    .groupBy(geocodeCache.detail)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topCities = await db
    .select({
      city: geocodeCache.geocodedCity,
      count: sql<number>`count(*)::int`,
    })
    .from(geocodeCache)
    .where(
      and(
        sql`${geocodeCache.lat} is not null`,
        sql`${geocodeCache.geocodedCity} is not null`,
      ),
    )
    .groupBy(geocodeCache.geocodedCity)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    totalCached,
    successes,
    failures,
    activeNegative,
    successRate: totalCached > 0 ? (successes / totalCached) * 100 : 0,
    providerBreakdown,
    topFailures,
    topCities,
  };
}

export async function loadUnresolvedRestaurants(
  limit = 50,
): Promise<UnresolvedRestaurant[]> {
  return db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      location: restaurants.location,
      street: restaurants.street,
      cuisine: restaurants.cuisine,
    })
    .from(restaurants)
    .where(unresolvedAndNotClosed)
    .orderBy(restaurants.name)
    .limit(limit);
}

export async function loadNegativeCacheEntries(
  limit = 50,
): Promise<NegativeCacheEntry[]> {
  const rows = await db
    .select({
      id: geocodeCache.id,
      query: geocodeCache.query,
      provider: geocodeCache.provider,
      detail: geocodeCache.detail,
      retryAfter: geocodeCache.retryAfter,
      active: sql<boolean>`(${geocodeCache.retryAfter} > now())`,
    })
    .from(geocodeCache)
    .where(isNull(geocodeCache.lat))
    .orderBy(desc(geocodeCache.createdAt))
    .limit(limit);

  return rows;
}

export async function countUnresolvedRestaurants(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(restaurants)
    .where(unresolvedAndNotClosed);
  return row?.count ?? 0;
}
