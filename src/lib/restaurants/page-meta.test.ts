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
  makeRestaurant({ cuisine: "Mexican", location: "Santa Ana" }),
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

  it("builds canonical share URLs with query params", () => {
    const url = buildCanonicalShareUrl("https://example.com", "/", {
      searchQuery: "tacos",
      activeCuisines: ["Mexican"],
    });
    expect(url).toBe("https://example.com/?q=tacos&cuisine=Mexican");
  });

  it("builds combined page meta for SSR", () => {
    const pageMeta = buildPageMeta(
      { searchQuery: "tacos" },
      restaurants,
      meta,
      "https://example.com",
      "/",
      { t1: "orangecounty" },
    );
    expect(pageMeta.title).toContain("tacos");
    expect(pageMeta.description).toContain("matching");
    expect(pageMeta.shareUrl).toContain("q=tacos");
  });
});
