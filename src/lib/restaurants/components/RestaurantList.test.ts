import { render, waitFor } from "@testing-library/svelte";
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

describe("RestaurantList", () => {
  beforeEach(() => {
    resetAppState();
    mocks.toastError.mockReset();
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
  });
});
