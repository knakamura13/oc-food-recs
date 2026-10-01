import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Hero from "./Hero.svelte";
import type { RestaurantData } from "$lib/restaurants/types";

const heroSource = readFileSync(
  join(process.cwd(), "src/lib/restaurants/components/Hero.svelte"),
  "utf8",
);

const thread = {
  id: "t1",
  title: "Best restaurants",
  url: "https://reddit.com/r/orangecounty/1",
  subreddit: "orangecounty",
  post_id: "abc",
  comment_count: 100,
  restaurant_count: 10,
};

const singleThreadMeta: RestaurantData["meta"] = {
  total_comments_processed: 1234,
  newest_comment_date: null,
  source_threads: [thread],
};

describe("Hero", () => {
  it("renders the page heading and a single-thread summary", () => {
    render(Hero, { meta: singleThreadMeta });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /best mom & pop restaurants in orange county/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one reddit thread and 1,234 community comments/i),
    ).toBeInTheDocument();
  });

  it("mentions multiple threads and subreddits in the summary", () => {
    render(Hero, {
      meta: {
        total_comments_processed: 5000,
        newest_comment_date: null,
        source_threads: [
          thread,
          { ...thread, id: "t2", subreddit: "food" },
        ],
      },
    });

    expect(
      screen.getByText(
        /2 reddit threads across 2 subreddits and 5,000 community comments/i,
      ),
    ).toBeInTheDocument();
  });

  it("shows how recent the newest comment is, and omits it when unknown", () => {
    const { unmount } = render(Hero, {
      meta: { ...singleThreadMeta, newest_comment_date: "2026-06-08T23:18:08.220Z" },
    });
    expect(screen.getByText(/comments through jun 2026\./i)).toBeInTheDocument();
    unmount();

    render(Hero, { meta: singleThreadMeta });
    expect(screen.queryByText(/comments through/i)).not.toBeInTheDocument();
  });

  it("lets the mobile summary wrap instead of clamping mid-sentence", () => {
    expect(heroSource).not.toMatch(/-webkit-line-clamp\s*:/);
    expect(heroSource).not.toMatch(/(?<![-a-z])line-clamp\s*:/);
  });
});
