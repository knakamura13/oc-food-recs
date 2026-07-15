import { describe, expect, it } from "vitest";
import {
  buildCanonicalShareUrl,
  buildPageDescription,
  buildPageMeta,
  buildPageTitle,
} from "./page-meta";
import { makeRestaurant } from "./test-utils";

const meta = {
  source_threads: [{ id: "t1", subreddit: "orangecounty" } as never],
  total_comments_processed: 100,
};

const restaurants = [
  makeRestaurant({
    name: "La Taco Spot",
    slug: "la-taco-spot",
    cuisine: "Mexican",
    location: "Santa Ana",
  }),
  makeRestaurant({
    name: "Ramen House",
    slug: "ramen-house",
    cuisine: "Japanese",
    location: "Irvine",
  }),
];

describe("page-meta", () => {
  it("builds a default title when no filters are active", () => {
    expect(buildPageTitle({})).toContain("Orange County");
  });

  it("builds a filtered title from search and cuisine", () => {
    expect(
      buildPageTitle({
        searchQuery: "tacos",
        activeCuisines: ["Mexican"],
      }),
    ).toBe('"tacos" Mexican — OC Food Recs');
  });

  it("includes subreddit, recency, restaurant name, and sort in the title", () => {
    expect(
      buildPageTitle(
        {
          activeSubreddits: ["orangecounty"],
          freshnessCutoff: Date.parse("2025-01-01"),
          sortKey: "name",
          selectedRestaurantSlug: "la-taco-spot",
        },
        "La Taco Spot",
      ),
    ).toBe("r/orangecounty recent La Taco Spot by name — OC Food Recs");
  });

  it("summarizes multiple cuisines and cities", () => {
    expect(
      buildPageTitle({
        activeCuisines: ["Mexican", "Japanese"],
        activeCities: ["Irvine", "Santa Ana"],
      }),
    ).toBe("2 cuisines in 2 cities — OC Food Recs");
  });

  it("describes filtered result counts", () => {
    const description = buildPageDescription(
      { activeCuisines: ["Mexican"] },
      restaurants,
      meta,
      { t1: "orangecounty" },
    );
    expect(description).toContain("1 community-recommended");
    expect(description).toContain("filters applied");
  });

  it("describes zero results when search matches nothing", () => {
    const description = buildPageDescription(
      { searchQuery: "zzznomatchxyz" },
      restaurants,
      meta,
      { t1: "orangecounty" },
    );
    expect(description).toContain("0 community-recommended");
    expect(description).toContain('matching "zzznomatchxyz"');
  });

  it("uses default description for whitespace-only search", () => {
    const description = buildPageDescription(
      { searchQuery: "   " },
      restaurants,
      meta,
      { t1: "orangecounty" },
    );
    expect(description).toContain("Explore 2 community-recommended");
    expect(description).not.toContain("matching");
  });

  it("builds canonical share URLs with query params", () => {
    const url = buildCanonicalShareUrl("https://example.com", "/", {
      searchQuery: "tacos",
      activeCuisines: ["Mexican"],
      selectedRestaurantSlug: "la-taco-spot",
      sortKey: "name",
      sortDirection: "asc",
    });
    expect(url).toBe(
      "https://example.com/?q=tacos&cuisine=Mexican&sort=name&sortdir=asc&restaurant=la-taco-spot",
    );
  });

  it("builds combined page meta for SSR", () => {
    const pageMeta = buildPageMeta(
      { searchQuery: "tacos", selectedRestaurantSlug: "la-taco-spot" },
      restaurants,
      meta,
      "https://example.com",
      "/",
      { t1: "orangecounty" },
    );
    expect(pageMeta.title).toContain("tacos");
    expect(pageMeta.title).toContain("La Taco Spot");
    expect(pageMeta.description).toContain("matching");
    expect(pageMeta.shareUrl).toContain("q=tacos");
    expect(pageMeta.shareUrl).toContain("restaurant=la-taco-spot");
  });
});
