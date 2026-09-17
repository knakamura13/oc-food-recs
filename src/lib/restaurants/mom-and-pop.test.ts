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

  it("hides locally reported chain slugs even if still independent in payload", () => {
    expect(
      passesMomAndPopFilter(spot("independent", "habit"), ["habit"]),
    ).toBe(false);
    expect(
      passesMomAndPopFilter(spot("independent", "habit"), ["other"]),
    ).toBe(true);
  });

  it("keeps the locked site copy", () => {
    expect(MOM_AND_POP_HELP).toBe(
      "No franchises or big chains — independent spots with up to three locations still count.",
    );
  });
});
