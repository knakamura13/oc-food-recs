# Issue #180: source-backed featured-pick experiment

**Decision: defer production featured picks, scheduling and personalization. Reject the full inline card placement.** A compact evidence prompt is technically workable, but the owner reported no clear benefit over normal browsing. The experiment does not meet its continue criterion.

This completes the bounded test in [#180](https://github.com/knakamura13/oc-food-recs/issues/180). The [accepted experiment design](../plans/2026-10-05-featured-pick-experiment.md) considered the normal entry path, a full source card above the explorer, and a compact prompt opening the same source card. No production feature or data mutation is delivered.

## Evidence selection

Source baseline: `5a6a9d04171a171603be5992dab0ffa8345ed3ad`. A repeatable-read, read-only PostgreSQL capture used the current public predicates: non-excluded/not-likely-chain restaurant, published mention and thread included in publish, and primary role or names-restaurant not false. The candidate query required at least two distinct threads, three distinct source comments, and two explicitly named standalone source associations. Twenty candidates were retained by thread count, comment count, recency and slug; an independent subagent reviewed full source bodies before selecting a primary and one manual alternate.

An initial independently-classified-only query returned no candidates. A read-only distribution check confirmed all 1,135 active restaurant records had unknown chain confidence at capture. The prototype therefore uses the existing public eligibility policy and keeps ownership/chain uncertainty explicit; it does not reinterpret unknown as verified independent.

| Role | Existing restaurant record | Public source comments | Distinct threads | Selected mention | Original source | Comment date (UTC) |
|---|---|---:|---:|---:|---|---|
| Primary | `el-farolito` — El Farolito, Placentia | 5 | 4 | 830 | [t1_odji36e](https://www.reddit.com/r/Anaheim/comments/1s8tkfm/comment/odji36e/) | 2026-03-31 |
| Manual alternate | `sababa-falafel-shop` — Sababa Falafel Shop, Garden Grove | 7 | 3 | 985 | [t1_nopemtc](https://www.reddit.com/r/orangecounty/comments/1owc472/comment/nopemtc/) | 2025-11-13 |

Both selected excerpts are complete, short comment bodies with an explicit positive opinion naming only the selected restaurant and city. Exact body, date, comment/thread IDs and permalink were checked against the capture and the live public detail API. The original Reddit comments were also refreshed. The El Farolito source has a dissenting reply; neither the card nor this report treats source counts as unanimous approval. Other published associations can be bare venue suggestions or future interest, so counts are not counts of independently verified favorable reviews.

The primary was selected for clear attribution, not a new ranking policy. It was then observed to be the first result in the existing default explorer, while the alternate was fifth. This is evidence that the proposed entry point repeats a readily available choice. The experiment did not replace candidates after observing that duplication.

## Prototype boundary

A private Node.js loopback server forwards only anonymous public GET/HEAD requests to the current site and inserts the local presentation after explorer hydration. POST is rejected with 405; admin routes return 404. The actual explorer data, filters, ordering and map remain the comparison substrate. This is a presentation mock, not a production route/component or an operational rotation service.

The local comparison has three variants:

- **Baseline:** current public explorer with no featured presentation.
- **Full card:** original comment, editorial selection reason, source date/link, stable detail link and copy-link action above the explorer.
- **Compact prompt:** one prompt above the controls opens the same evidence in a native dialog, with Escape/close and focus return.

A separate local control page switches variants and manually alternates the two reviewed picks. Its experiment controls are outside the measured explorer window; raw-window measurements do not include that control page. Source and full-details links explicitly open a new tab. Copied links always use the stable public `/r/{slug}` URL, independent of the current pick. Clipboard rejection exposes a selected read-only URL for manual copying.

The card labels the quote as a historical community opinion. Opening status, current menu, prices and ownership are not verified. It makes no current deal, best-restaurant, or freshness claim based on the experiment selection date. No scheduling, personalization, ranking change or recurring infrastructure is built.

All real source bodies, API exports, preview code/data and screenshots remain local under ignored `output/issue-180/` and the task visualization directory, following CONTRIBUTING.md. The repository contains only the method, aggregates, source identifiers/links and decisions.

## Measured layout comparison

A delegated browser audit compared the same captured pick and unchanged explorer at four viewport sizes. Heights and positions below are CSS pixels. Desktop content height is the map/list region; phone behavior includes the existing short-screen document-scrolling mode, so arrival position/visible results are the meaningful comparison there.

| Viewport | Baseline content height | Full-card content height | Compact content height | Baseline search top | Full-card search top | Compact search top | Result names initially visible: baseline / full / compact |
|---|---:|---:|---:|---:|---:|---:|---|
| 1280x720 | 415.2 | 36.4 | 363.2 | 103.0 | 481.8 | 155.0 | 4 / 0 / 4 |
| 1440x900 | 595.2 | 216.4 | 543.2 | 103.0 | 481.8 | 155.0 | 5 / 2 / 5 |
| 390x844 | document/sticky layout | document/sticky layout | document/sticky layout | 130.1 | 699.2 | 182.1 | 3 / 0 / 3 |
| 320x568 | document/sticky layout | document/sticky layout | document/sticky layout | 147.6 | 757.2 | 199.6 | 1 / 0 / 1 |

At 1280×720 the full card consumes about 379 pixels of the locked desktop layout, leaving a 36-pixel content region and a zero-height list scroller: no restaurant row names are visible. At 1440×900 it reduces the content region from roughly 595 to 216 pixels. On 320×568, search starts at roughly 757 pixels, entirely below the arrival viewport. At 390×844, search starts near 699 pixels and no result names appear above the fold. This placement materially obstructs existing browsing and should not ship.

The compact prompt shifts search down 52 pixels (44 pixels of added hero height plus an 8-pixel gap on phones) and preserves the observed arrival result-name count at these four sizes. It avoids the full card's severe obstruction, but the cost and extra dialog step still need a demonstrated benefit. The primary repeats the already first-ranked restaurant; implementation feasibility alone is not sufficient reason to add it.

## Behavior and accessibility verification

The final delegated audit completed 12 layout comparisons, 16 checks of both picks' exact excerpt/date/source/detail/count, and eight keyboard dialog checks. Enter opens the native modal; Escape and the close button return focus to the trigger. At 320×568 the dialog scrolls internally, its historical caveat is reachable, and reverse Tab remains within the modal. Neither the comparison page nor the explorer has horizontal overflow at the tested sizes.

Manual alternate selection and stable-link copying passed for both restaurants. Simulated clipboard rejection produced a focused, fully selected, read-only fallback URL. The control page's keyboard switching and full-window alternate preservation passed separately. Proxy write/admin guards returned the expected 405/404. Ranking prefixes matched the baseline where rows were mounted; the zero-height inline list at 1280×720 mounted no rows, so that case is not standalone proof of ordering.

The browser run recorded zero application page errors and zero console errors. Twelve failed requests were exclusively aborted OpenStreetMap tiles during viewport/context changes; map tile readiness was not controlled. Ten screenshots were retained locally, with visual inspection of desktop/phone layouts and the scrolled phone dialog.

The enlargement check combined a 640×450 CSS viewport with root font size 200%. This is a reflow/text-enlargement simulation, not actual browser zoom. Fixed-pixel prototype fonts limit text-only enlargement coverage. No device-specific Safari testing or accessibility conformance claim is made.

## Usefulness and decision

Owner usefulness feedback on the concrete comparison was **no clear benefit over normal browsing**. This is one qualitative owner response, not a visitor study or a population estimate. No task-time, revisit-rate, sharing-rate or conversion improvement was measured.

| Issue gate | Evidence | Decision |
|---|---|---|
| Helps visitors start exploring or share a find | The mock provides source/detail/copy actions, but duplicates a highly visible existing result; owner feedback found no clear benefit. | Continue criterion not met. Defer production featured picks. |
| Preserves the existing explorer | Full card collapses the small desktop result area and pushes phone search/results down. Compact prompt has a smaller measured cost. | Reject full inline placement. Retain compact mock only as experiment evidence. |
| Source-backed and dated | Exact selected bodies, source dates, source links and public API inclusion checked; uncertainty and dissent remain visible. | Evidence presentation is viable, without current-menu/ownership claims. |
| Manual/slow experiment before automation | Two manually selected examples were compared; nothing runs on a schedule. | No scheduling, personalization or operational rollout justified. |

**Complete and close #180 as an experiment with a defer decision.** The retained mock and report are reviewable evidence, not a feature commitment. Revisit only if a specific visitor need or observed first-visit task demonstrates value over the existing source-ranked explorer. Any future trial should compare the same restaurants/evidence, counterbalance presentation order, measure finding another restaurant and source/share tasks, and distinguish selection date from source freshness. A prominent-card click count alone would not establish improved discovery.

## Evidence limits

- The loopback presentation uses the current public explorer, but is not integrated application code; production hydration/lifecycle and long-term operations were not evaluated.
- Source evidence comes from the ingested published corpus, which is not all Reddit discussion or proof of present-day quality/availability.
- The selected primary and alternate have unknown chain confidence; no ownership classification or branch/address repair was performed.
- Layout measurements and scripted actions establish behavior and costs, not visitor preference or improved retention.
- No real source exports, usernames, screenshots or exact Reddit comment text are committed. Production code, schema and data are unchanged. #155 granular work remains parked.
