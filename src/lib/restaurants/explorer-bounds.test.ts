import { describe, expect, it } from "vitest";
import { coordsForFitBounds } from "./explorer-bounds";

describe("coordsForFitBounds", () => {
  it("uses the visible/filtered set, not hidden likely_chain rows", () => {
    const visible = [
      { lat: 33.7, lng: -117.8 },
      { lat: 33.8, lng: -117.9 },
    ];
    const withHiddenChain = [
      ...visible,
      { lat: 34.0, lng: -118.2 },
    ];
    expect(coordsForFitBounds(visible)).toEqual([
      { lat: 33.7, lng: -117.8 },
      { lat: 33.8, lng: -117.9 },
    ]);
    expect(coordsForFitBounds(withHiddenChain)).not.toEqual(
      coordsForFitBounds(visible),
    );
  });

  it("drops unmapped rows", () => {
    expect(
      coordsForFitBounds([
        { lat: 33.7, lng: -117.8 },
        { lat: null, lng: null },
      ]),
    ).toEqual([{ lat: 33.7, lng: -117.8 }]);
  });
});
