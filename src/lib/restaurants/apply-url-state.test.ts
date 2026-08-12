import { beforeEach, describe, expect, it } from "vitest";
import { applyUrlStateSnapshot } from "./apply-url-state";
import { appState } from "./stores.svelte";
import { makeRestaurant, resetAppState } from "./test-utils";

describe("applyUrlStateSnapshot", () => {
  beforeEach(() => {
    resetAppState();
    localStorage.clear();
  });

  it("applies parsed URL fields to appState", () => {
    applyUrlStateSnapshot({
      searchQuery: "tacos",
      activeCuisines: ["Mexican"],
      freshnessCutoff: Date.parse("2024-06-01"),
      showUnmapped: true,
      sortKey: "name",
      sortDirection: "asc",
    });

    expect(appState.searchQuery).toBe("tacos");
    expect(appState.activeCuisines).toEqual(["Mexican"]);
    expect(appState.freshnessCutoff).toBe(Date.parse("2024-06-01"));
    expect(appState.freshnessSource).toBe("date");
    expect(appState.showUnmapped).toBe(true);
    expect(appState.sortKey).toBe("name");
    expect(appState.sortDirection).toBe("asc");
  });

  it("keeps default score sort when the URL omits sort", () => {
    applyUrlStateSnapshot({ sortDirection: "asc" });
    expect(appState.sortKey).toBe("score");
    expect(appState.sortDirection).toBe("asc");
  });

  it("selects a restaurant and sets map/list targets", () => {
    const restaurants = [
      makeRestaurant({ slug: "taco-spot", lat: 33.7, lng: -117.8 }),
    ];
    applyUrlStateSnapshot({ selectedRestaurantSlug: "taco-spot" }, restaurants);

    expect(appState.selectedRestaurantSlug).toBe("taco-spot");
    expect(appState.listScrollTarget).toBe("taco-spot");
    expect(appState.mapTarget).toEqual({
      slug: "taco-spot",
      lat: 33.7,
      lng: -117.8,
    });
  });

  it("restores last-visit cutoff from localStorage when source is visit", () => {
    const priorMs = Date.parse("2024-06-01T15:30:00Z");
    localStorage.setItem(
      "ocFoodRecs_lastVisit",
      new Date(priorMs).toISOString(),
    );
    applyUrlStateSnapshot({ freshnessSource: "visit" });

    expect(appState.freshnessCutoff).toBe(priorMs);
    expect(appState.freshnessSource).toBe("visit");
  });

  it("clears last-visit when source is visit but no prior visit is stored", () => {
    applyUrlStateSnapshot({ freshnessSource: "visit" });

    expect(appState.freshnessCutoff).toBeNull();
    expect(appState.freshnessSource).toBeNull();
  });

  it("keeps a histogram date as Recency even on the last-visit calendar day", () => {
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    const dayStart = Date.parse("2024-06-01");
    localStorage.setItem(
      "ocFoodRecs_lastVisit",
      new Date(priorMs).toISOString(),
    );
    applyUrlStateSnapshot({
      freshnessCutoff: dayStart,
      freshnessSource: "date",
    });

    expect(appState.freshnessCutoff).toBe(dayStart);
    expect(appState.freshnessSource).toBe("date");
    expect(appState.freshnessCutoff).toBe(priorMs);
  });
});
