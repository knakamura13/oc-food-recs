import { describe, expect, it } from "vitest";
import {
  getTrimmedSnippet,
  findRestaurantMatch,
  buildSegments,
} from "./snippet";

describe("snippet utility", () => {
  describe("findRestaurantMatch", () => {
    it("finds exact matches case-insensitively", () => {
      const body = "I really love El Farolito for dinner.";
      const match = findRestaurantMatch(body, "El Farolito");
      expect(match).not.toBeNull();
      expect(body.substring(match!.index, match!.index + match!.length)).toBe(
        "El Farolito",
      );
    });

    it("finds matches with lowercase/uppercase differences", () => {
      const body = "Try el farolito for some great tacos.";
      const match = findRestaurantMatch(body, "El Farolito");
      expect(match).not.toBeNull();
      expect(body.substring(match!.index, match!.index + match!.length)).toBe(
        "el farolito",
      );
    });

    it("handles possessive forms", () => {
      const body = "We went to El Farolito's last night.";
      const match = findRestaurantMatch(body, "El Farolito");
      expect(match).not.toBeNull();
      expect(body.substring(match!.index, match!.index + match!.length)).toBe(
        "El Farolito's",
      );
    });

    it("handles plural forms", () => {
      const body = "There are two Taco Locos nearby.";
      const match = findRestaurantMatch(body, "Taco Loco");
      expect(match).not.toBeNull();
      expect(body.substring(match!.index, match!.index + match!.length)).toBe(
        "Taco Locos",
      );
    });

    it("handles fuzzy keyword matching for missing names", () => {
      // The Vox Kitchen is the restaurantName, but the comment only says "Vox Kitchen"
      const body = "Highly recommend Vox Kitchen for their beef.";
      const match = findRestaurantMatch(body, "The Vox Kitchen");
      expect(match).not.toBeNull();
      expect(body.substring(match!.index, match!.index + match!.length)).toBe(
        "Vox Kitchen",
      );
    });

    it("handles unique keyword fallback (e.g. only matching 'vox')", () => {
      const body = "You have to go to Vox.";
      const match = findRestaurantMatch(body, "The Vox Kitchen");
      expect(match).not.toBeNull();
      expect(body.substring(match!.index, match!.index + match!.length)).toBe(
        "Vox",
      );
    });

    it("handles ultimate fallback to longest word", () => {
      // "Sari" is in keywords, but let's test if we have only generic/short words
      const body = "I love taco express on the corner.";
      const match = findRestaurantMatch(body, "Taco Express");
      expect(match).not.toBeNull();
      expect(body.substring(match!.index, match!.index + match!.length)).toBe(
        "taco express",
      );
    });
  });

  describe("buildSegments", () => {
    it("creates segments correctly with no match", () => {
      const segments = buildSegments("Hello World", -1, 0);
      expect(segments).toEqual([{ text: "Hello World", isMatch: false }]);
    });

    it("splits segments when match is in the middle", () => {
      const segments = buildSegments("I love tacos indeed", 7, 5);
      expect(segments).toEqual([
        { text: "I love ", isMatch: false },
        { text: "tacos", isMatch: true },
        { text: " indeed", isMatch: false },
      ]);
    });

    it("splits segments when match is at the start", () => {
      const segments = buildSegments("Tacos are great", 0, 5);
      expect(segments).toEqual([
        { text: "Tacos", isMatch: true },
        { text: " are great", isMatch: false },
      ]);
    });

    it("splits segments when match is at the end", () => {
      const segments = buildSegments("Highly recommend Tacos", 17, 5);
      expect(segments).toEqual([
        { text: "Highly recommend ", isMatch: false },
        { text: "Tacos", isMatch: true },
      ]);
    });
  });

  describe("getTrimmedSnippet", () => {
    it("returns empty snippet for empty inputs", () => {
      const result = getTrimmedSnippet("", "El Farolito");
      expect(result).toEqual({ text: "", segments: [] });
    });

    it("returns exact text if comment is short and contains match", () => {
      const body = "I love El Farolito!";
      const result = getTrimmedSnippet(body, "El Farolito");
      expect(result.text).toBe("I love El Farolito!");
      expect(result.segments).toEqual([
        { text: "I love ", isMatch: false },
        { text: "El Farolito", isMatch: true },
        { text: "!", isMatch: false },
      ]);
    });

    it("keeps neighboring same-line sentences when they fit", () => {
      const body =
        "First sentence here. Second sentence has El Farolito. Third sentence here. Fourth sentence is long.";
      const result = getTrimmedSnippet(body, "El Farolito", 200);
      expect(result.text).toBe(
        "First sentence here. Second sentence has El Farolito. Third sentence here.",
      );
    });

    it("keeps the matched restaurant name fully visible even if truncation is needed", () => {
      const body =
        "This is a super long prefix sentence to bloat the character count. ".repeat(
          3,
        ) +
        "But then we have El Farolito. " +
        "And this is a super long suffix sentence to bloat the character count. ".repeat(
          3,
        );

      const result = getTrimmedSnippet(body, "El Farolito", 100);

      // Match should be present and visible
      expect(result.text).toContain("El Farolito");
      expect(result.text.length).toBeLessThanOrEqual(100 + 6); // capped plus ellipses budget

      // The match itself must be bolded
      const matchedSegment = result.segments.find((s) => s.isMatch);
      expect(matchedSegment).toBeDefined();
      expect(matchedSegment!.text).toBe("El Farolito");
    });

    it("uses first 3 sentences as fallback if no match is found", () => {
      const body =
        "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const result = getTrimmedSnippet(body, "Nonexistent Restaurant", 150);
      expect(result.text).toContain("First sentence.");
      expect(result.text).toContain("Third sentence.");
      expect(result.text).not.toContain("Fourth sentence.");
      expect(result.segments).toEqual([{ text: result.text, isMatch: false }]);
    });

    it("crops the prefix of an oversized fragment so the rest of the sentence is kept", () => {
      const body =
        "Before the name there is a long setup that should be dropped El Farolito is the place I keep going back to for the salsa and the late night tacos.";
      const result = getTrimmedSnippet(body, "El Farolito", 80);
      expect(result.text).toContain("El Farolito");
      expect(result.text.startsWith("...")).toBe(true);
      expect(result.text.endsWith("tacos.")).toBe(true);
      expect(result.text).not.toContain("Before the name");
    });

    it("isolates the newline-bounded fragment that names the restaurant", () => {
      const body =
        "Middle Eastern- Forn Al Hara in Anaheim’s Little Arabia\n\nAfrican- Absynnia Restaurant(Ethiopian cuisine)in Anaheim\n\nPersian- Irvine Grill in Irvine(best is Raffis place in Glendale)\n\nMexican- shoot there’s so many haha\n\nUyghur- Dolans Cuisine in Irvine ( very very unique and the only Uyghur restaurant I know of in OC )";
      const result = getTrimmedSnippet(body, "Dolans Cuisine", 150);
      expect(result.text).toBe(
        "Uyghur- Dolans Cuisine in Irvine ( very very unique and the only Uyghur restaurant I know of in OC )",
      );
    });

    it("includes same-line previous and next fragments when they fit", () => {
      const body =
        "6 year old me? McDonalds 12 year old me? Del Taco 18 year old me? Elephant Bar 21 year old me? Yard House";
      const result = getTrimmedSnippet(body, "Del Taco", 150);
      expect(result.text).toBe(
        "McDonalds 12 year old me? Del Taco 18 year old me? Elephant Bar 21 year old me?",
      );
    });

    it("skips same-line neighbors that would exceed maxLen", () => {
      const body =
        "6 year old me? McDonalds 12 year old me? Del Taco 18 year old me? Elephant Bar 21 year old me? Yard House";
      const result = getTrimmedSnippet(body, "Del Taco", 30);
      expect(result.text).toBe("Del Taco 18 year old me?");
    });
  });
});
