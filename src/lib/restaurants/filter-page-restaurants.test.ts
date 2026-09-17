import { describe, expect, it } from "vitest";
import { createSliceCache } from "./filter-restaurants";
import {
  filterBeforeFreshness,
  applyFreshnessFilter,
  filterPageRestaurantsWithSearch,
} from "./filter-page-restaurants";
import { makeRestaurant } from "./test-utils";

const pageFilterCtx = {
  threadSubreddit: {} as Record<string, string>,
  dateExtent: { min: 0, max: Date.now() },
  subredditSliceCache: createSliceCache(),
  recencySliceCache: createSliceCache(),
};

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

  it("hides likely_chain rows when Mom & pop is on", () => {
    const restaurants = [
      makeRestaurant({ slug: "pops", chain_confidence: "independent" }),
      makeRestaurant({ slug: "in-n-out", chain_confidence: "likely_chain" }),
      makeRestaurant({ slug: "mystery", chain_confidence: "unknown" }),
    ];
    const hidden = filterBeforeFreshness(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: [],
        activeCities: [],
        showUnmapped: true,
        showMomAndPop: true,
      },
      { threadSubreddit, subredditSliceCache: createSliceCache() },
    );
    expect(hidden.map((r) => r.slug)).toEqual(["pops", "mystery"]);

    const shown = filterBeforeFreshness(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: [],
        activeCities: [],
        showUnmapped: true,
        showMomAndPop: false,
      },
      { threadSubreddit, subredditSliceCache: createSliceCache() },
    );
    expect(shown.map((r) => r.slug)).toEqual(["pops", "in-n-out", "mystery"]);
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

  it("ANDs search with cuisine filter", () => {
    const restaurants = [
      makeRestaurant({ slug: "taco", name: "Taco Palace", cuisine: "Mexican" }),
      makeRestaurant({
        slug: "sushi",
        name: "Sushi Spot",
        cuisine: "Japanese",
      }),
    ];
    const { filtered } = filterPageRestaurantsWithSearch(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: ["Mexican"],
        activeCities: [],
        showUnmapped: true,
        freshnessCutoff: null,
        searchQuery: "taco",
      },
      pageFilterCtx,
    );
    expect(filtered.map((r) => r.slug)).toEqual(["taco"]);
  });

  it("leaves structured filter results unchanged when search is empty", () => {
    const restaurants = [
      makeRestaurant({ slug: "taco", name: "Taco Palace", cuisine: "Mexican" }),
      makeRestaurant({
        slug: "sushi",
        name: "Sushi Spot",
        cuisine: "Japanese",
      }),
    ];
    const { filtered } = filterPageRestaurantsWithSearch(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: ["Mexican"],
        activeCities: [],
        showUnmapped: true,
        freshnessCutoff: null,
        searchQuery: "",
      },
      pageFilterCtx,
    );
    expect(filtered.map((r) => r.slug)).toEqual(["taco"]);
  });

  it("yields no results when search matches nothing", () => {
    const restaurants = [
      makeRestaurant({ slug: "taco", name: "Taco Palace", cuisine: "Mexican" }),
    ];
    const { filtered } = filterPageRestaurantsWithSearch(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: [],
        activeCities: [],
        showUnmapped: true,
        freshnessCutoff: null,
        searchQuery: "zzznomatchxyz",
      },
      pageFilterCtx,
    );
    expect(filtered).toEqual([]);
  });

  it("counts unmapped matches even when they are hidden from results", () => {
    const restaurants = [
      makeRestaurant({ slug: "mapped", lat: 33.6, lng: -117.8 }),
      makeRestaurant({ slug: "unmapped", lat: null, lng: null }),
    ];
    const hidden = filterPageRestaurantsWithSearch(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: [],
        activeCities: [],
        showUnmapped: false,
        freshnessCutoff: null,
        searchQuery: "",
      },
      pageFilterCtx,
    );
    expect(hidden.filtered.map((r) => r.slug)).toEqual(["mapped"]);
    expect(hidden.unmappedCount).toBe(1);

    const included = filterPageRestaurantsWithSearch(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: [],
        activeCities: [],
        showUnmapped: true,
        freshnessCutoff: null,
        searchQuery: "",
      },
      pageFilterCtx,
    );
    expect(included.filtered.map((r) => r.slug)).toEqual([
      "mapped",
      "unmapped",
    ]);
    expect(included.unmappedCount).toBe(1);
  });
});
