import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import ExplorerSkeleton from "./ExplorerSkeleton.svelte";

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
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
}

describe("ExplorerSkeleton", () => {
  it("renders explorer chrome as placeholders, not restaurant rows", () => {
    stubMatchMedia(false);
    render(ExplorerSkeleton);

    const skeleton = document.querySelector(".explorer-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading restaurants…")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /best mom & pop restaurants in orange county/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cuisine")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
    expect(screen.getByText("Recency")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
    expect(document.querySelector(".filter-row")).toBeTruthy();
    expect(document.querySelector(".filter-actions")).toBeTruthy();
    expect(document.querySelector(".action-label")).toBeTruthy();
    expect(
      screen.getByText("Search restaurants, cuisines, or cities..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Search restaurants or cities..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sort by:")).toBeInTheDocument();
    expect(document.querySelector(".map-pane")).toBeTruthy();
    expect(document.querySelector("main.explorer-skeleton")).toBeTruthy();
    expect(document.querySelectorAll(".row").length).toBe(8);
    expect(document.querySelectorAll(".skeleton-line").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("Taco Palace")).not.toBeInTheDocument();
    expect(screen.queryByText("La Taco Spot")).not.toBeInTheDocument();
  });

  it("disables shimmer when the user prefers reduced motion", () => {
    stubMatchMedia(true);
    render(ExplorerSkeleton);

    expect(document.querySelector(".explorer-skeleton")).toHaveClass(
      "no-motion",
    );
  });
});
