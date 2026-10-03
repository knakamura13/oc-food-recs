# Compact chain repair control trial

Base: merged #213, `7c435eb2225b4b21d8a1b7511993dba59f75c0c1`. Its complete repair-prompt budget correctly prevented overflow, but the current control recovery fell to 2/5 because prior output and repeated feedback crowded out useful source text.

The compact retry removes repeated quotes from the prior-entry summary and deduplicates feedback rules. Candidate selection prioritizes individually grounded entries, omits later duplicate buildings and nonoperating entries, then includes fixable venue-prefix entries. Numbered addresses missing a recognized street type are omitted rather than supplied with an invented type. At most six candidate address entries are selected. Multiple windows from one source merge into one contiguous span, retaining the intervening original text. Selection is a retrieval hint, not classification evidence.

Each selected quote must match a contiguous original source excerpt, allowing HTML whitespace normalization only. Its window includes up to 32 preceding and 220 following characters. A separate exact 100-character parent prefix preserves publisher context. Original source indices remain unchanged, including blank grounding slots for omitted sources. Windows, offsets and transmitted-text hashes are recorded. Fabricated quotes cannot become source text. Structured outputs with no qualifying windows skip repair.

The complete retry remains capped at 5,888 UTF-8 bytes, reserving the existing 2,048 output tokens and 256 system/framing tokens inside the configured 8,192-token context. The byte bound is deliberately conservative. Final grounding checks use only the transmitted window text. Because the repair bundle is selected and partial, repaired evidence cannot establish independence or completeness. Initial evaluation behavior is unchanged.

## Same-page five-control trial

The 2026-10-03 UTC trial reused the same automatically acquired 70 pages and source judgments as #212/#213. No per-business URLs, branch choices, database access, local models or acceptance-rule exceptions were added. Cached initial responses were reused. Hosted repair calls used `google/gemma-4-31b-it`, temperature 0, JSON output and reasoning disabled. At most one repair call was allowed per restaurant.

| Control | Final decision | Operating-address lower bound | Repair prompt bytes |
| --- | --- | --- | --- |
| Porto's | chain on initial attempt | 6 | no retry |
| Round Table Pizza | chain after one repair | 6 | 4,842 |
| Postino | chain after one repair | 6 | 4,882 |
| Sugarfish | chain on initial attempt | 10 | no retry |
| Texas de Brazil | chain after one repair | 6 | 5,054 |

Supported recovery is **5/5**, restored from merged #213's budget-safe 2/5. These counts are positive lower bounds, not exhaustive worldwide totals. Sugarfish still uses an automatically discovered third-party guide. This selected known-chain set does not estimate corpus recall or precision on unrelated businesses.

An earlier compact retry fit the budget but remained 2/5 because the model supplied address-only quotes without the city. The final instruction explicitly requires both address and city in the contiguous quote. The validator was not relaxed. Both trials remain preserved.

Private final artifacts in the primary checkout:
`output/chain-scorer/issue-200/compact-repair-final-20261003`.

SHA-256 values:

- `websites.json`: `4d61580063a31f13c1e1fda3790d2dda8e861ddb3539f09dba5d8b0e8385c7d1`
- `contexts.json`: `f76bb65cda1a5f185c047e76c4e3f079f26d5d9f322883548a29e31d37e5219f`
- `gemma-results.json`: `a0e02ce96f737ea555f8c6a4ce6e1c0ab100d3a5ae5b82bf85ffb09620a0db28`
- `results.json`: `8ebfb1b39d7a213595628539378e17ff02a6d5a1bb4d9e5f4a0fe3c6c948a802`

Validation: 268 Python tests passed. New regressions cover contiguous provenance, sparse source indices, complete prompt bounds, fabricated quote rejection, nonoperating-entry exclusion and selected-bundle negative-evidence abstention. Independent code review found no actionable defects.

Next: review and merge, then run the broader read-only evaluation with all 66 excluded controls, inspect five-to-seven-location boundary cases, and independently check the precision of newly supported classifications. Production exclusions remain gated. Measure repair frequency and latency during the broader run.
