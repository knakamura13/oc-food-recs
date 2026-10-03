# Chain address context and bounded repair trial

Merged #212 (`e7c9afd42326f4aa622469d57084480ed75a5ac5`) automatically acquired useful source pages, but only one of five controls produced a supported classification. Locator windows sometimes began inside opening-hour text and lost the publisher name. Other model outputs included unrecognized street names, venue prefixes or repeated building addresses.

The change preserves a separate exact 200-character parent-page prefix beside each locator window. The prefix can support affiliation, but it cannot be joined to an address quote. The output records parent hashes, window offsets and prompt source indexes. Up to twelve source texts share the existing 20,000-character budget, including the parent prefixes. Truncated sources still cannot establish complete negative evidence.

A rejected chain output, or an unknown output with at least six locator-shaped sources, gets at most one repair attempt. Feedback identifies invalid entries, failed rules and duplicate pairs using the same address validator. The model must correct or omit those entries from the supplied source text. Both attempts are saved. Classification still requires the entire returned list to pass the existing six-entry grounding guard. Smaller diagnostic lists never establish evidence.

## Same-page control trial

The 2026-10-03 UTC trial reused the exact 70 pages acquired automatically for #212, including its one fetch error. No restaurant-specific URLs, branch selection or production data changes were added. Original public pages and source judgments were reused to isolate the context and repair changes. Hosted models were `typesafe/jev-1.13` for the original source judgments and `google/gemma-4-31b-it` for the fallback, with temperature 0, JSON output and reasoning disabled. Five initial fallback requests ran concurrently. Repair requests ran sequentially through the existing hosted cache adapter.

| Control | First attempt | Final result | Grounded operating-address lower bound |
| --- | --- | --- | --- |
| Porto's | supported chain | chain | 6 |
| Round Table Pizza | rejected list | chain after one repair | 8 |
| Postino | rejected duplicate building | chain after one repair | 9 |
| Sugarfish | supported chain | chain | 10 |
| Texas de Brazil | rejected street-address entries | chain after one repair | 6 |

Final supported recovery is **5/5**, compared with #212's 1/5. These are positive lower bounds, not complete worldwide totals. Sugarfish's support remains an automatically discovered third-party guide. This small known-chain set does not establish corpus recall or precision on unrelated businesses.

An initial context-only trial remained 1/5. Generic repair feedback improved that to 4/5. Detailed rule feedback recovered the remaining Texas de Brazil control. Those intermediate artifacts remain preserved. The final five-control results used the same code path for every control, with no business-specific exceptions.

Private artifacts in the primary checkout:
`output/chain-scorer/issue-200/address-repair-final-20261003`.

SHA-256 values:

- `websites.json`: `4d61580063a31f13c1e1fda3790d2dda8e861ddb3539f09dba5d8b0e8385c7d1` (identical to #212's final acquisition)
- `contexts.json`: `f76bb65cda1a5f185c047e76c4e3f079f26d5d9f322883548a29e31d37e5219f`
- `gemma-results.json`: `81b1344a98b76ce0eab43bb66e2ef7a321f69f4d9ca6966f4f1c7ca46f892aa0`
- `results.json`: `656b9380642e1de8f6a1d42e939dc542ad44393b204f9e6163205d352bd1ba6f`

Verification: 260 Python tests passed. The CI pipeline command passed 256 tests before the diagnostic wording refinement, which was then covered by the full suite. New checks cover parent provenance, shared context budgets, opening-hour boundaries, one successful repair, persistent-invalid repair abstention, duplicate feedback and diagnostic subthreshold evidence rejection. Independent review found no actionable defects or acceptance-rule changes.

Next: review the change, then perform the broader read-only evaluation with automatic acquisition and preserved row-level caches. Report recall against all 66 excluded controls, inspect boundary cases at five to seven locations, and independently check precision of newly supported classifications. Production exclusions remain gated on those checks. A repair may add one hosted request per eligible unresolved row, so measure its frequency and latency in the broader run.
