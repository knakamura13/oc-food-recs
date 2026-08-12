import { render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import ExplorerApp from "./ExplorerApp.svelte";
import type { ExplorerPageData } from "$lib/restaurants/explorer-page-data";
import { appState } from "$lib/restaurants/stores.svelte";
import { makeRestaurant, resetAppState } from "$lib/restaurants/test-utils";
import { DEFAULT_TITLE } from "$lib/restaurants/page-meta";
import { SEARCH_DEBOUNCE_MS } from "$lib/debounce";

const nav = vi.hoisted(() => ({
  replaceState: vi.fn(),
}));

vi.mock("$app/navigation", () => ({
  afterNavigate: vi.fn(),
  replaceState: (...args: unknown[]) => nav.replaceState(...args),
}));

vi.mock("$lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function stubExplorerViewport() {
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
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
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
}

function makeHomeData(): ExplorerPageData {
  const restaurants = [
    makeRestaurant({
      name: "Taco Palace",
      slug: "taco-palace",
      cuisine: "Mexican",
      location: "Santa Ana",
    }),
  ];
  const meta = {
    source_threads: [
      {
        id: "thread-1",
        title: "Best restaurants",
        url: "https://reddit.com/r/orangecounty/1",
        subreddit: "orangecounty",
        post_id: "abc",
        comment_count: 10,
        restaurant_count: 1,
      },
    ],
    total_comments_processed: 10,
  };
  return {
    dataset: { restaurants, meta },
    urlState: {},
    pageMeta: {
      title: DEFAULT_TITLE,
      description: "Explore 1 community-recommended mom and pop restaurants.",
      shareUrl: "http://localhost/",
    },
    pageOrigin: "http://localhost",
  };
}

describe("ExplorerApp URL sync", () => {
  beforeEach(() => {
    resetAppState();
    nav.replaceState.mockClear();
    stubExplorerViewport();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] }),
    );
    window.history.replaceState({}, "", "/");
  });

  it("does not replaceState until routerReady is armed", async () => {
    render(ExplorerApp, { data: makeHomeData(), routerReady: false });
    appState.sortKey = "name";
    appState.sortDirection = "asc";

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(nav.replaceState).not.toHaveBeenCalled();
  });

  it("writes sort to the URL once routerReady is true without another navigation", async () => {
    const data = makeHomeData();
    const { rerender } = render(ExplorerApp, { data, routerReady: false });
    appState.sortKey = "name";
    appState.sortDirection = "asc";

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(nav.replaceState).not.toHaveBeenCalled();

    await rerender({ data, routerReady: true });

    await waitFor(() => {
      expect(nav.replaceState).toHaveBeenCalled();
    });
    const url = String(nav.replaceState.mock.calls[0][0]);
    expect(url).toContain("sort=name");
    expect(url).toContain("sortdir=asc");
  });

  it("wraps the explorer chrome in a main landmark", () => {
    render(ExplorerApp, { data: makeHomeData(), routerReady: false });
    expect(document.querySelector("main")).not.toBeNull();
  });

  it("renders the map pane as a closed native dialog on desktop", () => {
    render(ExplorerApp, { data: makeHomeData(), routerReady: false });
    const pane = document.getElementById("restaurant-map-panel");
    expect(pane?.tagName).toBe("DIALOG");
    expect(pane).not.toHaveAttribute("role", "dialog");
    expect(pane).not.toHaveAttribute("aria-modal", "true");
    expect((pane as HTMLDialogElement | null)?.open).toBe(false);
  });
});

describe("ExplorerApp page search debounce", () => {
  beforeEach(() => {
    resetAppState();
    nav.replaceState.mockClear();
    stubExplorerViewport();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] }),
    );
    window.history.replaceState({}, "", "/");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters the list after debounce and restores the full list when cleared", () => {
    const data = makeHomeData();
    data.dataset.restaurants = [
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

    render(ExplorerApp, { data, routerReady: false });
    flushSync();
    expect(document.querySelector(".result-count")).toHaveTextContent(
      "2 restaurants",
    );

    appState.searchQuery = "taco";
    flushSync();
    expect(document.querySelector(".result-count")).toHaveTextContent(
      "2 restaurants",
    );

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    flushSync();
    expect(document.querySelector(".result-count")).toHaveTextContent(
      "1 restaurant",
    );

    appState.searchQuery = "";
    flushSync();
    expect(document.querySelector(".result-count")).toHaveTextContent(
      "2 restaurants",
    );
  });
});
