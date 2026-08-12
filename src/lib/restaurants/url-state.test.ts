import { describe, expect, it } from "vitest";
import { buildSearchParams, parseSearchParams } from "./url-state";
import type { UrlStateSnapshot } from "./url-state";

const defaults: UrlStateSnapshot = {
  searchQuery: "",
  activeCuisines: [],
  activeCities: [],
  activeSubreddits: [],
  freshnessCutoff: null,
  showUnmapped: false,
  sortKey: "score",
  sortDirection: "desc",
  selectedRestaurantSlug: null,
};

describe("parseSearchParams", () => {
  it("parses all supported params", () => {
    const params = new URLSearchParams(
      "q=tacos&cuisine=Mexican,Thai&city=Irvine&subreddit=orangecounty&since=2024-06-01&sort=name&sortdir=asc&restaurant=taco-spot&unmapped=1",
    );
    expect(parseSearchParams(params)).toEqual({
      searchQuery: "tacos",
      activeCuisines: ["Mexican", "Thai"],
      activeCities: ["Irvine"],
      activeSubreddits: ["orangecounty"],
      freshnessCutoff: Date.parse("2024-06-01"),
      sortKey: "name",
      sortDirection: "asc",
      selectedRestaurantSlug: "taco-spot",
      showUnmapped: true,
    });
  });

  it("ignores invalid sort and since values", () => {
    const params = new URLSearchParams(
      "sort=invalid&sortdir=up&since=not-a-date",
    );
    expect(parseSearchParams(params)).toEqual({});
  });

  it("accepts unmapped=true", () => {
    expect(parseSearchParams(new URLSearchParams("unmapped=true"))).toEqual({
      showUnmapped: true,
    });
  });
});

describe("buildSearchParams", () => {
  it("omits default sort and sortdir", () => {
    expect(buildSearchParams(defaults).toString()).toBe("");
  });

  it("omits sort for score and includes sortdir only when not desc", () => {
    expect(
      buildSearchParams({ ...defaults, sortKey: "score", sortDirection: "asc" }).toString(),
    ).toBe("sortdir=asc");
    expect(
      buildSearchParams({
        ...defaults,
        sortKey: "name",
        sortDirection: "asc",
      }).toString(),
    ).toBe("sort=name&sortdir=asc");
    expect(
      buildSearchParams({
        ...defaults,
        sortKey: "name",
        sortDirection: "desc",
      }).toString(),
    ).toBe("sort=name");
    expect(
      buildSearchParams({
        ...defaults,
        sortKey: "recency",
        sortDirection: "desc",
      }).toString(),
    ).toBe("sort=recency");
  });

  it("round-trips non-default state", () => {
    const state: UrlStateSnapshot = {
      ...defaults,
      searchQuery: "ramen",
      activeCuisines: ["Japanese"],
      activeCities: ["Costa Mesa"],
      activeSubreddits: ["orangecounty"],
      freshnessCutoff: Date.parse("2025-01-15T00:00:00Z"),
      sortKey: "recency",
      sortDirection: "asc",
      selectedRestaurantSlug: "men-ya",
      showUnmapped: true,
    };
    const built = buildSearchParams(state);
    expect(parseSearchParams(built)).toMatchObject({
      searchQuery: "ramen",
      activeCuisines: ["Japanese"],
      activeCities: ["Costa Mesa"],
      activeSubreddits: ["orangecounty"],
      sortKey: "recency",
      sortDirection: "asc",
      selectedRestaurantSlug: "men-ya",
      showUnmapped: true,
    });
    expect(built.get("since")).toBe("2025-01-15");
  });
});
