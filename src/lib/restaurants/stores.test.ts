import { describe, expect, it } from "vitest";
import {
  findFilterMatch,
  latestMentionMs,
  normalizeCity,
  normalizeCuisine,
  REPEAT_AUTHOR_DECAY,
  weightedAggregates,
} from "./stores.svelte";
import { makeRestaurant } from "./test-utils";
import type { ListMention } from "./types";

function mention(overrides: Partial<ListMention> = {}): ListMention {
  return {
    author: "alice",
    score: 1,
    comment_date: null,
    thread_id: "t1",
    role: "primary",
    credit: 1,
    ...overrides,
  };
}

describe("stores utilities", () => {
  describe("normalizeCuisine", () => {
    it("maps known aliases to canonical cuisine names", () => {
      expect(normalizeCuisine("KBBQ")).toBe("Korean");
      expect(normalizeCuisine("Ramen")).toBe("Japanese");
    });

    it("maps consolidated aliases case-insensitively", () => {
      expect(normalizeCuisine("argentinian")).toBe("Latin American");
      expect(normalizeCuisine("British Indian")).toBe("Indian");
    });

    it("merges every Ice Cream / Donuts spelling into Dessert", () => {
      expect(normalizeCuisine("ice cream")).toBe("Dessert");
      expect(normalizeCuisine("Ice Cream")).toBe("Dessert");
      expect(normalizeCuisine("donuts")).toBe("Dessert");
      expect(normalizeCuisine("Donuts")).toBe("Dessert");
    });

    it("title-cases unknown cuisines and handles null", () => {
      expect(normalizeCuisine("ethiopian")).toBe("Ethiopian");
      expect(normalizeCuisine(null)).toBe("Unknown");
    });
  });

  describe("normalizeCity", () => {
    it("normalizes multi-city and alias locations", () => {
      expect(normalizeCity("Anaheim Hills")).toBe("Anaheim");
      expect(normalizeCity("Newport")).toBe("Newport Beach");
    });

    it("returns null for missing locations", () => {
      expect(normalizeCity(null)).toBeNull();
    });

    it("folds abbreviations, misspellings and stray casing into the real city", () => {
      expect(normalizeCity("YL")).toBe("Yorba Linda");
      expect(normalizeCity("SC")).toBe("San Clemente");
      expect(normalizeCity("Santana")).toBe("Santa Ana");
      expect(normalizeCity("  yorba linda ")).toBe("yorba linda");
      expect(normalizeCity("newport")).toBe("Newport Beach");
    });
  });

  describe("weightedAggregates", () => {
    it("decays repeat mentions from the same author", () => {
      const mentions: ListMention[] = [
        mention({ author: "alice", score: 10 }),
        mention({ author: "alice", score: 8, role: "endorsement" }),
      ];

      const result = weightedAggregates(mentions);
      const raw = 10 + 8 * REPEAT_AUTHOR_DECAY;

      // One voice: shrunk by 1/(1+2).
      expect(result.aggregate_score).toBe(Math.round(raw / 3));
      expect(result.mention_count).toBe(1);
    });

    it("counts each anonymous mention as a distinct voice", () => {
      const mentions: ListMention[] = [
        mention({ author: "[deleted]", score: 5 }),
        mention({ author: "[deleted]", score: 3, role: "endorsement" }),
      ];

      const result = weightedAggregates(mentions);

      // Two voices: shrunk by 2/(2+2).
      expect(result.aggregate_score).toBe(Math.round(8 / 2));
      expect(result.mention_count).toBe(2);
    });

    it("pays a comment's upvotes only in proportion to its credit", () => {
      const shared = weightedAggregates([
        mention({ author: "a", score: 300, credit: 1 / 6 }),
        mention({ author: "b", score: 300, credit: 1 / 6 }),
      ]);
      const solo = weightedAggregates([
        mention({ author: "a", score: 50 }),
        mention({ author: "b", score: 50 }),
      ]);

      expect(shared).toEqual(solo);
    });

    it("shrinks few-voice rows so breadth beats one big comment", () => {
      const oneBig = weightedAggregates([mention({ author: "a", score: 225 })]);
      const broad = weightedAggregates(
        ["a", "b", "c", "d", "e", "f"].map((author) =>
          mention({ author, score: 60 }),
        ),
      );

      expect(oneBig.aggregate_score).toBe(75);
      expect(broad.aggregate_score).toBe(270);
    });

    it("scores an empty slice as zero", () => {
      expect(weightedAggregates([])).toEqual({
        aggregate_score: 0,
        mention_count: 0,
      });
    });
  });

  describe("latestMentionMs", () => {
    it("returns the newest dated mention in epoch ms", () => {
      const r = makeRestaurant({
        mentions: [
          mention({ comment_date: "2024-03-01T00:00:00Z" }),
          mention({ comment_date: "2025-08-15T12:00:00Z" }),
          mention({ comment_date: "2025-01-10T00:00:00Z" }),
        ],
      });

      expect(latestMentionMs(r)).toBe(Date.parse("2025-08-15T12:00:00Z"));
    });

    it("ignores null and unparseable dates", () => {
      const r = makeRestaurant({
        mentions: [
          mention({ comment_date: null }),
          mention({ comment_date: "not-a-date" }),
          mention({ comment_date: "2024-06-01T00:00:00Z" }),
        ],
      });

      expect(latestMentionMs(r)).toBe(Date.parse("2024-06-01T00:00:00Z"));
    });

    it("returns null when no mention has a parseable date", () => {
      const r = makeRestaurant({
        mentions: [
          mention({ comment_date: null }),
          mention({ comment_date: "not-a-date" }),
        ],
      });

      expect(latestMentionMs(r)).toBeNull();
    });
  });

  describe("findFilterMatch", () => {
    const cuisineNames = ["Mexican", "Japanese", "Chinese", "Latin American"];
    const cityNames = ["Irvine", "Santa Ana"];

    it("matches cuisine synonyms", () => {
      expect(findFilterMatch("tacos", cuisineNames, cityNames)).toEqual({
        type: "cuisine",
        value: "Mexican",
      });
    });

    it("matches city names directly", () => {
      expect(findFilterMatch("irvine", cuisineNames, cityNames)).toEqual({
        type: "city",
        value: "Irvine",
      });
    });

    it("matches consolidated cuisine aliases", () => {
      expect(findFilterMatch("argentinian", cuisineNames, cityNames)).toEqual({
        type: "cuisine",
        value: "Latin American",
      });
    });

    it("ignores single-letter and two-letter noise queries", () => {
      expect(findFilterMatch("p", cuisineNames, cityNames)).toBeNull();
      expect(findFilterMatch("y", cuisineNames, cityNames)).toBeNull();
      expect(findFilterMatch("ir", cuisineNames, cityNames)).toBeNull();
    });

    it("matches synonyms only on whole words, never inside a longer word", () => {
      // "pho" is a Vietnamese synonym, but "phoenix" merely contains it.
      const names = [...cuisineNames, "Vietnamese"];
      expect(findFilterMatch("phoenix", names, cityNames)).toBeNull();
      expect(findFilterMatch("pho 79", names, cityNames)).toEqual({
        type: "cuisine",
        value: "Vietnamese",
      });
    });

    it("maps dish names to their cuisine", () => {
      const names = ["Mexican", "Deli", "Japanese", "Mediterranean"];
      for (const [dish, cuisine] of [
        ["birria", "Mexican"],
        ["carnitas", "Mexican"],
        ["al pastor", "Mexican"],
        ["pastrami", "Deli"],
        ["omakase", "Japanese"],
        ["shawarma", "Mediterranean"],
      ]) {
        expect(findFilterMatch(dish, names, cityNames)).toEqual({
          type: "cuisine",
          value: cuisine,
        });
      }
    });

    it("matches canonical cuisine names directly", () => {
      expect(findFilterMatch("chinese", cuisineNames, cityNames)).toEqual({
        type: "cuisine",
        value: "Chinese",
      });
    });
  });
});
