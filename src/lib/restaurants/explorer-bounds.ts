/** Map fit-bounds coords for the restaurants the explorer currently shows. */
export function coordsForFitBounds(
  restaurants: Array<{ lat?: number | null; lng?: number | null }>,
): Array<{ lat: number; lng: number }> {
  return restaurants
    .filter(
      (r): r is { lat: number; lng: number } => r.lat != null && r.lng != null,
    )
    .map((r) => ({ lat: r.lat, lng: r.lng }));
}

/** Below this many points every restaurant counts; above it, stragglers are ignored. */
const OUTLIER_TRIM_MIN_POINTS = 30;
const OUTLIER_TRIM_FRACTION = 0.03;

/**
 * Two corners [[south, west], [north, east]] for fitting the map to the shown restaurants.
 *
 * The dataset includes a few places far outside Orange County (Los Angeles, Riverside,
 * San Diego). Fitting to every point zoomed the map out to all of Southern California.
 * For large sets this ignores the outermost 3% on each axis so the view frames where the
 * restaurants actually are; the stragglers stay reachable by panning. Small sets, such as a
 * single restaurant or a tight filter, always fit every point.
 */
export function fitCorners(
  coords: Array<{ lat: number; lng: number }>,
): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  const range = (values: number[]): [number, number] => {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length < OUTLIER_TRIM_MIN_POINTS) return [sorted[0], sorted[sorted.length - 1]];
    const last = sorted.length - 1;
    return [
      sorted[Math.floor(OUTLIER_TRIM_FRACTION * last)],
      sorted[Math.ceil((1 - OUTLIER_TRIM_FRACTION) * last)],
    ];
  };
  const [south, north] = range(coords.map((c) => c.lat));
  const [west, east] = range(coords.map((c) => c.lng));
  return [[south, west], [north, east]];
}

/** The part of the map the visitor is looking at, in degrees. */
export type MapViewBounds = { south: number; west: number; north: number; east: number };

/**
 * Restaurants inside the visible map area. Restaurants with no coordinates are never
 * "in" an area, so they only stay when the visitor asked to include unmapped places.
 */
export function restaurantsInBounds<T extends { lat?: number | null; lng?: number | null }>(
  restaurants: T[],
  bounds: MapViewBounds,
  { keepUnmapped = false }: { keepUnmapped?: boolean } = {},
): T[] {
  return restaurants.filter((r) => {
    if (r.lat == null || r.lng == null) return keepUnmapped;
    return (
      r.lat >= bounds.south && r.lat <= bounds.north &&
      r.lng >= bounds.west && r.lng <= bounds.east
    );
  });
}
