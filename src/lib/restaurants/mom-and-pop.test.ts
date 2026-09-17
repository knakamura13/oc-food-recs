import { describe, expect, it } from "vitest";
import {
  MOM_AND_POP_HELP,
  passesMomAndPopFilter,
  type ChainConfidence,
} from "./mom-and-pop";

function spot(confidence: ChainConfidence, slug = "spot") {
  return { slug, chain_confidence: confidence };
}

describe("passesMomAndPopFilter", () => {
  it("lets independent and unknown spots through", () => {
    expect(passesMomAndPopFilter(spot("independent"))).toBe(true);
    expect(passesMomAndPopFilter(spot("unknown"))).toBe(true);
    expect(passesMomAndPopFilter({ slug: "legacy" })).toBe(true);
  });

  it("hides likely_chain spots", () => {
    expect(passesMomAndPopFilter(spot("likely_chain", "in-n-out"))).toBe(false);
  });

	it("does not hide independent spots queued from a public report", () => {
    expect(passesMomAndPopFilter(spot("independent", "habit"))).toBe(true);
  });

  it("keeps the locked site copy", () => {
    expect(MOM_AND_POP_HELP).toBe(
      "No franchises or big chains — independent spots with up to three locations still count.",
    );
  });
});
