const STORAGE_KEY = "ocFoodRecs_savedRestaurants";

/**
 * Device-local "want to try" list, persisted to localStorage (same pattern as
 * visit-tracker). Deliberately NOT synced to the URL: a saved list is personal,
 * so sharing a link never leaks or depends on it.
 */
export const savedState = $state({ slugs: [] as string[] });

export function loadSavedSlugs(): string[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

/** Hydrate savedState from localStorage; call once on mount (client only). */
export function initSavedState(): void {
  savedState.slugs = loadSavedSlugs();
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState.slugs));
}

export function isSaved(slug: string): boolean {
  return savedState.slugs.includes(slug);
}

/** Toggle a slug in the saved list. Returns true when the slug is saved after the toggle. */
export function toggleSaved(slug: string): boolean {
  if (savedState.slugs.includes(slug)) {
    savedState.slugs = savedState.slugs.filter((s) => s !== slug);
    persist();
    return false;
  }
  savedState.slugs = [...savedState.slugs, slug];
  persist();
  return true;
}
