import type { SortDirection, SortKey } from "./types";

export const SORT_DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  score: "desc",
  recency: "desc",
  name: "asc",
};

export function nextSortState(
  currentKey: SortKey,
  currentDirection: SortDirection,
  clickedKey: SortKey,
): { sortKey: SortKey; sortDirection: SortDirection } {
  if (currentKey !== clickedKey) {
    return {
      sortKey: clickedKey,
      sortDirection: SORT_DEFAULT_DIRECTION[clickedKey],
    };
  }
  return {
    sortKey: currentKey,
    sortDirection: currentDirection === "desc" ? "asc" : "desc",
  };
}

export function sortDirectionPhrase(
  key: SortKey,
  direction: SortDirection,
): string {
  switch (key) {
    case "score":
      return direction === "desc" ? "highest first" : "lowest first";
    case "recency":
      return direction === "desc" ? "newest first" : "oldest first";
    case "name":
      return direction === "asc" ? "A to Z" : "Z to A";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function sortDirectionShort(
  key: SortKey,
  direction: SortDirection,
): string {
  switch (key) {
    case "score":
      return direction === "desc" ? "high-low" : "low-high";
    case "recency":
      return direction === "desc" ? "new-old" : "old-new";
    case "name":
      return direction === "asc" ? "A-Z" : "Z-A";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function sortButtonAccessibleName(
  key: SortKey,
  label: string,
  isActive: boolean,
  direction: SortDirection,
): string {
  if (isActive) {
    return `Sorted by ${label}, ${sortDirectionPhrase(key, direction)}`;
  }
  return `Sort by ${label}`;
}
