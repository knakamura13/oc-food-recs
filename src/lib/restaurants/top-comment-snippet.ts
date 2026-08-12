import { findRestaurantMatch } from "./snippet";

const INELIGIBLE = new Set(["filler", "question"]);

const WEAK_NAME_WORDS = new Set([
  "the",
  "and",
  "a",
  "of",
  "in",
  "to",
  "for",
  "with",
  "on",
  "at",
  "by",
  "an",
  "el",
  "la",
  "los",
  "las",
  "restaurant",
  "cafe",
  "bakery",
  "kitchen",
  "place",
  "grill",
  "house",
  "bar",
  "shop",
  "coffee",
  "co",
  "pizza",
  "taco",
  "tacos",
  "burger",
  "burgers",
  "food",
  "market",
  "deli",
  "inn",
  "bistro",
  "pub",
  "lounge",
  "taqueria",
  "express",
  "boba",
  "tea",
  "creme",
  "cream",
  "cuisine",
]);

export type SnippetCandidate = {
  body: string;
  score: number;
  classification: string | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namesRestaurant(body: string, restaurantName: string): boolean {
  const keywords = restaurantName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 3 && !WEAK_NAME_WORDS.has(word));
  if (keywords.length === 0) {
    return Boolean(findRestaurantMatch(body, restaurantName));
  }
  return keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword)}(?:'s|’s|s)?\\b`, "i").test(body),
  );
}

export function pickTopCommentSnippet(
  restaurantName: string,
  candidates: SnippetCandidate[],
): string | null {
  const eligible = candidates.filter((candidate) => {
    if (!(candidate.body ?? "").trim()) return false;
    const classification = candidate.classification ?? "";
    return !INELIGIBLE.has(classification);
  });
  if (eligible.length === 0) return null;

  const named = eligible.filter((candidate) =>
    namesRestaurant(candidate.body, restaurantName),
  );
  const pool = named.length > 0 ? named : eligible;
  let winner = pool[0];
  for (const candidate of pool) {
    if (candidate.score > winner.score) winner = candidate;
  }
  return winner.body;
}
