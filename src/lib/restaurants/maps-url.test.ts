import { describe, expect, it } from "vitest";
import { googleMapsUrl } from "./maps-url";
import { makeRestaurant } from "./test-utils";

describe("googleMapsUrl", () => {
  it("links to coordinates when the restaurant is mapped", () => {
    const url = googleMapsUrl(
      makeRestaurant({ name: "Toast", lat: 33.6846, lng: -117.8265 }),
    );
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=33.6846,-117.8265",
    );
  });

  it("treats a 0 coordinate as present", () => {
    expect(googleMapsUrl(makeRestaurant({ lat: 0, lng: 0 }))).toContain(
      "destination=0,0",
    );
  });

  it("falls back to a name + city search when unmapped", () => {
    const url = googleMapsUrl(
      makeRestaurant({ name: "Pho & Co", location: "Costa Mesa", lat: null, lng: null }),
    );
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Pho%20%26%20Co%20Costa%20Mesa%20CA",
    );
  });

  it("falls back to Orange County when unmapped with no city", () => {
    const url = googleMapsUrl(makeRestaurant({ name: "Pho", location: null, lat: null, lng: null }));
    expect(decodeURIComponent(url)).toContain("Pho Orange County CA");
  });

  it("falls back when only one coordinate is present", () => {
    expect(googleMapsUrl(makeRestaurant({ lat: 33.6, lng: null }))).toContain("/maps/search/");
  });
});
