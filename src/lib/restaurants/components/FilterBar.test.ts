import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import FilterBar from "./FilterBar.svelte";
import { appState } from "$lib/restaurants/stores.svelte";
import { makeRestaurant, resetAppState } from "$lib/restaurants/test-utils";

const restaurants = [
  makeRestaurant({ cuisine: "Mexican", location: "Santa Ana" }),
  makeRestaurant({
    name: "Ramen House",
    slug: "ramen-house",
    cuisine: "Japanese",
    location: "Irvine",
  }),
  makeRestaurant({
    name: "Taco Spot",
    slug: "taco-spot",
    cuisine: "Mexican",
    location: "Fullerton",
  }),
];
const threadSubreddit = { "thread-1": "orangecounty" };
const dateExtent = {
  min: Date.parse("2024-01-01"),
  max: Date.parse("2025-01-01"),
};

describe("FilterBar", () => {
  beforeEach(() => {
    resetAppState();
    localStorage.clear();
  });

  it("toggles a cuisine filter from the dropdown", async () => {
    const user = userEvent.setup();
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    await user.click(screen.getByRole("button", { name: /^cuisine$/i }));
    const mexicanOption = screen.getByRole("option", { name: /mexican/i });
    await user.click(mexicanOption);
    expect(appState.activeCuisines).toEqual(["Mexican"]);
    expect(
      screen.getByRole("button", { name: /remove mexican filter/i }),
    ).toBeInTheDocument();
    await user.click(mexicanOption);
    expect(appState.activeCuisines).toEqual([]);
  });

  it("clears all active filters", async () => {
    const user = userEvent.setup();
    appState.activeCuisines = ["Mexican"];
    appState.activeCities = ["Irvine"];
    appState.showUnmapped = true;
    appState.searchQuery = "tacos";
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    await user.click(screen.getByRole("button", { name: /clear all/i }));
    expect(appState.activeCuisines).toEqual([]);
    expect(appState.activeCities).toEqual([]);
    expect(appState.showUnmapped).toBe(false);
    expect(appState.searchQuery).toBe("");
    expect(
      screen.queryByRole("button", { name: /clear all/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Clear all when only search is active", () => {
    appState.searchQuery = "ramen";
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    expect(
      screen.getByRole("button", { name: /clear all/i }),
    ).toBeInTheDocument();
  });

  it("hides Clear all when search is whitespace-only", () => {
    appState.searchQuery = "   ";
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    expect(
      screen.queryByRole("button", { name: /clear all/i }),
    ).not.toBeInTheDocument();
  });

  it("removes a filter pill when clicked", async () => {
    const user = userEvent.setup();
    appState.activeCities = ["Irvine"];
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    await user.click(
      screen.getByRole("button", { name: /remove irvine filter/i }),
    );
    expect(appState.activeCities).toEqual([]);
  });

  it("toggles show unmapped via filter bar", async () => {
    const user = userEvent.setup();
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    const toggle = screen.getByRole("button", { name: /show unmapped/i });
    await user.click(toggle);
    expect(appState.showUnmapped).toBe(true);
    await user.click(toggle);
    expect(appState.showUnmapped).toBe(false);
  });

  it("hides new-since until a prior visit exists", () => {
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    expect(
      screen.queryByRole("button", { name: /new since last visit/i }),
    ).not.toBeInTheDocument();
  });

  it("hides saved until the user has bookmarked something", () => {
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    expect(
      screen.queryByRole("button", { name: /^saved/i }),
    ).not.toBeInTheDocument();
  });

  it("toggles new since last visit when a prior visit exists", async () => {
    const user = userEvent.setup();
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    localStorage.setItem(
      "ocFoodRecs_lastVisit",
      new Date(priorMs).toISOString(),
    );
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    const btn = screen.getByRole("button", { name: /^new since last visit$/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(appState.freshnessCutoff).toBe(priorMs);
    await user.click(btn);
    expect(appState.freshnessCutoff).toBeNull();
  });
});
