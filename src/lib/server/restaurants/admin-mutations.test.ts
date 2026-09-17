import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const insertMock = vi.fn();
const selectMock = vi.fn();

vi.mock("$lib/server/db", () => ({
  db: {
    update: updateMock,
    insert: insertMock,
    select: selectMock,
  },
}));

describe("restaurants admin mutations", () => {
  beforeEach(() => {
    updateMock.mockReset();
    insertMock.mockReset();
    selectMock.mockReset();
  });

  it("markRestaurantExcluded updates status and throws when missing", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    updateMock.mockReturnValue({ set });

    const { markRestaurantExcluded } = await import("./admin");
    await expect(markRestaurantExcluded(42, "chain")).rejects.toThrow(
      "Restaurant not found.",
    );
  });

  it("markRestaurantExcluded succeeds when a row is updated", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 42 }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    updateMock.mockReturnValue({ set });

    const { markRestaurantExcluded } = await import("./admin");
    await expect(markRestaurantExcluded(42, "chain")).resolves.toBeUndefined();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "excluded",
        exclusionReason: "chain",
        chainConfidence: "likely_chain",
      }),
    );
  });

  it("restoreRestaurantActive throws when the restaurant is missing", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    updateMock.mockReturnValue({ set });

    const { restoreRestaurantActive } = await import("./admin");
    await expect(restoreRestaurantActive(7)).rejects.toThrow(
      "Restaurant not found.",
    );
  });

  it("addBrandToRegistry rejects empty normalized names", async () => {
    const { addBrandToRegistry } = await import("./admin");
    await expect(addBrandToRegistry("!!!", "chain", null)).rejects.toThrow(
      "Brand name is empty after normalization.",
    );
  });

  it("reportRestaurantAsChain queues an unreviewed active restaurant", async () => {
    const limit = vi.fn().mockResolvedValue([
      { id: 9, status: "active", reviewedAt: null },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    selectMock.mockReturnValue({ from });

    const returning = vi.fn().mockResolvedValue([{ id: 9 }]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where: updateWhere });
    updateMock.mockReturnValue({ set });

    const { reportRestaurantAsChain } = await import("./admin");
    await expect(reportRestaurantAsChain("in-n-out")).resolves.toBe("queued");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_review",
        exclusionReason: "user_reported_chain",
      }),
    );
    expect(set.mock.calls[0][0]).not.toHaveProperty("chainConfidence");
  });

  it("reportRestaurantAsChain does not overwrite a human restore", async () => {
    const limit = vi.fn().mockResolvedValue([
      { id: 9, status: "active", reviewedAt: new Date() },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    selectMock.mockReturnValue({ from });

    const { reportRestaurantAsChain } = await import("./admin");
    await expect(reportRestaurantAsChain("pops")).resolves.toBe(
      "reviewed_keep_active",
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});
