import { describe, expect, it, vi, beforeEach } from "vitest";

const executeMock = vi.fn();

vi.mock("$lib/server/db", () => ({
  db: { execute: executeMock },
}));

describe("GET /api/r/[slug].json", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("returns JSON mentions for a slug", async () => {
    executeMock.mockResolvedValue({
      rows: [
        {
          comment_id: "t1_abc",
          thread_id: "thread-1",
          permalink: "https://reddit.com/x",
          author: "alice",
          body: "Great tacos",
          score: 10,
          role: "primary",
          classification: null,
          comment_date: "2024-01-01T00:00:00Z",
        },
      ],
    });
    const { GET } = await import("../../../routes/api/r/[slug].json/+server");
    const res = await GET({ params: { slug: "taco-spot" } } as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].body).toBe("Great tacos");
  });

  it("returns empty array when no mentions match", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    const { GET } = await import("../../../routes/api/r/[slug].json/+server");
    const res = await GET({ params: { slug: "missing" } } as never);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});
