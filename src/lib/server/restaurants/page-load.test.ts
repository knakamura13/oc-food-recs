import { describe, expect, it } from "vitest";
import { REPEAT_AUTHOR_DECAY } from "$lib/restaurants/stores.svelte";
import { weightedAggregates } from "$lib/restaurants/stores.svelte";

/** SQL in +page.server.ts uses POWER(0.5, author_rank - 1); keep decay in sync. */
const SERVER_REPEAT_AUTHOR_DECAY = 0.5;

describe("+page.server ranking", () => {
  it("keeps repeat-author decay aligned with client-side recomputation", () => {
    expect(REPEAT_AUTHOR_DECAY).toBe(SERVER_REPEAT_AUTHOR_DECAY);
  });

  it("matches SQL geometric decay for duplicate authors", () => {
    const { aggregate_score, mention_count } = weightedAggregates([
      {
        thread_id: "t1",
        author: "alice",
        score: 10,
        role: "primary",
        comment_date: null,
      },
      {
        thread_id: "t1",
        author: "alice",
        score: 8,
        role: "endorsement",
        comment_date: null,
      },
      {
        thread_id: "t1",
        author: "bob",
        score: 4,
        role: "primary",
        comment_date: null,
      },
    ]);
    expect(aggregate_score).toBe(Math.round(10 + 8 * 0.5 + 4));
    expect(mention_count).toBe(2);
  });
});
