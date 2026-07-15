import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initSavedState,
  isSaved,
  loadSavedSlugs,
  savedState,
  toggleSaved,
} from "./saved-restaurants.svelte";

const STORAGE_KEY = "ocFoodRecs_savedRestaurants";

describe("saved-restaurants", () => {
  beforeEach(() => {
    localStorage.clear();
    savedState.slugs = [];
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts empty when nothing is stored", () => {
    expect(loadSavedSlugs()).toEqual([]);
    initSavedState();
    expect(savedState.slugs).toEqual([]);
  });

  it("saves a slug and persists it", () => {
    expect(toggleSaved("taco-palace")).toBe(true);
    expect(isSaved("taco-palace")).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([
      "taco-palace",
    ]);
  });

  it("unsaves a previously saved slug", () => {
    toggleSaved("taco-palace");
    expect(toggleSaved("taco-palace")).toBe(false);
    expect(isSaved("taco-palace")).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([]);
  });

  it("keeps other saved slugs when one is removed", () => {
    toggleSaved("a");
    toggleSaved("b");
    toggleSaved("c");
    toggleSaved("b");
    expect(savedState.slugs).toEqual(["a", "c"]);
  });

  it("hydrates from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["pho-spot", "bbq-barn"]));
    initSavedState();
    expect(savedState.slugs).toEqual(["pho-spot", "bbq-barn"]);
  });

  it("ignores malformed stored values", () => {
    localStorage.setItem(STORAGE_KEY, "not-json{");
    expect(loadSavedSlugs()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(loadSavedSlugs()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(["ok", 42, null]));
    expect(loadSavedSlugs()).toEqual(["ok"]);
  });
});
