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
