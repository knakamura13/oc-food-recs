# Issue #178: bounded dish-discovery experiment

## Purpose and scope

Test whether source-backed dish results add value beyond #166 comment-text search. This is an experiment, not a production feature commitment. Kyle authorized taking #178 to completion and continued after the proposed comparison of current search with a locally reviewed result set.

## Approaches considered

1. **Reviewed comparison prototype (selected):** freeze three queries and the current top ten comment-search results for each; inspect attribution; show exact supporting excerpts, source dates, context links, and a clear menu-availability limitation. This exposes the evidence problem with no new search backend.
2. **Dish query shortcuts:** reuse general search with preset query links. Cheap, but preserves irrelevant dish-to-restaurant associations and does not establish improved usefulness.
3. **Automated extraction and dish pages:** potentially scales attribution, but needs an evaluation set and visitor validation first. Outside this experiment.

## Design

Use a local, self-contained HTML prototype with a dish selector and native radio controls to switch between the frozen current search results and reviewed evidence. Preserve original relative ranking and restaurant identities. Exclude unsupported recommendations only in the reviewed view; label context-supported recommendations explicitly. Each result has its original comment link, date, and restaurant detail link. Never describe a historical comment as a verified current menu item.

Use the OC Foods warm orange accent, restrained typography, and simple editorial result rows. Make controls usable by keyboard and on narrow phones. Keep source text, API exports, HTML and screenshots local, following CONTRIBUTING.md. Only the experiment method, aggregate findings, paraphrased decisions and source identifiers belong in git.

## Evidence and decision gates

Compare the captured production API order to the read-only database query before reviewing. Review exactly thirty restaurant/comment associations, not thirty independent recommendations. Inspect parent context for ambiguous attribution and separate explicit recommendations, context-supported recommendations, incidental dish text and historical consumption.

The reviewed view is a manual illustration, not an automated retrieval method. It cannot establish model precision, corpus recall, independent-rater agreement, or visitor usability. Continue to production only if accuracy, distinct value beyond general search, and visitor usability are demonstrated. Otherwise record a defer decision and finish the experiment.

## Verification and delivery

Check query and view switching, counts, sources, keyboard operation, console errors and horizontal overflow at 320, 390 and 1280 pixels. Inspect phone and desktop screenshots. Publish a text-only experiment report, review its source/metric consistency and privacy boundary, deliver through a PR, address review findings, merge when CI is green, and reconcile #178 with the decision. Production search and data remain outside the experiment's implementation scope.
