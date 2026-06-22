import { describe, expect, it } from "vitest";
import { partitionExclusionQueue, type ReviewRestaurant } from "./admin";

const row = (overrides: Partial<ReviewRestaurant>): ReviewRestaurant => ({
  id: 1,
  name: "Test",
  slug: "test",
  location: null,
  lat: null,
  lng: null,
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

  it("routes duplicate_candidate rows out of the exclusion pending queue", () => {
    const rows = [
      row({ id: 1, exclusionReason: "llm_suspected_chain" }),
      row({ id: 2, exclusionReason: "duplicate_candidate" }),
    ];
    const { pendingReview } = partitionExclusionQueue(rows);
    expect(pendingReview).toHaveLength(1);
    expect(pendingReview[0].id).toBe(1);
  });
});
