import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type { ExplorerPageData } from "$lib/restaurants/explorer-page-data";
import Page from "./+page.svelte";

const pageSource = readFileSync(
  join(process.cwd(), "src/routes/+page.svelte"),
  "utf8",
);

const nav = vi.hoisted(() => ({
  afterNavigate: vi.fn<(callback: () => void) => void>(),
  replaceState: vi.fn(),
}));

vi.mock("$app/navigation", () => ({
  afterNavigate: (callback: () => void) => nav.afterNavigate(callback),
  replaceState: (...args: unknown[]) => nav.replaceState(...args),
}));

function stubMatchMedia() {
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
}

describe("home page first-load shell", () => {
  it("shows the explorer skeleton while streamed home data is pending", () => {
    stubMatchMedia();
    nav.afterNavigate.mockClear();
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

  it("registers afterNavigate on the page shell before ExplorerApp mounts", () => {
    stubMatchMedia();
    nav.afterNavigate.mockClear();
    render(Page, {
      data: { home: new Promise<ExplorerPageData>(() => {}) },
    });

    expect(document.querySelector(".explorer-skeleton")).toBeTruthy();
    expect(nav.afterNavigate).toHaveBeenCalledTimes(1);
    expect(typeof nav.afterNavigate.mock.calls[0][0]).toBe("function");
  });

  it("shows a home link when streamed home data rejects", async () => {
    stubMatchMedia();
    nav.afterNavigate.mockClear();
    const home = Promise.reject(new Error("load failed"));
    home.catch(() => {});
    render(Page, { data: { home } });

    const link = await screen.findByRole("link", {
      name: /back to restaurants/i,
    });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("home-link");
    expect(screen.queryByText("Loading restaurants…")).not.toBeInTheDocument();
    expect(nav.afterNavigate).toHaveBeenCalledTimes(1);
    expect(pageSource).toMatch(/\.home-link:hover\s*\{/);
    expect(pageSource).toMatch(/\.home-link:active\s*\{/);
    expect(pageSource).toContain("prefers-reduced-motion");
  });
});
