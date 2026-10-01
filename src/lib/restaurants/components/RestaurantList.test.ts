import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantList from "./RestaurantList.svelte";
import { appState } from "$lib/restaurants/stores.svelte";
import { makeRestaurant, resetAppState } from "$lib/restaurants/test-utils";
import { buildSearchParams } from "$lib/restaurants/url-state";
import {
  consumeSkipToList,
  requestSkipToList,
} from "$lib/restaurants/skip-to-list";
import type { ListMention } from "$lib/restaurants/types";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("$lib/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
  },
}));

const restaurants = [
  makeRestaurant({
    name: "La Taco Spot",
    slug: "la-taco-spot",
    cuisine: "Mexican",
    location: "Santa Ana",
  }),
];

function stubListViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }),
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 600;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 400;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 72;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 400;
    },
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const height = this.id === "main-content" ? 600 : 72;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 400,
        bottom: height,
        width: 400,
        height,
        toJSON() {
          return {};
        },
      };
    },
  );
}

describe("RestaurantList", () => {
  beforeEach(() => {
    resetAppState();
    consumeSkipToList();
    mocks.toastError.mockReset();
    stubListViewport();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] }),
    );
  });

  it("moves skip-link focus onto the list when a skip was requested during the skeleton", async () => {
    requestSkipToList();
    render(RestaurantList, { restaurants });

    await waitFor(() => {
      expect(document.getElementById("main-content")).toHaveFocus();
    });
  });

  it("shows a toast when mention details fail to load", async () => {
    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Could not load mentions");
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /could not load comments/i,
      );
    });
    expect(
      screen.getByRole("button", { name: /^retry$/i }),
    ).toBeInTheDocument();
  });

  it("keeps the Google Maps link when the comment fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => [] })));

    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load comments/i);
    });
    expect(
      screen.getByRole("link", { name: /open la taco spot in google maps/i }),
    ).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=33.6846,-117.8265",
    );
  });

  it("shows the street under the restaurant name only when known", () => {
    render(RestaurantList, {
      restaurants: [
        ...restaurants,
        makeRestaurant({
          name: "Cafe Rae",
          slug: "cafe-rae",
          street: "1421 N El Camino Real",
        }),
      ],
    });

    expect(screen.getByText("1421 N El Camino Real")).toBeInTheDocument();
    expect(screen.getAllByText(/El Camino|Main/)).toHaveLength(1);
  });

  it("retries a failed mention load from the drawer", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            comment_id: "c1",
            thread_id: "t1",
            role: "primary",
            author: "foodie",
            body: "Best tacos in town",
            score: 12,
            comment_date: "2024-06-01",
            permalink: "https://reddit.com/r/x/comments/1",
            classification: null,
          },
        ],
      });
    vi.stubGlobal("fetch", fetchMock);

    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^retry$/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    await waitFor(() => {
      expect(screen.getByText("Best tacos in town")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: /^retry$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty-comments message when details load with no content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );
    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    await waitFor(() => {
      expect(screen.getByText(/no comments to show/i)).toBeInTheDocument();
    });
  });

  function stubDrawerMentions(mentions: Record<string, unknown>[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          mentions.map((m) => ({
            permalink: null,
            classification: null,
            comment_date: "2024-06-01",
            ...m,
          })),
      }),
    );
  }

  function listMention(score: number, author = "a"): ListMention {
    return {
      comment_date: "2024-06-01",
      thread_id: "t1",
      score,
      author,
      role: "endorsement",
      credit: 1,
    };
  }

  it("labels the stat row with people and threads, floors the score at 0 and hides a zero endorse count", () => {
    render(RestaurantList, {
      restaurants: [
        makeRestaurant({
          mention_count: 1,
          source_threads: ["t1"],
          endorsement_count: 0,
          aggregate_score: -11,
        }),
      ],
    });

    expect(document.querySelector(".stat.score")).toHaveTextContent(/^0\s*pts$/);
    expect(screen.getByText("person")).toBeInTheDocument();
    expect(screen.getByText(/1 thread$/)).toBeInTheDocument();
    expect(screen.queryByText("endorse")).not.toBeInTheDocument();
    expect(screen.queryByText(/popular/i)).not.toBeInTheDocument();
  });

  it("pluralises people, threads and endorsements", () => {
    render(RestaurantList, {
      restaurants: [
        makeRestaurant({
          mention_count: 3,
          source_threads: ["a", "b"],
          endorsement_count: 2,
        }),
      ],
    });

    expect(screen.getByText("people")).toBeInTheDocument();
    expect(screen.getByText(/2 threads$/)).toBeInTheDocument();
    expect(screen.getByText("endorse")).toBeInTheDocument();
  });

  it("explains the score in a popover with a link to the methodology", async () => {
    const user = userEvent.setup();
    render(RestaurantList, {
      restaurants: [
        makeRestaurant({
          mention_count: 3,
          source_threads: ["a", "b"],
          mentions: [listMention(12), listMention(40)],
        }),
      ],
    });

    const trigger = screen.getByRole("button", { name: /how is this score calculated/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent(/3 people across 2 threads/);
    expect(tip).toHaveTextContent(/strongest comment 40 upvotes/);
    expect(screen.getByRole("link", { name: "How scores work" })).toHaveAttribute(
      "href",
      "/about#how-it-works",
    );
  });

  it("shows the thread a comment came from when thread metadata is provided", async () => {
    stubDrawerMentions([
      { comment_id: "c1", thread_id: "t1", role: "primary", author: "ann", body: "Tacos", score: 30 },
    ]);
    render(RestaurantList, {
      restaurants,
      threadsById: {
        t1: {
          id: "t1",
          title: "Best tacos in OC",
          url: "https://reddit.com/r/orangecounty/comments/t1",
          subreddit: "orangecounty",
          post_id: "t1",
          comment_count: 10,
          restaurant_count: 5,
        },
      },
    });
    appState.selectedRestaurantSlug = "la-taco-spot";

    const link = await screen.findByRole("link", { name: /r\/orangecounty · Best tacos in OC/ });
    expect(link).toHaveAttribute("href", "https://reddit.com/r/orangecounty/comments/t1");
  });

  it("tags restaurants that have dish recommendations", () => {
    render(RestaurantList, {
      restaurants: [makeRestaurant({ dish_rec_count: 3 })],
    });
    expect(screen.getByText("3 dish recs")).toBeInTheDocument();
  });

  it("shows every primary comment under a thread-count heading", async () => {
    stubDrawerMentions([
      { comment_id: "c1", thread_id: "t1", role: "primary", author: "ann", body: "Tacos one", score: 30 },
      { comment_id: "c2", thread_id: "t2", role: "primary", author: "bob", body: "Tacos two", score: 10 },
    ]);
    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 3, name: "Recommended in 2 threads" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Tacos one")).toBeInTheDocument();
    expect(screen.getByText("Tacos two")).toBeInTheDocument();
    expect(screen.getByText(/u\/ann/)).toBeInTheDocument();
    expect(screen.getByText(/u\/bob/)).toBeInTheDocument();
  });

  it("focuses a multi-restaurant comment on this place and jumps to the others", async () => {
    const user = userEvent.setup();
    render(RestaurantList, {
      restaurants: [
        makeRestaurant({ name: "Irvine Grill", slug: "irvine-grill" }),
        makeRestaurant({ name: "Forn Al Hara", slug: "forn-al-hara" }),
      ],
    });
    stubDrawerMentions([
      {
        comment_id: "c1",
        thread_id: "t1",
        role: "primary",
        author: "ann",
        body: "Forn Al Hara is great\nIrvine Grill is the best",
        score: 30,
        other_places: [{ slug: "forn-al-hara", name: "Forn Al Hara" }],
      },
    ]);
    appState.selectedRestaurantSlug = "irvine-grill";

    await waitFor(() => {
      expect(screen.getByText("Irvine Grill is the best")).toBeInTheDocument();
    });
    expect(screen.queryByText("Forn Al Hara is great")).not.toBeInTheDocument();
    expect(screen.getByText(/and 1 other place in this comment/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show full comment" }));
    expect(screen.getByText(/Forn Al Hara is great/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Forn Al Hara" }));
    await waitFor(() => {
      expect(appState.selectedRestaurantSlug).toBe("forn-al-hara");
    });
  });

  it("collapses a very long list of primary comments behind a toggle", async () => {
    const user = userEvent.setup();
    stubDrawerMentions(
      Array.from({ length: 13 }, (_, i) => ({
        comment_id: `c${i}`,
        thread_id: `t${i}`,
        role: "primary",
        author: `user${i}`,
        body: `Rec number ${i}`,
        score: 100 - i,
      })),
    );
    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    await screen.findByText("Rec number 0");
    expect(screen.queryByText("Rec number 5")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 8 more recommendations" }));
    expect(screen.getByText("Rec number 12")).toBeInTheDocument();
  });

  it("renders markdown links and bold text in comment bodies", async () => {
    stubDrawerMentions([
      {
        comment_id: "c1",
        thread_id: "t1",
        role: "primary",
        author: "ann",
        body: "[map](https://maps.apple.com/?q=a%20b) and **great** food",
        score: 5,
      },
    ]);
    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    const link = await screen.findByRole("link", { name: "map" });
    expect(link).toHaveAttribute("href", "https://maps.apple.com/?q=a%20b");
    expect(screen.getByText("great").tagName).toBe("STRONG");
  });

  it("shows a clear-filters action when the list is empty", async () => {
    const { getByRole } = render(RestaurantList, { restaurants: [] });
    appState.activeCuisines = ["Mexican"];

    const clearBtn = getByRole("button", { name: /clear filters/i });
    clearBtn.click();

    expect(appState.activeCuisines).toEqual([]);
  });

  it("exposes restaurant names as h2 and drawer sections as h3", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            comment_id: "c1",
            thread_id: "t1",
            role: "primary",
            author: "foodie",
            body: "Best tacos in town",
            score: 12,
            comment_date: "2024-06-01",
            permalink: "https://reddit.com/r/x/comments/1",
            classification: null,
          },
          {
            comment_id: "c2",
            thread_id: "t1",
            role: "endorsement",
            author: "alice",
            body: "Get the al pastor",
            score: 8,
            comment_date: "2024-06-02",
            permalink: "https://reddit.com/r/x/comments/2",
            classification: "dish_rec",
          },
        ],
      }),
    );

    render(RestaurantList, { restaurants });

    expect(
      screen.getByRole("heading", { level: 2, name: /la taco spot/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();

    appState.selectedRestaurantSlug = "la-taco-spot";

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 3, name: /what to order/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { level: 2, name: /la taco spot/i }),
    ).toBeInTheDocument();
  });

  it("names the row toggle from identity, not the teaser or chevron", () => {
    render(RestaurantList, {
      restaurants: [
        makeRestaurant({
          name: "La Taco Spot",
          slug: "la-taco-spot",
          cuisine: "Mexican",
          location: "Santa Ana",
          top_comment_snippet: "Get the al pastor tacos",
        }),
      ],
    });

    const toggle = screen.getByRole("button", {
      name: "La Taco Spot, Mexican, Santa Ana",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /expand la taco spot details/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /al pastor/i }),
    ).not.toBeInTheDocument();
    expect(toggle.querySelector(".dish-teaser")).toHaveTextContent(
      "“Get the al pastor tacos”",
    );
    expect(toggle).not.toHaveTextContent(/Try:/);
  });

  it("marks unmapped restaurants in the row name and tags", () => {
    render(RestaurantList, {
      restaurants: [
        makeRestaurant({
          name: "Secret Kitchen",
          slug: "secret-kitchen",
          cuisine: "Thai",
          location: "Irvine",
          lat: null,
          lng: null,
        }),
      ],
    });

    expect(
      screen.getByRole("button", {
        name: "Secret Kitchen, Thai, Irvine, not on the map",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Unmapped")).toBeInTheDocument();
  });

  it("explains missing map pins in the unmapped drawer", async () => {
    render(RestaurantList, {
      restaurants: [
        makeRestaurant({
          name: "Secret Kitchen",
          slug: "secret-kitchen",
          lat: null,
          lng: null,
        }),
      ],
    });
    appState.selectedRestaurantSlug = "secret-kitchen";

    await waitFor(() => {
      expect(
        screen.getByText(/isn’t pinned on the map yet/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /show on map/i }),
    ).not.toBeInTheDocument();
  });
});

function mentionOn(date: string): ListMention {
  return {
    author: "alice",
    score: 1,
    comment_date: date,
    thread_id: "thread-1",
    role: "primary",
    credit: 1,
  };
}

const sortRestaurants = [
  makeRestaurant({
    name: "Bravo Kitchen",
    slug: "bravo",
    aggregate_score: 50,
    mentions: [mentionOn("2025-01-01")],
  }),
  makeRestaurant({
    name: "Alpha Kitchen",
    slug: "alpha",
    aggregate_score: 10,
    mentions: [mentionOn("2024-06-01")],
  }),
  makeRestaurant({
    name: "Charlie Kitchen",
    slug: "charlie",
    aggregate_score: 30,
    mentions: [mentionOn("2023-01-01")],
  }),
];

function rowNames() {
  return screen.getAllByRole("group").map((el) => el.getAttribute("aria-label"));
}

function sortQuery() {
  return buildSearchParams({
    searchQuery: appState.searchQuery,
    activeCuisines: appState.activeCuisines,
    activeCities: appState.activeCities,
    activeSubreddits: appState.activeSubreddits,
    freshnessCutoff: appState.freshnessCutoff,
    freshnessSource: appState.freshnessSource,
    showUnmapped: appState.showUnmapped,
    showMomAndPop: appState.showMomAndPop,
    sortKey: appState.sortKey,
    sortDirection: appState.sortDirection,
    selectedRestaurantSlug: appState.selectedRestaurantSlug,
  }).toString();
}

describe("RestaurantList sort cycle", () => {
  beforeEach(() => {
    resetAppState();
    mocks.toastError.mockReset();
    stubListViewport();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] }),
    );
  });

  it("defaults to score descending and omits sort from the URL", async () => {
    render(RestaurantList, { restaurants: sortRestaurants });

    const score = await screen.findByRole("button", {
      name: /sorted by score, highest first/i,
    });
    expect(score).toHaveAttribute("aria-pressed", "true");
    expect(score).toHaveTextContent(/Score/);
    expect(score).toHaveTextContent(/↓/);
    expect(
      screen.getByRole("button", { name: /^sort by name$/i }),
    ).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      expect(rowNames()).toEqual([
        "Bravo Kitchen",
        "Charlie Kitchen",
        "Alpha Kitchen",
      ]);
    });
    expect(appState.sortKey).toBe("score");
    expect(appState.sortDirection).toBe("desc");
    expect(sortQuery()).toBe("");
  });

  it("toggles the active key instead of clearing sort on the third click", async () => {
    const user = userEvent.setup();
    render(RestaurantList, { restaurants: sortRestaurants });
    const score = await screen.findByRole("button", {
      name: /sorted by score, highest first/i,
    });

    await user.click(score);
    await waitFor(() => {
      expect(score).toHaveAccessibleName(/sorted by score, lowest first/i);
      expect(rowNames()).toEqual([
        "Alpha Kitchen",
        "Charlie Kitchen",
        "Bravo Kitchen",
      ]);
    });
    expect(score).toHaveAttribute("aria-pressed", "true");
    expect(appState.sortKey).toBe("score");
    expect(appState.sortDirection).toBe("asc");
    expect(sortQuery()).toBe("sortdir=asc");

    await user.click(score);
    await waitFor(() => {
      expect(score).toHaveAccessibleName(/sorted by score, highest first/i);
      expect(rowNames()).toEqual([
        "Bravo Kitchen",
        "Charlie Kitchen",
        "Alpha Kitchen",
      ]);
    });
    expect(score).toHaveAttribute("aria-pressed", "true");
    expect(appState.sortKey).toBe("score");
    expect(appState.sortDirection).toBe("desc");
    expect(sortQuery()).toBe("");

    await user.click(score);
    await waitFor(() => {
      expect(score).toHaveAccessibleName(/sorted by score, lowest first/i);
      expect(rowNames()).toEqual([
        "Alpha Kitchen",
        "Charlie Kitchen",
        "Bravo Kitchen",
      ]);
    });
    expect(appState.sortKey).not.toBeNull();
    expect(sortQuery()).toBe("sortdir=asc");
  });

  it("applies a key's default direction when switching keys", async () => {
    const user = userEvent.setup();
    render(RestaurantList, { restaurants: sortRestaurants });
    await screen.findByRole("button", {
      name: /sorted by score, highest first/i,
    });

    await user.click(screen.getByRole("button", { name: /^sort by name$/i }));
    const name = await screen.findByRole("button", {
      name: /sorted by name, a to z/i,
    });
    expect(name).toHaveAttribute("aria-pressed", "true");
    expect(name).toHaveTextContent(/A-Z/);
    await waitFor(() => {
      expect(rowNames()).toEqual([
        "Alpha Kitchen",
        "Bravo Kitchen",
        "Charlie Kitchen",
      ]);
    });
    expect(sortQuery()).toBe("sort=name&sortdir=asc");

    await user.click(name);
    await waitFor(() => {
      expect(name).toHaveAccessibleName(/sorted by name, z to a/i);
      expect(rowNames()).toEqual([
        "Charlie Kitchen",
        "Bravo Kitchen",
        "Alpha Kitchen",
      ]);
    });
    expect(name).toHaveAttribute("aria-pressed", "true");
    expect(sortQuery()).toBe("sort=name");

    await user.click(
      screen.getByRole("button", { name: /^sort by score$/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /sorted by score, highest first/i,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(rowNames()).toEqual([
        "Bravo Kitchen",
        "Charlie Kitchen",
        "Alpha Kitchen",
      ]);
    });
    expect(sortQuery()).toBe("");
  });

  it("sorts by recency and keeps a named order after repeated clicks", async () => {
    const user = userEvent.setup();
    render(RestaurantList, { restaurants: sortRestaurants });
    await user.click(
      await screen.findByRole("button", { name: /^sort by recent$/i }),
    );

    const recent = await screen.findByRole("button", {
      name: /sorted by recent, newest first/i,
    });
    expect(recent).toHaveTextContent(/Recent/);
    expect(recent).toHaveTextContent(/↓/);
    await waitFor(() => {
      expect(rowNames()).toEqual([
        "Bravo Kitchen",
        "Alpha Kitchen",
        "Charlie Kitchen",
      ]);
    });
    expect(sortQuery()).toBe("sort=recency");

    await user.click(recent);
    await waitFor(() => {
      expect(recent).toHaveAccessibleName(/sorted by recent, oldest first/i);
      expect(rowNames()).toEqual([
        "Charlie Kitchen",
        "Alpha Kitchen",
        "Bravo Kitchen",
      ]);
    });
    expect(recent).toHaveAttribute("aria-pressed", "true");
    expect(sortQuery()).toBe("sort=recency&sortdir=asc");
  });

  it("toggles sort from the keyboard", async () => {
    const user = userEvent.setup();
    render(RestaurantList, { restaurants: sortRestaurants });
    const score = await screen.findByRole("button", {
      name: /sorted by score, highest first/i,
    });

    score.focus();
    expect(score).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(score).toHaveAccessibleName(/sorted by score, lowest first/i);
    });
    expect(appState.sortDirection).toBe("asc");

    await user.keyboard(" ");
    await waitFor(() => {
      expect(score).toHaveAccessibleName(/sorted by score, highest first/i);
    });
    expect(appState.sortKey).toBe("score");
    expect(appState.sortDirection).toBe("desc");
  });

  it("re-applies table sort when only direction is hydrated", async () => {
    render(RestaurantList, { restaurants: sortRestaurants });
    await screen.findByRole("button", {
      name: /sorted by score, highest first/i,
    });
    await waitFor(() => {
      expect(rowNames()).toEqual([
        "Bravo Kitchen",
        "Charlie Kitchen",
        "Alpha Kitchen",
      ]);
    });

    appState.sortDirection = "asc";

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /sorted by score, lowest first/i,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(rowNames()).toEqual([
        "Alpha Kitchen",
        "Charlie Kitchen",
        "Bravo Kitchen",
      ]);
    });
    expect(sortQuery()).toBe("sortdir=asc");
  });
});

