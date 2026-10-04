import { describe, expect, it, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const insertMock = vi.fn();
const selectMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("$lib/server/db", () => ({
  db: {
    update: updateMock,
    insert: insertMock,
    select: selectMock,
    transaction: transactionMock,
  },
}));

describe("restaurants admin mutations", () => {
  beforeEach(() => {
    updateMock.mockReset();
    insertMock.mockReset();
    selectMock.mockReset();
    transactionMock.mockReset();
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

  it.each(["restoreRestaurantActive", "dismissDuplicateCandidate"] as const)(
    "%s restores visibility without asserting worldwide independence",
    async (action) => {
      const returning = vi.fn().mockResolvedValue([{ id: 7 }]);
      const set = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning }),
      });
      updateMock.mockReturnValue({ set });

      const admin = await import("./admin");
      await admin[action](7);
      expect(set).toHaveBeenCalledWith(expect.objectContaining({
        status: "active",
        exclusionReason: null,
        chainConfidence: "unknown",
        reviewedAt: expect.anything(),
      }));
    },
  );

  function identityTransaction(rows: object[]) {
    const limit = vi.fn().mockResolvedValue(rows);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) }),
      }),
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    transactionMock.mockImplementation((callback) => callback(tx));
    return { set, limit, tx };
  }

  it("merges identities without turning the winner into verified independent", async () => {
    const winner = {
      id: 1, name: "Test", slug: "test", location: "Irvine", street: "1 Main St",
      cuisine: "Thai", lat: 1, lng: 2, chainConfidence: "unknown",
    };
    const loser = { ...winner, id: 2, slug: "test-2", name: "Test Kitchen" };
    const { set, limit } = identityTransaction([]);
    limit.mockResolvedValueOnce([winner]).mockResolvedValueOnce([loser]);
    const { mergeRestaurants } = await import("./admin");
    await mergeRestaurants(1, 2);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      name: "Test Kitchen",
      status: "active",
      exclusionReason: null,
      chainConfidence: "unknown",
      reviewedAt: expect.anything(),
    }));
  });

  it("invalidates confidence when a rename changes the evidenced identity", async () => {
    const { set, tx } = identityTransaction([{
      id: 1, name: "Test", location: "Irvine", street: "1 Main St",
      chainConfidence: "independent",
    }]);
    const { renameRestaurant } = await import("./admin");
    await renameRestaurant(1, "Test Kitchen");
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      name: "Test Kitchen",
      chainConfidence: "unknown",
      reviewedAt: expect.anything(),
    }));
    expect(tx.insert).toHaveBeenCalledTimes(1);
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

describe("mention takedown helpers", () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it("takes a comment down for every restaurant row and reports how many changed", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    updateMock.mockReturnValue({ set });

    const { takeDownMention } = await import("./admin");
    await expect(takeDownMention("t", "t1_x")).resolves.toBe(2);
    expect(set).toHaveBeenCalledWith({ status: "taken_down" });
  });

  it("restore throws when the comment is missing", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    updateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }),
    });
    const { restoreMention } = await import("./admin");
    await expect(restoreMention("t", "t1_x")).rejects.toThrow("Mention not found.");
  });

  it("recognises a pasted permalink in any reddit.com form", async () => {
    const { redditCommentIdFromUrl } = await import("./admin");
    expect(
      redditCommentIdFromUrl(
        "https://old.reddit.com/r/CostaMesa/comments/14n9q0f/comment/jqz1lke/?context=3",
      ),
    ).toBe("t1_jqz1lke");
    expect(
      redditCommentIdFromUrl("https://www.reddit.com/r/CostaMesa/comments/14n9q0f/best_food/jqz1lke"),
    ).toBe("t1_jqz1lke");
    expect(redditCommentIdFromUrl("best tacos in town")).toBeNull();
  });
});
