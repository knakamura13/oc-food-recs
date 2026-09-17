export type ChainConfidence = "independent" | "likely_chain" | "unknown";

export const MOM_AND_POP_HELP =
  "No franchises or big chains — independent spots with up to three locations still count.";

/** Policy v1: independents and unknowns pass; likely_chain fails. */
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
