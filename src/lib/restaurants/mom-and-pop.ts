export type ChainConfidence = "independent" | "likely_chain" | "unknown";

/** Public visibility: independent and unknown rows pass; likely_chain rows never do. */
export function passesMomAndPopFilter(
  restaurant: Pick<RestaurantConfidence, "chain_confidence" | "slug">,
): boolean {
  const confidence = restaurant.chain_confidence ?? "unknown";
  return confidence !== "likely_chain";
}

export interface RestaurantConfidence {
  slug: string;
  chain_confidence?: ChainConfidence | null;
}
