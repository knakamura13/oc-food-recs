import { describe, expect, it, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const updateMock = vi.fn();
const insertMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("$lib/server/db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
    insert: insertMock,
    transaction: transactionMock,
  },
}));

describe("applyRestaurantCorrection", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
    insertMock.mockReset();
    transactionMock.mockReset();
  });

  it("updates restaurant coordinates and upserts geocode cache", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: 7,
        name: "La Taco Spot",
        location: "Santa Ana",
        street: null,
      },
    ]);
    const from = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) });
    selectMock.mockReturnValue({ from });

    const whereUpdate = vi.fn().mockResolvedValue(undefined);
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate });
    updateMock.mockReturnValue({ set: setUpdate });

    const onConflict = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflict });
    insertMock.mockReturnValue({ values });

    transactionMock.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        await fn({
          update: updateMock,
          insert: insertMock,
        });
      },
    );

    const { applyRestaurantCorrection } = await import("../geocode/admin");
    await applyRestaurantCorrection(7, {
      lat: 33.7455,
      lng: -117.8677,
      detail: "manual: 33.7455, -117.8677",
      provider: "manual",
    });

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalled();
  });

  it("throws when the restaurant does not exist", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const from = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) });
    selectMock.mockReturnValue({ from });

    const { applyRestaurantCorrection } = await import("../geocode/admin");
    await expect(
      applyRestaurantCorrection(99, {
        lat: 33.7,
        lng: -117.8,
        detail: "manual",
        provider: "manual",
      }),
    ).rejects.toThrow("Restaurant not found.");
  });
});
