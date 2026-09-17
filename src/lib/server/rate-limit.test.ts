import { describe, expect, it } from "vitest";
import { allowRequest, resetRateLimitForTests } from "./rate-limit";

describe("allowRequest", () => {
  it("allows up to the limit then blocks inside the window", () => {
    resetRateLimitForTests();
    expect(allowRequest("k", { limit: 2, windowMs: 60_000 }, 1_000)).toBe(
      true,
    );
    expect(allowRequest("k", { limit: 2, windowMs: 60_000 }, 1_100)).toBe(
      true,
    );
    expect(allowRequest("k", { limit: 2, windowMs: 60_000 }, 1_200)).toBe(
      false,
    );
  });

  it("resets after the window elapses", () => {
    resetRateLimitForTests();
    expect(allowRequest("k", { limit: 1, windowMs: 1_000 }, 0)).toBe(true);
    expect(allowRequest("k", { limit: 1, windowMs: 1_000 }, 999)).toBe(false);
    expect(allowRequest("k", { limit: 1, windowMs: 1_000 }, 1_000)).toBe(
      true,
    );
  });
});
