import { describe, expect, it } from "vitest";
import { getTrimmedSnippet } from "./snippet";
import { pickTopCommentSnippet } from "./top-comment-snippet";

const dolansRoundup =
  "Middle Eastern- Forn Al Hara in Anaheim’s Little Arabia\n\nAfrican- Absynnia Restaurant(Ethiopian cuisine)in Anaheim\n\nPersian- Irvine Grill in Irvine(best is Raffis place in Glendale)\n\nMexican- shoot there’s so many haha\n\nUyghur- Dolans Cuisine in Irvine ( very very unique and the only Uyghur restaurant I know of in OC )";

const mapsLink =
  "[https://maps.app.goo.gl/uEWVWp3L8wXEnSH76?g_st=ic](https://maps.app.goo.gl/uEWVWp3L8wXEnSH76?g_st=ic)\n\nThis place is very authentic Muslim Chinese food. A little different than Uygar cuisine, I love this place.";

describe("pickTopCommentSnippet", () => {
  it("prefers a name-matching roundup over a higher-scoring Maps link with no restaurant name", () => {
    const snippet = pickTopCommentSnippet("Dolans Cuisine", [
      { body: mapsLink, score: 99, classification: "endorsement" },
      { body: dolansRoundup, score: 28, classification: null },
    ]);

    expect(snippet).toBe(dolansRoundup);
    const trimmed = getTrimmedSnippet(snippet!, "Dolans Cuisine", 150);
    expect(trimmed.text).toBe(
      "Uyghur- Dolans Cuisine in Irvine ( very very unique and the only Uyghur restaurant I know of in OC )",
    );
  });

  it("skips filler and question comments even when they name the restaurant and score highest", () => {
    const snippet = pickTopCommentSnippet("Dolans Cuisine", [
      {
        body: "Thanks, Dolans Cuisine is noted",
        score: 50,
        classification: "filler",
      },
      {
        body: "Is Dolans Cuisine any good?",
        score: 40,
        classification: "question",
      },
      { body: dolansRoundup, score: 28, classification: null },
    ]);

    expect(snippet).toBe(dolansRoundup);
  });

  it("falls back to the highest-scoring eligible body when none name the restaurant", () => {
    const snippet = pickTopCommentSnippet("Dolans Cuisine", [
      { body: "seconded", score: 5, classification: "endorsement" },
      { body: mapsLink, score: 12, classification: "endorsement" },
      { body: "   ", score: 80, classification: null },
    ]);

    expect(snippet).toBe(mapsLink);
  });

  it("returns null when every mention is empty, filler, or a question", () => {
    const snippet = pickTopCommentSnippet("Dolans Cuisine", [
      { body: "", score: 10, classification: null },
      { body: "lol", score: 8, classification: "filler" },
      { body: "anyone been?", score: 7, classification: "question" },
    ]);

    expect(snippet).toBeNull();
  });
});
