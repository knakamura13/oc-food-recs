/**
 * Mirror Python `normalize_name` (scripts/reddit_pipeline.py) for client-side search
 * and server-side exclusion registry matching.
 * Order matters: lowercase+trim -> fold accents -> possessive/plural variants -> & -> "and"
 * -> drop all non-alphanumerics.
 */

/** Strip possessive 's and conservative plural s (consonant + s only). */
function stripNameVariants(text: string): string {
  let s = text.replace(/['\u2019]s\b/g, "");
  s = s
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.length >= 2 && word.endsWith("s") && !"aeiou".includes(word.at(-2)!)
        ? word.slice(0, -1)
        : word,
    )
    .join(" ");
  return s;
}

export function normalizeSearchText(text: string): string {
  let s = text.toLowerCase().trim();
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = stripNameVariants(s);
  s = s.replace(/\s*&\s*/g, " and ");
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}
