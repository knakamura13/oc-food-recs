import type { Restaurant } from "./types";

/**
 * Google Maps link for a restaurant. Mapped rows get a directions deep link keyed by
 * coordinates, which disambiguates duplicate names; unmapped rows fall back to a name search.
 */
export function googleMapsUrl(
  restaurant: Pick<Restaurant, "name" | "location" | "lat" | "lng">,
): string {
  if (restaurant.lat != null && restaurant.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`;
  }
  const query = `${restaurant.name} ${restaurant.location || "Orange County"} CA`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
