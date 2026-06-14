import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLastVisitMs,
  getPriorVisitMs,
  hasNewMentionsSince,
  setLastVisitNow,
} from "./visit-tracker";

describe("visit-tracker", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("returns null when no prior visit is stored", () => {
    expect(getLastVisitMs()).toBeNull();
    expect(getPriorVisitMs()).toBeNull();
  });

  it("stores and reads an ISO timestamp", () => {
    setLastVisitNow();
    const ms = getLastVisitMs();
    expect(ms).toBe(Date.parse("2025-06-01T12:00:00Z"));
  });

  it("returns null for invalid stored values", () => {
    localStorage.setItem("ocFoodRecs_lastVisit", "not-a-date");
    expect(getLastVisitMs()).toBeNull();
  });

  it("detects mentions newer than the last visit", () => {
    const lastVisit = Date.parse("2025-01-01T00:00:00Z");
    expect(
      hasNewMentionsSince(lastVisit, [
        "2024-12-01T00:00:00Z",
        "2025-02-01T00:00:00Z",
      ]),
    ).toBe(true);
  });

  it("returns false when all dated mentions are older than the last visit", () => {
    const lastVisit = Date.parse("2025-06-01T00:00:00Z");
    expect(
      hasNewMentionsSince(lastVisit, ["2025-01-01T00:00:00Z", null, "invalid"]),
    ).toBe(false);
  });
});
