import { describe, expect, it } from "vitest";
import {
  SORT_DEFAULT_DIRECTION,
  nextSortState,
  sortButtonAccessibleName,
  sortDirectionPhrase,
  sortDirectionShort,
} from "./sort-cycle";
import type { SortKey } from "./types";

const KEYS = ["score", "recency", "name"] as const satisfies readonly SortKey[];

describe("nextSortState", () => {
  it("applies a key's default direction when that key is inactive", () => {
    expect(nextSortState("score", "desc", "name")).toEqual({
      sortKey: "name",
      sortDirection: "asc",
    });
    expect(nextSortState("name", "desc", "score")).toEqual({
      sortKey: "score",
      sortDirection: "desc",
    });
    expect(nextSortState("score", "asc", "recency")).toEqual({
      sortKey: "recency",
      sortDirection: "desc",
    });
  });

  it("toggles direction only when clicking the active key", () => {
    expect(nextSortState("score", "desc", "score")).toEqual({
      sortKey: "score",
      sortDirection: "asc",
    });
    expect(nextSortState("score", "asc", "score")).toEqual({
      sortKey: "score",
      sortDirection: "desc",
    });
    expect(nextSortState("name", "asc", "name")).toEqual({
      sortKey: "name",
      sortDirection: "desc",
    });
    expect(nextSortState("name", "desc", "name")).toEqual({
      sortKey: "name",
      sortDirection: "asc",
    });
  });

  it("never returns an unsorted / null key across a 3-click cycle", () => {
    for (const key of KEYS) {
      let sortKey: SortKey = "score";
      let sortDirection = SORT_DEFAULT_DIRECTION.score;
      for (let i = 0; i < 3; i++) {
        const next = nextSortState(sortKey, sortDirection, key);
        sortKey = next.sortKey;
        sortDirection = next.sortDirection;
        expect(sortKey).toBe(key);
        expect(sortDirection === "asc" || sortDirection === "desc").toBe(true);
      }
    }
  });
});

describe("sort labels", () => {
  it("names the active order in full and short form", () => {
    expect(sortDirectionPhrase("score", "desc")).toBe("highest first");
    expect(sortDirectionShort("score", "desc")).toBe("high-low");
    expect(
      sortButtonAccessibleName("score", "Score", true, "desc"),
    ).toBe("Sorted by Score, highest first");
    expect(sortButtonAccessibleName("name", "Name", false, "asc")).toBe(
      "Sort by Name",
    );
  });
});
