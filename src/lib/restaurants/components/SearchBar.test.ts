import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import SearchBar from "./SearchBar.svelte";
import { appState } from "$lib/restaurants/stores.svelte";
import { makeRestaurant, resetAppState } from "$lib/restaurants/test-utils";

const searchBarSource = readFileSync(
  join(process.cwd(), "src/lib/restaurants/components/SearchBar.svelte"),
  "utf8",
);

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
  makeRestaurant({
    name: "Burger Barn",
    slug: "burger-barn",
    cuisine: "Burgers",
    location: "Fullerton",
  }),
  makeRestaurant({
    name: "Patagonia Empanadas",
    slug: "patagonia-empanadas",
    cuisine: "Argentinian",
    location: "Tustin",
  }),
  makeRestaurant({
    name: "Eva",
    slug: "eva",
    cuisine: "Argentinian",
    location: "Anaheim",
  }),
];
const cuisineNames = ["Mexican", "Japanese", "Burgers", "Latin American"];
const cityNames = ["Santa Ana", "Irvine", "Fullerton"];

describe("SearchBar", () => {
  beforeEach(() => resetAppState());

  it("shows fuzzy search results as the user types", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "taco");
    await waitFor(() => {
      expect(
        screen.getByRole("listbox", { name: /search results/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Taco Palace")).toBeInTheDocument();
    expect(screen.queryByText("Sushi Zen")).not.toBeInTheDocument();
  });

  it("applies a cuisine filter when Enter matches a synonym", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.type(input, "tacos");
    await user.keyboard("{Enter}");
    expect(appState.activeCuisines).toEqual(["Mexican"]);
    expect(appState.searchQuery).toBe("");
  });

  it("applies a consolidated cuisine filter when Enter matches a raw alias", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.type(input, "argentinian");
    await user.keyboard("{Enter}");
    expect(appState.activeCuisines).toEqual(["Latin American"]);
    expect(appState.searchQuery).toBe("");
  });

  it("selects a restaurant when there is exactly one fuzzy match", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "Taco Palace");
    await user.keyboard("{Enter}");
    expect(appState.searchQuery).toBe("Taco Palace");
    expect(appState.selectedRestaurantSlug).toBe("taco-palace");
    expect(appState.listScrollTarget).toBe("taco-palace");
  });

  it("clears the search when the clear button is clicked", async () => {
    const user = userEvent.setup();
    appState.searchQuery = "taco";
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    await user.click(screen.getByRole("button", { name: /clear search/i }));
    expect(appState.searchQuery).toBe("");
    expect(
      screen.queryByRole("button", { name: /clear search/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps a slash typed into the focused search input", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });

    await user.click(input);
    await user.type(input, "/");

    expect(input).toHaveValue("/");
  });

  it("focuses search with the global slash shortcut", () => {
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    const event = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(document.activeElement).toBe(input);
    expect(event.defaultPrevented).toBe(true);
  });

  it("shows a platform-aware keyboard shortcut hint", () => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    expect(
      screen.getByLabelText(/keyboard shortcut ctrl\+k or \//i),
    ).toHaveTextContent("Ctrl+K");
  });

  it("shows a no-matches message when the query has no fuzzy hits", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "zzzznotarestaurant");
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /no matches for .*zzzznotarestaurant/i,
      );
    });
  });

  it("ranks Mo Ran Gak locations first for collapsed name queries", async () => {
    const user = userEvent.setup();
    const morangakRestaurants = [
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
        name: "Mo Ran Gak",
        slug: "mo-ran-gak-fullerton",
        location: "Fullerton",
      }),
      makeRestaurant({
        name: "Mo Ran Gak",
        slug: "mo-ran-gak-garden-grove",
        location: "Garden Grove",
      }),
    ];
    render(SearchBar, {
      restaurants: morangakRestaurants,
      cuisineNames,
      cityNames: [...cityNames, "Orange", "Garden Grove"],
    });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "morangak");

    await waitFor(() => {
      expect(
        screen.getByRole("listbox", { name: /search results/i }),
      ).toBeInTheDocument();
    });

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Mo Ran Gak");
    expect(options[1]).toHaveTextContent("Mo Ran Gak");
    expect(options[0]).toHaveTextContent("Fullerton");
    expect(options[1]).toHaveTextContent("Garden Grove");
  });

  it("shows a city filter option when the query matches a city", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "Irvine");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /filter by city.*irvine/i }),
      ).toBeInTheDocument();
    });
  });

  it("applies the city filter on Enter when no option is highlighted", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "Irvine");
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /filter by city.*irvine/i }),
      ).toBeInTheDocument();
    });
    await user.keyboard("{Enter}");
    expect(appState.activeCities).toEqual(["Irvine"]);
    expect(appState.searchQuery).toBe("");
    expect(appState.selectedRestaurantSlug).toBeNull();
  });

  it("selects a highlighted restaurant even when the query matches a city", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "Irvine");
    const sushiOption = await screen.findByRole("option", {
      name: /sushi zen/i,
    });
    await user.hover(sushiOption);
    await user.keyboard("{Enter}");
    expect(appState.selectedRestaurantSlug).toBe("sushi-zen");
    expect(appState.listScrollTarget).toBe("sushi-zen");
    expect(appState.activeCities).toEqual([]);
    expect(appState.searchQuery).toBe("Sushi Zen");
  });

  it("keeps keyboard .highlighted when arrowing after a pointer hover", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "a");
    await waitFor(() => {
      expect(
        screen.getByRole("listbox", { name: /search results/i }),
      ).toBeInTheDocument();
    });
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    await user.hover(options[0]);
    expect(options[0]).toHaveClass("highlighted");
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveClass("highlighted");
    expect(options[0]).not.toHaveClass("highlighted");
  });

  it("styles the clear button and search hits with hover, and highlighted wins over hover", () => {
    expect(searchBarSource).toMatch(/\.clear-btn:hover\s*\{/);
    expect(searchBarSource).toMatch(/\.clear-btn:active\s*\{/);
    expect(searchBarSource).toMatch(/li:hover\s*\{/);
    expect(searchBarSource).toMatch(/li\.highlighted:hover\s*\{/);
    expect(searchBarSource).toContain("prefers-reduced-motion");
    const hoverIdx = searchBarSource.indexOf("li:hover");
    const highlightedHoverIdx = searchBarSource.indexOf("li.highlighted:hover");
    expect(hoverIdx).toBeGreaterThan(-1);
    expect(highlightedHoverIdx).toBeGreaterThan(hoverIdx);
  });

  it("hides the keyboard shortcut and uses a 16px search field on small viewports", () => {
    expect(searchBarSource).toContain("font-size: 16px");
    expect(searchBarSource).toMatch(
      /@media \(max-width: 1023px\)[\s\S]*\.search-shortcut \{[\s\S]*display: none/,
    );
  });

  it("applies the city filter when the filter option is clicked", async () => {
    const user = userEvent.setup();
    render(SearchBar, { restaurants, cuisineNames, cityNames });
    const input = screen.getByRole("combobox", {
      name: /search restaurants, cuisines, or cities/i,
    });
    await user.click(input);
    await user.type(input, "Irvine");
    const filterOption = await screen.findByRole("option", {
      name: /filter by city.*irvine/i,
    });
    await user.click(filterOption);
    expect(appState.activeCities).toEqual(["Irvine"]);
    expect(appState.searchQuery).toBe("");
  });
});