const restaurantListSource = readFileSync(
  join(process.cwd(), "src/lib/restaurants/components/RestaurantList.svelte"),
  "utf8",
);

describe("RestaurantList drawer actions", () => {
  beforeEach(() => {
    resetAppState();
    consumeSkipToList();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastInfo.mockReset();
    stubListViewport();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            comment_id: "c1",
            thread_id: "t1",
            role: "primary",
            author: "foodie",
            body: "Best tacos in town",
            score: 12,
            comment_date: "2024-06-01",
            permalink: "https://reddit.com/r/x/comments/1",
            classification: null,
          },
        ],
      }),
    );
  });

  it("exposes map, copy, and Google Maps actions when a row is expanded", async () => {
    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: /restaurant actions/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /^show on map$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy link to la taco spot/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /report la taco spot as a chain/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /open la taco spot in google maps/i,
      }),
    ).toHaveAttribute("href", expect.stringContaining("google.com/maps"));
    expect(
      await screen.findByRole("link", { name: /view on reddit/i }),
    ).toHaveAttribute("href", "https://reddit.com/r/x/comments/1");
  });

  it("reports a chain and queues the slug locally", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("report-chain")) {
        return { ok: true, json: async () => ({ result: "queued" }) };
      }
      return {
        ok: true,
        json: async () => [
          {
            comment_id: "c1",
            thread_id: "t1",
            role: "primary",
            author: "foodie",
            body: "Best tacos in town",
            score: 12,
            comment_date: "2024-06-01",
            permalink: "https://reddit.com/r/x/comments/1",
            classification: null,
          },
        ],
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(RestaurantList, { restaurants });
    appState.selectedRestaurantSlug = "la-taco-spot";
    const report = await screen.findByRole("button", {
      name: /report la taco spot as a chain/i,
    });
    await user.click(report);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/r/la-taco-spot/report-chain",
        { method: "POST" },
      );
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Queued for review");
    expect(appState.reportedChainSlugs).toEqual(["la-taco-spot"]);
  });

  it("enlarges comment permalink tap targets under the mobile breakpoint", () => {
    const drawerMedia = restaurantListSource.lastIndexOf(
      "@media (max-width: 1023px)",
    );
    expect(drawerMedia).toBeGreaterThan(-1);
    const block = restaurantListSource.slice(drawerMedia);
    expect(block).toMatch(
      /\.permalink,[\s\S]*\.endorsement-permalink \{[\s\S]*min-height: 44px/,
    );
    expect(block).toMatch(
      /\.permalink,[\s\S]*\.endorsement-permalink \{[\s\S]*min-width: 44px/,
    );
  });
});

