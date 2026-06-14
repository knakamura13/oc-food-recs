import { describe, expect, it } from "vitest";
import { createSliceCache } from "./filter-restaurants";
import {
  filterBeforeFreshness,
  applyFreshnessFilter,
} from "./filter-page-restaurants";
import { makeRestaurant } from "./test-utils";

describe("filter-page-restaurants", () => {
  const threadSubreddit = { t1: "orangecounty", t2: "irvine" };

  it("filters by cuisine and city", () => {
    const restaurants = [
      makeRestaurant({ cuisine: "Mexican", location: "Santa Ana" }),
      makeRestaurant({
        slug: "b",
        name: "B",
        cuisine: "Japanese",
        location: "Irvine",
      }),
    ];
    const result = filterBeforeFreshness(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: ["Mexican"],
        activeCities: ["Santa Ana"],
        showUnmapped: true,
      },
      { threadSubreddit, subredditSliceCache: createSliceCache() },
    );
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("test-restaurant");
  });

  it("hides unmapped when showUnmapped is false", () => {
    const restaurants = [
      makeRestaurant({ lat: 33.6, lng: -117.8 }),
      makeRestaurant({ slug: "unmapped", lat: null, lng: null }),
    ];
    const result = filterBeforeFreshness(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: [],
        activeCities: [],
        showUnmapped: false,
      },
      { threadSubreddit, subredditSliceCache: createSliceCache() },
    );
    expect(result).toHaveLength(1);
    expect(result[0].lat).not.toBeNull();
  });

  it("filters mentions by recency cutoff", () => {
    const restaurants = [
      makeRestaurant({
        mentions: [
          {
            thread_id: "t1",
            author: "a",
            score: 5,
            role: "primary",
            comment_date: "2024-01-01",
          },
          {
            thread_id: "t1",
            author: "b",
            score: 3,
            role: "endorsement",
            comment_date: "2025-06-01",
          },
        ],
      }),
    ];
    const cutoff = Date.parse("2025-01-01");
    const result = applyFreshnessFilter(
      restaurants,
      cutoff,
      Date.parse("2020-01-01"),
      createSliceCache(),
    );
    expect(result).toHaveLength(1);
    expect(result[0].mention_count).toBe(1);
  });
});
