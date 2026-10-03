# Reproducible source retrieval implementation plan

Goal: acquire candidate publisher sites and operating branch pages without per-control URL selection, retaining the scorer's read-only and unknown boundaries.

D1: Use an opt-in cached public search RSS lookup for each name/city. Retain response and query provenance. At most three new domains are retrieval hints, never verified affiliation. Preserve local matches ahead of new domains. Search failures leave existing hints available.

D2: Crawl public same-publisher HTML links to depth two with at most twelve retained pages per actual publisher and twelve requests per requested domain. Inspect a publisher sitemap and at most two same-publisher child sitemaps. Cache successes and failures. Learn redirect aliases before admitting another URL from that requested domain. Strip only known analytics query parameters. Keep page and sitemap limits and actual counts in output metadata. A previously unseen alias may require a request before its publisher is known. No browser execution or local models.

D3: Extract contiguous address/hour windows from fetched text when a locator exposes at least six address blocks. Preserve original text, URL and offsets; mark excerpts truncated. Divide the existing 20,000-character prompt budget among up to eight chosen sources so six long branch pages fit. Any prompt truncation prevents complete negative evidence.

Implementation and validation:

1. Add failing tests for public lookup parsing, invalid hints, same-site limits, six-branch acquisition, contiguous excerpt provenance, shared prompt budgets and truncated completeness.
2. Implement retrieval helpers and the opt-in evaluator flag. Keep existing default acquisition unchanged except for improved text/link extraction with an explicit cache-version bump.
3. Run Python tests, then acquire and evaluate the five known-chain controls from their saved original directory hints without manually adding domains or branch URLs. Report automatic results separately from the earlier manually curated results.
4. Review and ship a focused PR. Full-corpus evaluation and independent precision validation follow after the acquisition method is reviewed. Production exclusions remain gated.

The public RSS endpoint is not a guaranteed API contract. Cache its raw response, reject malformed or oversized responses, and preserve explicit errors rather than treating failed lookup as evidence of independence.

## Five-control automatic trial

Base: `0711292f28c1fa2be46575498c44376fc6cfee53` (merged #211). Trial date: 2026-10-03 UTC. Input: the same five controls' saved directory hints from `fresh-20261003/evaluation-openrouter/pre-gemma-rows.json`. No business-specific domains or branch URLs were added to the trial. This is a targeted acquisition experiment, not a corpus recall measurement.

The final trial acquired 70 pages with one fetch error. It used cached hosted `typesafe/jev-1.13` judgments and `google/gemma-4-31b-it` with temperature 0, JSON output, reasoning disabled and five concurrent fallback requests. Neither local models nor a database were accessed by the trial runner. Successful caches were reused across three preserved trial directories.

| Control | Final scorer result | Remaining limitation |
| --- | --- | --- |
| Porto's | unknown | Model abstained despite locator address windows. |
| Round Table Pizza | unknown | Model supplied eight entries, including shopping-center addresses without a recognized street type. The complete list failed grounding. |
| Postino | unknown | Model supplied eight entries but counted Arcadia and B-Side at the same normalized building address. Duplicate guard rejected the list. |
| Sugarfish | chain | Nine grounded addresses from an automatically discovered third-party guide, not official branch pages. |
| Texas de Brazil | unknown | Model included mall or venue prefixes in the address field. The numbered-street validator rejected the list. Search returned no accepted URLs, so acquisition used preserved directory hints. |

Automatic supported recovery is **1/5**, versus the earlier manually selected 5/5 experiment. The three model `chain` outputs rejected by grounding are not supported classifications. Do not relax identity, duplicate or street-address guards to improve this number. The next experiment should improve source context and structured address extraction, then repeat these controls before spending on a full-corpus rerun. Production exclusions remain gated.

Private artifacts are under `output/chain-scorer/issue-200/automatic-final-20261003` in the primary checkout. Public-page bodies and model responses remain outside Git. Earlier trials remain under `automatic-20261003` and `automatic-filtered-20261003`.

Final artifact SHA-256 values:

- `source-lookups.json`: `0c7c489fb9dc7bf6ab8bc868e5dcd9b6af40f39b93fca6d23c5c395e3623a242`
- `websites.json`: `4d61580063a31f13c1e1fda3790d2dda8e861ddb3539f09dba5d8b0e8385c7d1`
- `gemma-results.json`: `b3bb23f41f722db0b8a8dab778d9706c60b561ce43c2563ce5befcb6a3c5d326`
- `results.json`: `9e1f10b67dfc2a4b8dbb070b996dd541c6afdbeb454e2526ee8d511ac3ff9e31`

Verification: 254 Python tests passed, including eleven retrieval/context tests. Independent code review identified redirect-alias budget accounting, which was fixed and covered by a regression test. The follow-up review found no remaining actionable defects.
