import { describe, expect, it, vi, beforeEach } from "vitest";

const reportMock = vi.fn();

vi.mock("$lib/server/restaurants/admin", () => ({
  reportRestaurantAsChain: (...args: unknown[]) => reportMock(...args),
}));

describe("POST /api/r/[slug]/report-chain", () => {
  beforeEach(() => {
    reportMock.mockReset();
  });

  it("queues a chain report", async () => {
    reportMock.mockResolvedValue("queued");
    const { POST } = await import(
      "../../../routes/api/r/[slug]/report-chain/+server"
    );
    const res = await POST({ params: { slug: "habit" } } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "queued" });
    expect(reportMock).toHaveBeenCalledWith("habit");
  });

  it("returns 404 when the restaurant is missing", async () => {
    reportMock.mockResolvedValue("not_found");
    const { POST } = await import(
      "../../../routes/api/r/[slug]/report-chain/+server"
    );
    const res = await POST({ params: { slug: "missing" } } as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ result: "not_found" });
  });
});
