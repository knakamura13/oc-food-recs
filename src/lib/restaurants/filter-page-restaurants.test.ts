import { describe, expect, it } from "vitest";
import { createSliceCache } from "./filter-restaurants";
import {
  filterBeforeFreshness,
  applyFreshnessFilter,
  filterPageFacetPopulations,
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

  it("always hides likely_chain rows, including legacy toggle overrides", () => {
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
        // Stale client state must not bypass the unconditional policy.
        ...({ showMomAndPop: false }),
      },
      { threadSubreddit, subredditSliceCache: createSliceCache() },
    );
    expect(shown.map((r) => r.slug)).toEqual(["pops", "mystery"]);
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
            credit: 1,
          },
          {
            thread_id: "t1",
            author: "b",
            score: 3,
            role: "endorsement",
            comment_date: "2025-06-01",
            credit: 1,
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

  it("returns search results in relevance order", () => {
    const restaurants = [
      makeRestaurant({ slug: "a", name: "Birria Zone Tacos", cuisine: "Mexican" }),
      makeRestaurant({ slug: "b", name: "Birria", cuisine: "Mexican" }),
      makeRestaurant({ slug: "c", name: "Best Birria Spot", cuisine: "Mexican" }),
    ];
    const { filtered } = filterPageRestaurantsWithSearch(
      restaurants,
      {
        activeSubreddits: [],
        activeCuisines: [],
        activeCities: [],
        showUnmapped: true,
        freshnessCutoff: null,
        searchQuery: "birria",
      },
      pageFilterCtx,
    );
    expect(filtered.map((r) => r.slug)).toEqual(["b", "a", "c"]);
  });

  describe("filterPageFacetPopulations", () => {
    const base = {
      activeSubreddits: [],
      activeCuisines: [] as string[],
      activeCities: [] as string[],
      showUnmapped: false,
      freshnessCutoff: null,
      searchQuery: "",
    };
    const roster = [
      makeRestaurant({ slug: "it-irv", cuisine: "Italian", location: "Irvine" }),
      makeRestaurant({ slug: "it-cm", cuisine: "Italian", location: "Costa Mesa" }),
      makeRestaurant({ slug: "jp-cm", cuisine: "Japanese", location: "Costa Mesa" }),
      makeRestaurant({
        slug: "jp-unmapped",
        cuisine: "Japanese",
        location: "Irvine",
        lat: null,
        lng: null,
      }),
    ];

    it("counts each facet under every filter except its own", () => {
      const pops = filterPageFacetPopulations(
        roster,
        { ...base, activeCuisines: ["Italian"], activeCities: ["Costa Mesa"] },
        pageFilterCtx,
      );
      // Cuisine menu: only the active city applies, so Japanese is still offered.
      expect(pops.cuisine.map((r) => r.slug).sort()).toEqual(["it-cm", "jp-cm"]);
      // City menu: only the active cuisine applies.
      expect(pops.city.map((r) => r.slug).sort()).toEqual(["it-cm", "it-irv"]);
    });

    it("excludes unmapped rows unless they are shown, and applies the search", () => {
      const hidden = filterPageFacetPopulations(roster, base, pageFilterCtx);
      expect(hidden.cuisine.map((r) => r.slug)).not.toContain("jp-unmapped");
      const shown = filterPageFacetPopulations(
        roster,
        { ...base, showUnmapped: true },
        pageFilterCtx,
      );
      expect(shown.cuisine.map((r) => r.slug)).toContain("jp-unmapped");
    });

    it("folds Unknown and Other into one Uncategorized cuisine filter", () => {
      const rows = [
        makeRestaurant({ slug: "x", cuisine: null }),
        makeRestaurant({ slug: "y", cuisine: "Polynesian" }),
        makeRestaurant({ slug: "z", cuisine: "Italian" }),
      ];
      const { filtered } = filterPageRestaurantsWithSearch(
        rows,
        { ...base, activeCuisines: ["Uncategorized"] },
        pageFilterCtx,
      );
      expect(filtered.map((r) => r.slug).sort()).toEqual(["x", "y"]);
    });
  });
});
