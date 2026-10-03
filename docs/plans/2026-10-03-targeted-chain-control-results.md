# Targeted chain-control retrieval results

Five known-chain controls that were unknown in the post-#210 evaluation now produce supported `chain` decisions, each from six distinct operating address quotes. This is a manually assisted source-retrieval experiment, not automatic discovery or a full-corpus evaluation. It does not establish precision, a general false-positive rate, or authorization for production exclusions.

| ID | Control | Source correction |
| --- | --- | --- |
| 13 | Porto's, Buena Park | Replace unrelated domains with the official bakery locator. Select six contiguous address/hour excerpts so interleaved job-fair headings cannot be joined into invented quotes. |
| 261 | Round Table, Fullerton | Match the official ordering page to 2506 East Chapman Avenue. Use six official fundraising branch pages, including that Fullerton branch, instead of unrelated pub matches or a long aggregate count phrase. |
| 571 | Postino, Irvine | Match Park Place to 2981 Michelson Drive and collect six operating branch pages instead of the locator's loading shell. |
| 717 | Sugarfish | Collect six official branch-detail pages with addresses and hours instead of counting city navigation labels. |
| 1381 | Texas de Brazil | Collect six official operating branch pages. Preserve the legitimate Addison Road and Briarwood Circle addresses; omit planned locations and inferred totals. |

## Bounded method

The implementation is based on main `c3fb3d9` after PR #210, plus the address-validation and prompt changes accompanying this report. The selected input consists of five saved scratch rows and 26 public pages. The model receives six Porto's locator excerpts; six Postino branch pages; six Sugarfish branch pages; six Texas de Brazil branch pages; and six Round Table fundraising branch pages plus its local ordering page. Texas de Brazil pages use their first 2,000 characters to fit six addresses and operating hours within the existing prompt budget. Full fetched text and excerpt provenance are retained separately, and all excerpts are marked truncated. Lists never establish a complete worldwide total.

Corrected URLs are explicit manual inputs. Neither generic-name identity nor missing operating fields are automatically accepted. Directory evidence remains unverified. This work does not make the production retriever discover these URLs automatically.

Private artifacts are stored under the existing issue-200 output directory in `targeted-20261003`: `websites.json`, `run_targeted.py`, and `evaluation-final/{source-selection,full-contexts,contexts,pre-gemma-rows,gemma-results,results,summary,code-fingerprints}.json`. Earlier evaluation iterations are retained separately. The final application reused exact cached hosted responses, made no new model requests, and accessed no database. Acquisition and earlier evaluation iterations used hosted requests only.

## Fixes and validation

The address validator accepts Broadway and Circle/Cir, normalizes Circle aliases for deduplication, and preserves a city-named road when suffix cleanup mistakes a street abbreviation for a state. That restoration is limited to street abbreviations that are not US state codes, so `CT` cannot supply an otherwise missing street type. The prompt explicitly requires an operating boolean and contiguous address/city quotes. Source containment, current-operation checks, duplicate rejection, and incomplete-total rules remain enforced.

Both address regressions failed before their fixes. All 241 Python tests pass, including altered-word rejection, duplicate Circle/Cir and full-address aliases, non-address rejection, and rejection of a state-only street-type match. The final bounded result is five chains and zero model errors. The original 1,214-row input SHA-256 remains `600bfe0edceacfab3d5de605762c95afdca5d900aa42ce550a5e8d784bd30fff`.

Next: review these fixes, then make official-source and branch-page acquisition reproducible without per-control curation. Keep production exclusion integration gated until a fresh corpus evaluation and independent precision checks support it.
