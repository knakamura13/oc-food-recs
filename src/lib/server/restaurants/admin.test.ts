import { describe, expect, it } from "vitest";
import { partitionExclusionQueue, type ReviewRestaurant } from "./admin";

const row = (overrides: Partial<ReviewRestaurant>): ReviewRestaurant => ({
  id: 1,
  name: "Test",
  slug: "test",
  location: null,
  status: "pending_review",
  exclusionReason: null,
  reviewedAt: null,
  ...overrides,
});

describe("partitionExclusionQueue", () => {
  it("splits pending_review and excluded rows", () => {
    const rows = [
      row({
        id: 1,
        status: "pending_review",
        exclusionReason: "llm_suspected_chain",
      }),
      row({ id: 2, status: "excluded", exclusionReason: "chain" }),
      row({ id: 3, status: "pending_review", name: "Other" }),
    ];
    const { pendingReview, excluded } = partitionExclusionQueue(rows);
    expect(pendingReview).toHaveLength(2);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].id).toBe(2);
  });
});
