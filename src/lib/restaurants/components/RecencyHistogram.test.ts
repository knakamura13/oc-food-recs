import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import RecencyHistogram from "./RecencyHistogram.svelte";
import { resetAppState } from "$lib/restaurants/test-utils";
import type { ListMention } from "$lib/restaurants/types";

const histogramSource = readFileSync(
  join(process.cwd(), "src/lib/restaurants/components/RecencyHistogram.svelte"),
  "utf8",
);

const mentions: ListMention[] = [
  {
    comment_date: "2024-08-01T00:00:00Z",
    thread_id: "thread-1",
    score: 5,
    author: "alice",
    role: "primary",
  },
];

const dateExtent = {
  min: Date.parse("2017-02-01T00:00:00Z"),
  max: Date.parse("2026-06-01T00:00:00Z"),
};

describe("RecencyHistogram", () => {
  beforeEach(() => {
    resetAppState();
  });

  it("renders the cutoff slider and Reset control", () => {
    render(RecencyHistogram, { mentions, extent: dateExtent });
    expect(
      screen.getByRole("slider", { name: /show comments no older than/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reset$/i })).toBeDisabled();
  });

  it("shrinks the chart inside a clamped flex panel instead of scrolling Reset away", () => {
    expect(histogramSource).toContain("flex-direction: column");
    expect(histogramSource).toContain("min-height: 64px");
    expect(histogramSource).toContain("max-height: 110px");
    expect(histogramSource).toContain("position: sticky");
    expect(histogramSource).toContain(".reset:focus-visible");
  });
});
