const STORAGE_KEY = "ocFoodRecs_lastVisit";

export function getLastVisitMs(): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

/** Timestamp from the previous session (before this page load updates storage). */
export const getPriorVisitMs = getLastVisitMs;

export function setLastVisitNow(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

export function hasNewMentionsSince(
  lastVisitMs: number,
  commentDates: (string | null)[],
): boolean {
  for (const d of commentDates) {
    if (!d) continue;
    const t = Date.parse(d);
    if (!Number.isNaN(t) && t > lastVisitMs) return true;
  }
  return false;
}
