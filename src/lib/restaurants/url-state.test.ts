import { describe, expect, it } from "vitest";
import {
  buildSearchParams,
  FRESHNESS_SINCE_VISIT,
  parseSearchParams,
} from "./url-state";
import type { UrlStateSnapshot } from "./url-state";

const defaults: UrlStateSnapshot = {
  searchQuery: "",
  activeCuisines: [],
  activeCities: [],
  activeSubreddits: [],
  freshnessCutoff: null,
  freshnessSource: null,
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
      freshnessSource: "date",
      sortKey: "name",
      sortDirection: "asc",
      selectedRestaurantSlug: "taco-spot",
      showUnmapped: true,
    });
  });

  it("parses since=visit as last-visit source without a date cutoff", () => {
    expect(parseSearchParams(new URLSearchParams("since=visit"))).toEqual({
      freshnessSource: "visit",
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

  it("produces a non-empty query for first-load sort so replaceState can update the address bar", () => {
    expect(
      buildSearchParams({
        ...defaults,
        sortKey: "name",
        sortDirection: "asc",
      }).toString(),
    ).not.toBe("");
    expect(
      buildSearchParams({
        ...defaults,
        activeCuisines: ["Mexican"],
      }).toString(),
    ).toBe("cuisine=Mexican");
  });

  it("round-trips non-default state", () => {
    const state: UrlStateSnapshot = {
      ...defaults,
      searchQuery: "ramen",
      activeCuisines: ["Japanese"],
      activeCities: ["Costa Mesa"],
      activeSubreddits: ["orangecounty"],
      freshnessCutoff: Date.parse("2025-01-15T00:00:00Z"),
      freshnessSource: "date",
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
    expect(parseSearchParams(built).freshnessSource).toBe("date");
  });

  it("serializes last-visit as since=visit, not a truncated date", () => {
    const visitMs = Date.parse("2024-06-01T15:30:00Z");
    const built = buildSearchParams({
      ...defaults,
      freshnessCutoff: visitMs,
      freshnessSource: "visit",
    });
    expect(built.get("since")).toBe(FRESHNESS_SINCE_VISIT);
    expect(parseSearchParams(built)).toEqual({ freshnessSource: "visit" });
  });

  it("round-trips a histogram date even on the last-visit calendar day", () => {
    const dayStart = Date.parse("2024-06-01T00:00:00Z");
    const built = buildSearchParams({
      ...defaults,
      freshnessCutoff: dayStart,
      freshnessSource: "date",
    });
    expect(built.get("since")).toBe("2024-06-01");
    expect(parseSearchParams(built)).toEqual({
      freshnessCutoff: dayStart,
      freshnessSource: "date",
    });
  });

  it("omits since when last-visit source has no cutoff", () => {
    expect(
      buildSearchParams({
        ...defaults,
        freshnessSource: "visit",
      }).get("since"),
    ).toBeNull();
  });
});
