import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetRateLimitForTests } from "$lib/server/rate-limit";

const reportMock = vi.fn();

vi.mock("$lib/server/restaurants/admin", () => ({
  reportRestaurantAsChain: (...args: unknown[]) => reportMock(...args),
}));

function event(overrides: Record<string, unknown> = {}) {
  return {
    params: { slug: "habit" },
    getClientAddress: () => "127.0.0.1",
    request: new Request("http://localhost/api/r/habit/report-chain", {
      method: "POST",
      headers: { host: "localhost", origin: "http://localhost" },
    }),
    ...overrides,
  } as never;
}

describe("POST /api/r/[slug]/report-chain", () => {
  beforeEach(() => {
    reportMock.mockReset();
    resetRateLimitForTests();
  });

  it("queues a chain report", async () => {
    reportMock.mockResolvedValue("queued");
    const { POST } = await import(
      "../../../routes/api/r/[slug]/report-chain/+server"
    );
    const res = await POST(event());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "queued" });
    expect(reportMock).toHaveBeenCalledWith("habit");
  });

  it("returns 404 when the restaurant is missing", async () => {
    reportMock.mockResolvedValue("not_found");
    const { POST } = await import(
      "../../../routes/api/r/[slug]/report-chain/+server"
    );
    const res = await POST(event({ params: { slug: "missing" } }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ result: "not_found" });
  });

  it("rejects a cross-origin report", async () => {
    const { POST } = await import(
      "../../../routes/api/r/[slug]/report-chain/+server"
    );
    const res = await POST(
      event({
        request: new Request("http://localhost/api/r/habit/report-chain", {
          method: "POST",
          headers: { host: "localhost", origin: "https://evil.example" },
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated reports from the same IP", async () => {
    reportMock.mockResolvedValue("queued");
    const { POST } = await import(
      "../../../routes/api/r/[slug]/report-chain/+server"
    );
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(event());
      expect(res.status).toBe(200);
    }
    const limited = await POST(event());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ result: "rate_limited" });
    expect(reportMock).toHaveBeenCalledTimes(5);
  });
});
