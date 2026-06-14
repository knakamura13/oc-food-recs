/**
 * Mirror Python `normalize_name` (scripts/reddit_pipeline.py) for client-side search
 * and server-side exclusion registry matching.
 * Order matters: lowercase+trim -> fold accents -> strip trailing possessive -> & -> "and"
 * -> drop all non-alphanumerics.
 */
export function normalizeSearchText(text: string): string {
  let s = text.toLowerCase().trim();
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/['\u2019]s$/, "");
  s = s.replace(/\s*&\s*/g, " and ");
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}
