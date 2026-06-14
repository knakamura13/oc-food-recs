import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const insertMock = vi.fn();

vi.mock("$lib/server/db", () => ({
  db: {
    update: updateMock,
    insert: insertMock,
  },
}));

describe("restaurants admin mutations", () => {
  beforeEach(() => {
    updateMock.mockReset();
    insertMock.mockReset();
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
});
