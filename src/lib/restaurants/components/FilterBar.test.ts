import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FilterBar from "./FilterBar.svelte";
import { appState, formatMonthYear, setFreshnessFilter } from "$lib/restaurants/stores.svelte";
import { applyUrlStateSnapshot } from "$lib/restaurants/apply-url-state";
import { parseSearchParams } from "$lib/restaurants/url-state";
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

  it("toggles include unmapped via filter bar", async () => {
    const user = userEvent.setup();
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
      unmappedCount: 4,
    });
    const toggle = screen.getByRole("button", {
      name: /include 4 unmapped restaurants in the list/i,
    });
    await user.click(toggle);
    expect(appState.showUnmapped).toBe(true);
    expect(
      screen.getByRole("button", {
        name: /stop including unmapped restaurants/i,
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: /stop including unmapped restaurants/i,
      }),
    );
    expect(appState.showUnmapped).toBe(false);
  });

  it("hides include unmapped when none match", () => {
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
      unmappedCount: 0,
    });
    expect(
      screen.queryByRole("button", { name: /unmapped/i }),
    ).not.toBeInTheDocument();
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
    expect(appState.freshnessSource).toBe("visit");
    await user.click(btn);
    expect(appState.freshnessCutoff).toBeNull();
    expect(appState.freshnessSource).toBeNull();
  });

  it("marks last-visit active and shows its pill, not Recency, when toggled on", async () => {
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
    await user.click(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    );

    const lastVisitBtn = screen.getByRole("button", {
      name: /^new since last visit$/i,
    });
    const recencyTrigger = screen.getByRole("button", { name: /^recency$/i });
    const pill = screen.getByRole("button", {
      name: /remove new since last visit filter/i,
    });

    expect(lastVisitBtn).toHaveClass("has-active");
    expect(lastVisitBtn).toHaveAttribute("aria-pressed", "true");
    expect(recencyTrigger).not.toHaveClass("has-active");
    expect(pill).toHaveTextContent(/new since last visit/i);
    expect(pill).not.toHaveTextContent(`Since ${formatMonthYear(priorMs)}`);
  });

  it("clears last-visit cutoff when its pill is clicked", async () => {
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
    await user.click(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /remove new since last visit filter/i,
      }),
    );

    expect(appState.freshnessCutoff).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /remove new since last visit filter/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    ).not.toHaveClass("has-active");
    expect(
      screen.getByRole("button", { name: /^recency$/i }),
    ).not.toHaveClass("has-active");
  });

  it("treats a custom cutoff as Recency, not last-visit", async () => {
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    const customMs = Date.parse("2024-03-15T12:00:00Z");
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
    screen.getByRole("button", { name: /^new since last visit$/i });
    setFreshnessFilter(customMs);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^recency$/i }),
      ).toHaveClass("has-active");
    });

    const lastVisitBtn = screen.getByRole("button", {
      name: /^new since last visit$/i,
    });
    const pill = screen.getByRole("button", {
      name: /remove recency filter/i,
    });

    expect(lastVisitBtn).toHaveAttribute("aria-pressed", "false");
    expect(lastVisitBtn).not.toHaveClass("has-active");
    expect(pill).toHaveTextContent(`Since ${formatMonthYear(customMs)}`);
    expect(
      screen.queryByRole("button", {
        name: /remove new since last visit filter/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("switches from last-visit labels to Recency when the cutoff moves off lastVisitMs", async () => {
    const user = userEvent.setup();
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    const customMs = Date.parse("2024-03-15T12:00:00Z");
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
    await user.click(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    );
    expect(appState.freshnessCutoff).toBe(priorMs);

    setFreshnessFilter(customMs);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^recency$/i }),
      ).toHaveClass("has-active");
    });
    expect(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /remove recency filter/i }),
    ).toHaveTextContent(`Since ${formatMonthYear(customMs)}`);
  });

  it("switches from custom Recency back to last-visit when that toggle is clicked", async () => {
    const user = userEvent.setup();
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    const customMs = Date.parse("2024-03-15T12:00:00Z");
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
    screen.getByRole("button", { name: /^new since last visit$/i });
    setFreshnessFilter(customMs);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /remove recency filter/i }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    );

    expect(appState.freshnessCutoff).toBe(priorMs);
    expect(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^recency$/i }),
    ).not.toHaveClass("has-active");
    expect(
      screen.getByRole("button", {
        name: /remove new since last visit filter/i,
      }),
    ).toHaveTextContent(/new since last visit/i);
  });

  it("clears a custom recency pill and drops Recency has-active", async () => {
    const user = userEvent.setup();
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    const customMs = Date.parse("2024-03-15T12:00:00Z");
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
    screen.getByRole("button", { name: /^new since last visit$/i });
    setFreshnessFilter(customMs);
    await user.click(
      await screen.findByRole("button", { name: /remove recency filter/i }),
    );

    expect(appState.freshnessCutoff).toBeNull();
    expect(
      screen.queryByRole("button", { name: /remove recency filter/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^recency$/i }),
    ).not.toHaveClass("has-active");
  });

  it("clears custom recency when Reset is clicked in the histogram", async () => {
    const user = userEvent.setup();
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    const customMs = Date.parse("2024-03-15T12:00:00Z");
    localStorage.setItem(
      "ocFoodRecs_lastVisit",
      new Date(priorMs).toISOString(),
    );
    const dated = [
      makeRestaurant({
        mentions: [
          {
            comment_date: "2024-08-01T00:00:00Z",
            thread_id: "thread-1",
            score: 5,
            author: "alice",
            role: "primary",
          },
        ],
      }),
    ];
    render(FilterBar, {
      restaurants: dated,
      threadSubreddit,
      restaurantsForHistogram: dated,
      dateExtent,
    });
    screen.getByRole("button", { name: /^new since last visit$/i });
    setFreshnessFilter(customMs);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^recency$/i }),
      ).toHaveClass("has-active");
    });
    await user.click(screen.getByRole("button", { name: /^recency$/i }));
    await user.click(screen.getByRole("button", { name: /^reset$/i }));

    expect(appState.freshnessCutoff).toBeNull();
    expect(
      screen.getByRole("button", { name: /^recency$/i }),
    ).not.toHaveClass("has-active");
  });

  it("round-trips last-visit from since=visit as last-visit, not Recency", async () => {
    const priorMs = Date.parse("2024-06-01T15:30:00Z");
    localStorage.setItem(
      "ocFoodRecs_lastVisit",
      new Date(priorMs).toISOString(),
    );
    applyUrlStateSnapshot(parseSearchParams(new URLSearchParams("since=visit")));
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^new since last visit$/i }),
      ).toHaveClass("has-active");
    });

    const lastVisitBtn = screen.getByRole("button", {
      name: /^new since last visit$/i,
    });
    const recencyTrigger = screen.getByRole("button", { name: /^recency$/i });
    const pill = screen.getByRole("button", {
      name: /remove new since last visit filter/i,
    });

    expect(lastVisitBtn).toHaveAttribute("aria-pressed", "true");
    expect(recencyTrigger).not.toHaveClass("has-active");
    expect(pill).toHaveTextContent(/new since last visit/i);
    expect(pill).not.toHaveTextContent(`Since ${formatMonthYear(priorMs)}`);
    expect(appState.freshnessCutoff).toBe(priorMs);
    expect(appState.freshnessSource).toBe("visit");
  });

  it("round-trips a histogram date URL as Recency even on the last-visit calendar day", async () => {
    const priorMs = Date.parse("2024-06-01T00:00:00Z");
    const dayStart = Date.parse("2024-06-01");
    localStorage.setItem(
      "ocFoodRecs_lastVisit",
      new Date(priorMs).toISOString(),
    );
    applyUrlStateSnapshot(
      parseSearchParams(new URLSearchParams("since=2024-06-01")),
    );
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^recency$/i }),
      ).toHaveClass("has-active");
    });

    const lastVisitBtn = screen.getByRole("button", {
      name: /^new since last visit$/i,
    });
    const pill = screen.getByRole("button", {
      name: /remove recency filter/i,
    });

    expect(lastVisitBtn).toHaveAttribute("aria-pressed", "false");
    expect(lastVisitBtn).not.toHaveClass("has-active");
    expect(pill).toHaveTextContent(`Since ${formatMonthYear(dayStart)}`);
    expect(
      screen.queryByRole("button", {
        name: /remove new since last visit filter/i,
      }),
    ).not.toBeInTheDocument();
    expect(appState.freshnessCutoff).toBe(dayStart);
    expect(appState.freshnessSource).toBe("date");
  });

  it("clears the shared cutoff after restoring last-visit from the URL", async () => {
    const user = userEvent.setup();
    const priorMs = Date.parse("2024-06-01T15:30:00Z");
    localStorage.setItem(
      "ocFoodRecs_lastVisit",
      new Date(priorMs).toISOString(),
    );
    applyUrlStateSnapshot(parseSearchParams(new URLSearchParams("since=visit")));
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    await user.click(
      await screen.findByRole("button", {
        name: /remove new since last visit filter/i,
      }),
    );

    expect(appState.freshnessCutoff).toBeNull();
    expect(appState.freshnessSource).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /remove new since last visit filter/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^new since last visit$/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /^recency$/i }),
    ).not.toHaveClass("has-active");
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

  it("closes a filter menu on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    const trigger = screen.getByRole("button", { name: /^cuisine$/i });
    await user.click(trigger);
    expect(
      screen.getByRole("listbox", { name: /filter by cuisine/i }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("listbox", { name: /filter by cuisine/i }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes a filter menu when focus leaves the dropdown", async () => {
    const user = userEvent.setup();
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    await user.click(screen.getByRole("button", { name: /^cuisine$/i }));
    expect(
      screen.getByRole("listbox", { name: /filter by cuisine/i }),
    ).toBeInTheDocument();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(
      screen.queryByRole("listbox", { name: /filter by cuisine/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^city$/i })).toHaveFocus();
  });

  it("exposes recency as a labelled popup, not a dialog", async () => {
    const user = userEvent.setup();
    render(FilterBar, {
      restaurants,
      threadSubreddit,
      restaurantsForHistogram: restaurants,
      dateExtent,
    });
    const trigger = screen.getByRole("button", { name: /^recency$/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "true");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-controls", "recency-panel");
    expect(
      screen.getByRole("group", { name: /filter by comment recency/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
