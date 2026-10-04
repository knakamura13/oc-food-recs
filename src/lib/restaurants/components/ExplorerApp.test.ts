import { render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import ExplorerApp from "./ExplorerApp.svelte";
import type { ExplorerPageData } from "$lib/restaurants/explorer-page-data";
import { appState } from "$lib/restaurants/stores.svelte";
import { parseSearchParams } from "$lib/restaurants/url-state";
import { makeRestaurant, resetAppState } from "$lib/restaurants/test-utils";
import { SEARCH_DEBOUNCE_MS } from "$lib/debounce";
import { forgetUserLocation } from '$lib/restaurants/location';
import * as bounds from '$lib/restaurants/explorer-bounds';

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
    newest_comment_date: null,
  };
  return {
    dataset: { restaurants, meta },
    urlState: {},
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

  it("keeps likely chains out of rendered results from an old shared link", () => {
    const data = makeHomeData();
    data.dataset.restaurants.push(makeRestaurant({
      name: "Synthetic Chain", slug: "synthetic-chain", chain_confidence: "likely_chain",
    }));
    data.urlState = parseSearchParams(new URLSearchParams("mompop=0"));
    render(ExplorerApp, { data, routerReady: false });
    flushSync();
    expect(document.querySelector("#restaurant-taco-palace")).not.toBeNull();
    expect(document.querySelector("#restaurant-synthetic-chain")).toBeNull();
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

	it('adds matching comments to the list and clears them immediately on a new query', async () => {
		const data = makeHomeData();
		const fit = vi.spyOn(bounds, 'coordsForFitBounds');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => {
			await new Promise((resolve) => setTimeout(resolve, 300));
			return [{ slug: 'taco-palace', rank: 0.1, quote: '<b>Happy hour</b> on the patio' }];
		} }));
		render(ExplorerApp, { data, routerReady: false });
		flushSync();
		appState.searchQuery = 'happy hour';
		flushSync();
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 300);
		flushSync();
		expect(document.querySelector('#restaurant-taco-palace')).not.toBeNull();
		expect(document.querySelector('.comment-match')).toHaveTextContent('Mentioned in comments');
		expect(document.querySelector('.comment-match')).toHaveTextContent('<b>Happy hour</b> on the patio');
		expect(document.querySelector('.comment-match b')).toBeNull();
		await vi.advanceTimersByTimeAsync(250);
		flushSync();
		expect(fit).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ slug: 'taco-palace' })]));
		fit.mockRestore();
		appState.searchQuery = 'omakase';
		flushSync();
		expect(document.querySelector('.comment-match')).toBeNull();
	});

	it('reports comment search failure while preserving name search', async () => {
		render(ExplorerApp, { data: makeHomeData(), routerReady: false });
		flushSync();
		appState.searchQuery = 'taco';
		flushSync();
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		flushSync();
		expect(document.querySelector('#restaurant-taco-palace')).not.toBeNull();
		expect(document.body).toHaveTextContent('Comment search unavailable');
	});

  it('restores distance after search, but score after forgetting location', () => {
    render(ExplorerApp, { data: makeHomeData(), routerReady: false });
    flushSync();
    appState.userLocation = { lat: 33.7, lng: -117.8 };
    appState.sortKey = 'distance'; appState.sortDirection = 'asc';
    flushSync();
    expect(appState.sortKey).toBe('distance');
    appState.searchQuery = 'taco'; flushSync();
    expect(appState.sortKey).toBe('relevance');
    appState.searchQuery = ''; flushSync();
    expect(appState.sortKey).toBe('distance');
    appState.searchQuery = 'taco'; flushSync();
    forgetUserLocation(); flushSync();
    appState.searchQuery = ''; flushSync();
    expect(appState.sortKey).toBe('score');
    expect(appState.sortDirection).toBe('desc');
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
      "1 of 2 restaurants",
    );

    appState.searchQuery = "";
    flushSync();
    expect(document.querySelector(".result-count")).toHaveTextContent(
      "2 restaurants",
    );
  });
});
