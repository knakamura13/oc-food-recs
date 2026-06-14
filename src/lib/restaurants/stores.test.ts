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
  });

  describe("weightedAggregates", () => {
    it("decays repeat mentions from the same author", () => {
      const mentions: ListMention[] = [
        {
          author: "alice",
          score: 10,
          comment_date: null,
          thread_id: "t1",
          role: "primary",
        },
        {
          author: "alice",
          score: 8,
          comment_date: null,
          thread_id: "t1",
          role: "endorsement",
        },
      ];

      const result = weightedAggregates(mentions);
      const expectedScore = Math.round(10 + 8 * REPEAT_AUTHOR_DECAY);

      expect(result.aggregate_score).toBe(expectedScore);
      expect(result.mention_count).toBe(1);
    });

    it("counts each anonymous mention as a distinct voice", () => {
      const mentions: ListMention[] = [
        {
          author: "[deleted]",
          score: 5,
          comment_date: null,
          thread_id: "t1",
          role: "primary",
        },
        {
          author: "[deleted]",
          score: 3,
          comment_date: null,
          thread_id: "t1",
          role: "endorsement",
        },
      ];

      const result = weightedAggregates(mentions);

      expect(result.aggregate_score).toBe(8);
      expect(result.mention_count).toBe(2);
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

    it("matches canonical cuisine names directly", () => {
      expect(findFilterMatch("chinese", cuisineNames, cityNames)).toEqual({
        type: "cuisine",
        value: "Chinese",
      });
    });
  });
});
