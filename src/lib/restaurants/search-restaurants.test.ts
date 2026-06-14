import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "./normalize-name";
import {
  FUSE_SEARCH_OPTIONS,
  prepareSearchIndex,
  rankSearchResults,
} from "./search-restaurants";
import { makeRestaurant } from "./test-utils";

const orangeDecoys = [
  makeRestaurant({
    name: "Super Antojitos",
    slug: "super-antojitos",
    cuisine: "Mexican",
    location: "Orange",
  }),
  makeRestaurant({
    name: "Cortinas",
    slug: "cortinas",
    cuisine: "Italian",
    location: "Orange",
  }),
  makeRestaurant({
    name: "Tacos Jaliscos",
    slug: "tacos-jaliscos",
    cuisine: "Mexican",
    location: "Orange",
  }),
  makeRestaurant({
    name: "Goodies in the Pantry",
    slug: "goodies-pantry",
    cuisine: "Butcher",
    location: "Orange",
  }),
  makeRestaurant({
    name: "Heemo Sushi",
    slug: "heemo-sushi",
    cuisine: "Sushi",
    location: "Orange",
  }),
  makeRestaurant({ name: "Tikiyaki", slug: "tikiyaki", location: "Orange" }),
  makeRestaurant({ name: "Moreno's", slug: "morenos", location: "Orange" }),
  makeRestaurant({
    name: "Taqueria el picosito",
    slug: "taqueria-picosito",
    cuisine: "Mexican",
    location: "Orange",
  }),
];

const moRanGakRestaurants = [
  makeRestaurant({
    name: "Mo Ran Gak",
    slug: "mo-ran-gak-fullerton",
    location: "Fullerton",
    aggregate_score: 120,
  }),
  makeRestaurant({
    name: "Mo Ran Gak",
    slug: "mo-ran-gak-garden-grove",
    location: "Garden Grove",
    aggregate_score: 95,
  }),
];

function searchRestaurants(
  restaurants: ReturnType<typeof makeRestaurant>[],
  query: string,
) {
  const index = prepareSearchIndex(restaurants);
  const fuse = new Fuse(index, FUSE_SEARCH_OPTIONS);
  return rankSearchResults(fuse.search(query), query);
}

describe("normalizeSearchText", () => {
  it("collapses spaced names for fuzzy search", () => {
    expect(normalizeSearchText("Mo Ran Gak")).toBe("morangak");
    expect(normalizeSearchText("morangak")).toBe("morangak");
  });

  it("folds accents and normalizes ampersands", () => {
    expect(normalizeSearchText("Café Hiro")).toBe("cafehiro");
    expect(normalizeSearchText("A & B")).toBe("aandb");
  });
});

describe("searchRestaurants ranking", () => {
  it("ranks Mo Ran Gak above Orange city decoys for morangak", () => {
    const results = searchRestaurants(
      [...orangeDecoys, ...moRanGakRestaurants],
      "morangak",
    );
    const topTwo = results.slice(0, 2).map((r) => r.item.slug);

    expect(topTwo).toContain("mo-ran-gak-fullerton");
    expect(topTwo).toContain("mo-ran-gak-garden-grove");

    const orangeSlugs = orangeDecoys.map((r) => r.slug);
    for (const result of results.slice(0, 2)) {
      expect(orangeSlugs).not.toContain(result.item.slug);
    }
  });

  it("still finds restaurants by partial name", () => {
    const restaurants = [
      makeRestaurant({
        name: "Taco Palace",
        slug: "taco-palace",
        cuisine: "Mexican",
        location: "Santa Ana",
      }),
      makeRestaurant({
        name: "Sushi Zen",
        slug: "sushi-zen",
        cuisine: "Japanese",
        location: "Irvine",
      }),
    ];
    const results = searchRestaurants(restaurants, "taco");

    expect(results[0]?.item.slug).toBe("taco-palace");
  });

  it("still surfaces restaurants by city", () => {
    const restaurants = [
      makeRestaurant({
        name: "Burger Barn",
        slug: "burger-barn",
        location: "Fullerton",
      }),
      makeRestaurant({
        name: "Sushi Zen",
        slug: "sushi-zen",
        location: "Irvine",
      }),
    ];
    const results = searchRestaurants(restaurants, "fullerton");

    expect(results.some((r) => r.item.slug === "burger-barn")).toBe(true);
  });
});
