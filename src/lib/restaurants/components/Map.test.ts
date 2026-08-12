import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mapSource = readFileSync(
  join(process.cwd(), "src/lib/restaurants/components/Map.svelte"),
  "utf8",
);

describe("Map marker sync debounce", () => {
  it("debounces mapped-restaurant syncMarkers with the shared search delay", () => {
    expect(mapSource).toContain(
      "import { SEARCH_DEBOUNCE_MS, scheduleDebounced } from '$lib/debounce'",
    );
    expect(mapSource).toMatch(
      /void mappedRestaurants[\s\S]*scheduleDebounced\(\(\) => \{[\s\S]*syncMarkers\(\)[\s\S]*\}, SEARCH_DEBOUNCE_MS\)/,
    );
    const effectIdx = mapSource.indexOf("void mappedRestaurants");
    const immediateIdx = mapSource.indexOf(
      "if (leafletMap && L) {\n\t\t\tuntrack(() => syncMarkers());",
    );
    expect(effectIdx).toBeGreaterThan(-1);
    expect(immediateIdx).toBe(-1);
  });
});
