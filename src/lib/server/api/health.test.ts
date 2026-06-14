import { describe, expect, it, vi, beforeEach } from "vitest";

const executeMock = vi.fn();

vi.mock("$lib/server/db", () => ({
  db: { execute: executeMock },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("returns row counts when the database is healthy", async () => {
    executeMock.mockResolvedValue({
      rows: [
        {
          restaurant_count: 42,
          thread_count: 3,
          mention_count: 120,
        },
      ],
    });

    const { GET } = await import("../../../routes/api/health/+server");
    const res = await GET({} as never);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      timestamp: expect.any(String),
      restaurant_count: 42,
      thread_count: 3,
      mention_count: 120,
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 when the database is unavailable", async () => {
    executeMock.mockRejectedValue(new Error("connection refused"));

    const { GET } = await import("../../../routes/api/health/+server");
    const res = await GET({} as never);
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Database unavailable");
    expect(data.timestamp).toEqual(expect.any(String));
  });
});
