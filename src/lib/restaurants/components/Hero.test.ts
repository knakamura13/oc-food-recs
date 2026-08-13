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
    expect(
      screen.getByRole("link", { name: /railway/i }),
    ).toHaveAttribute("href", expect.stringContaining("railway.com"));
  });

  it("mentions multiple threads and subreddits in the summary", () => {
    render(Hero, {
      meta: {
        total_comments_processed: 5000,
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

  it("gives hero links pressed feedback without changing the Railway href", () => {
    render(Hero, { meta: singleThreadMeta });
    expect(screen.getByRole("link", { name: /railway/i })).toHaveAttribute(
      "href",
      expect.stringContaining("railway.com"),
    );
    expect(heroSource).toMatch(/a:active\s*\{/);
    expect(heroSource).toMatch(/\.attribution a:active\s*\{/);
    expect(heroSource).toContain("#fff0eb");
    expect(heroSource).toContain("#c43700");
    expect(heroSource).toMatch(
      /@media \(max-width: 1023px\)[\s\S]*\.attribution \{[\s\S]*display: none/,
    );
  });
});
