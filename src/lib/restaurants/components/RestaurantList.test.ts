import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantList from "./RestaurantList.svelte";
import { appState } from "$lib/restaurants/stores.svelte";
import { makeRestaurant, resetAppState } from "$lib/restaurants/test-utils";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock("$lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: mocks.toastError,
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
    mocks.toastError.mockReset();
    stubListViewport();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] }),
    );
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

  it("shows a clear-filters action when the list is empty", async () => {
    const { getByRole } = render(RestaurantList, { restaurants: [] });
    appState.activeCuisines = ["Mexican"];

    const clearBtn = getByRole("button", { name: /clear filters/i });
    clearBtn.click();

    expect(appState.activeCuisines).toEqual([]);
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
});
