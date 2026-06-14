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
  beforeEach(() => resetAppState());

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
});
