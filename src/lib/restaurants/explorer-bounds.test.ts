import { describe, expect, it } from "vitest";
import { coordsForFitBounds, restaurantsInBounds } from "./explorer-bounds";

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

import { fitCorners } from "./explorer-bounds";

describe("fitCorners", () => {
  it("returns null with no points", () => {
    expect(fitCorners([])).toBeNull();
  });

  it("fits every point of a small set", () => {
    expect(fitCorners([{ lat: 33.7, lng: -117.8 }, { lat: 34.05, lng: -118.25 }])).toEqual([
      [33.7, -118.25],
      [34.05, -117.8],
    ]);
  });

  it("ignores far-away stragglers in a large set", () => {
    const oc = Array.from({ length: 200 }, (_, i) => ({
      lat: 33.6 + (i % 20) * 0.01,
      lng: -117.9 + (i % 10) * 0.01,
    }));
    const withOutliers = [...oc, { lat: 34.05, lng: -118.25 }, { lat: 33.95, lng: -117.4 }, { lat: 32.7, lng: -117.16 }];
    const [[south, west], [north, east]] = fitCorners(withOutliers)!;
    expect(south).toBeGreaterThanOrEqual(33.6);
    expect(north).toBeLessThanOrEqual(33.8);
    expect(west).toBeGreaterThanOrEqual(-117.9);
    expect(east).toBeLessThanOrEqual(-117.8);
  });
});

describe("restaurantsInBounds", () => {
  const bounds = { south: 33.6, west: -118, north: 33.9, east: -117.7 };
  const inside = { slug: "in", lat: 33.7, lng: -117.8 };
  const outside = { slug: "out", lat: 34.2, lng: -117.8 };
  const unmapped = { slug: "none", lat: null, lng: null };

  it("keeps restaurants inside the area and drops the rest", () => {
    expect(restaurantsInBounds([inside, outside], bounds)).toEqual([inside]);
  });

  it("treats the edges as inside", () => {
    const edge = { slug: "edge", lat: 33.6, lng: -117.7 };
    expect(restaurantsInBounds([edge], bounds)).toEqual([edge]);
  });

  it("drops unmapped restaurants unless asked to keep them", () => {
    expect(restaurantsInBounds([inside, unmapped], bounds)).toEqual([inside]);
    expect(restaurantsInBounds([inside, unmapped], bounds, { keepUnmapped: true })).toEqual([inside, unmapped]);
  });
});
