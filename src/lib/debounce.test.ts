import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DEBOUNCE_MS, scheduleDebounced } from "./debounce";

describe("scheduleDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run until SEARCH_DEBOUNCE_MS elapses", () => {
    const callback = vi.fn();
    scheduleDebounced(callback);

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("cancel prevents the callback from running", () => {
    const callback = vi.fn();
    const cancel = scheduleDebounced(callback);
    cancel();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(callback).not.toHaveBeenCalled();
  });
});
