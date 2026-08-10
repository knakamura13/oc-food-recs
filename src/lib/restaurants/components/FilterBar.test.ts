import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FilterBar from "./FilterBar.svelte";
import { appState } from "$lib/restaurants/stores.svelte";
import { makeRestaurant, resetAppState } from "$lib/restaurants/test-utils";

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("$lib/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

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
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
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
    expect(
      screen.getByRole("button", { name: /remove search filter for ramen/i }),
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
    expect(
      screen.queryByRole("button", { name: /remove search filter/i }),
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

  it("shows and clears a search pill", async () => {
    const user = userEvent.setup();
    appState.searchQuery = "tacos";
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    await user.click(
      screen.getByRole("button", { name: /remove search filter for tacos/i }),
    );
    expect(appState.searchQuery).toBe("");
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
    expect(
      screen.getByRole("button", { name: /remove show unmapped filter/i }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /remove show unmapped filter/i }),
    );
    expect(appState.showUnmapped).toBe(false);
  });

  it("copies the current view URL and confirms it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });

    await user.click(screen.getByRole("button", { name: /share view/i }));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Share link copied to clipboard!",
    );
    vi.unstubAllGlobals();
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

  it("exposes the collapsed mobile map control and reports its opener", async () => {
    const user = userEvent.setup();
    const onMapToggle = vi.fn();
    const { container } = render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
      mapExpanded: false,
      onMapToggle,
    });
    const mapButton = container.querySelector<HTMLButtonElement>(
      ".mobile-map-trigger",
    );

    expect(mapButton).toBeInTheDocument();
    expect(mapButton).toHaveTextContent(/^Map$/);
    expect(mapButton).toHaveAccessibleName("Open map");
    expect(mapButton).toHaveAttribute("aria-controls", "restaurant-map-panel");
    expect(mapButton).toHaveAttribute("aria-expanded", "false");

    await user.click(mapButton!);

    expect(onMapToggle).toHaveBeenCalledWith(mapButton);
  });

  it("omits the mobile map control when no toggle handler is available", () => {
    const { container } = render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });

    expect(
      container.querySelector(".mobile-map-trigger"),
    ).not.toBeInTheDocument();
  });

  it("exposes the expanded mobile map state", () => {
    const { container } = render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
      mapExpanded: true,
      onMapToggle: vi.fn(),
    });
    const mapButton = container.querySelector<HTMLButtonElement>(
      ".mobile-map-trigger",
    );

    expect(mapButton).toBeInTheDocument();
    expect(mapButton).toHaveAccessibleName("Close map");
    expect(mapButton).toHaveAttribute("aria-expanded", "true");
  });
});
