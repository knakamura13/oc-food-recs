import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type { ExplorerPageData } from "$lib/restaurants/explorer-page-data";
import Page from "./+page.svelte";

describe("home page first-load shell", () => {
  it("shows the explorer skeleton while streamed home data is pending", () => {
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
    render(Page, {
      data: { home: new Promise<ExplorerPageData>(() => {}) },
    });

    expect(document.querySelector(".explorer-skeleton")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByText("Loading restaurants…")).toBeInTheDocument();
    expect(screen.queryByText("Taco Palace")).not.toBeInTheDocument();
  });
});
