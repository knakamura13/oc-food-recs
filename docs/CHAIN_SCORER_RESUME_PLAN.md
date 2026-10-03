# Issue #200 resume decision

Prepared October 2, 2026. The authorized 20-row calibration is complete; the full evaluation has not started.

## Verified saved workload

Scorer code is in the existing `knakamura/issue-200-chain-scorer` worktree and
draft PR #206. Evaluation artifacts live in the main checkout's ignored
`output/chain-scorer/issue-200/`, not in the scorer worktree.

- `pre-gemma-rows.json`: 1,214 rows, comprising 54 provisional chains and 1,160
  unknowns that enter the Gemma fallback.
- `contexts.json`: saved evidence bundles; JSON object keys must be converted
  back to integer restaurant IDs when calling `gemma_unresolved` directly.
- `models/gemma/`: 106 successful cached requests. Cache validity depends on the
  exact request hash; 106 cache files do not imply 106 current rows are complete.
- `gemma-results.json`: 40 saved row records; not final acceptance evidence.
- `results.jsonl`, `results.json` and `summary.json`: all absent.

## Model and timing

Use local Ollama `gemma4:31b`, `think: false`, JSON output, temperature 0,
`num_ctx: 8192`, `num_predict: 2048`, sequential requests and the existing model
cache. The comparison probe mode uses `num_predict: 160`. Jev remains pinned to
`typesafe/jev-1.13`; matching successful requests should reuse its cache.

Re-reading the 106 successful Gemma cache records gives 919.9 seconds total:
mean 8.68 seconds, median 5.41 seconds, maximum 51.88 seconds. At that mean,
1,160 fresh calls would take 2.8 hours. Allow 3–6 hours for planning because prompt
size, revised requests, model loading, retries and machine contention vary.
This is a forecast from saved measurements, not a completed full-run duration.

## Calibration completed October 2

The authorized sample used 20 fresh requests across source-bundle sizes, including
excluded-chain controls and a 17,041-character source bundle. Exact request-hash
checks found zero usable cache hits among the 1,160 current unknown rows before
calibration; the 106 older cache entries do not match these revised requests.

- 20/20 requests completed without request errors in 5.81 minutes.
- Mean 17.41 seconds, median 9.72, range
  7.31–78.07 seconds per request.
- Model loading accounted for 32.14 seconds across the sample. Excluding
  model-loading time, the mean was 15.80 seconds.
- 1,140 uncached rows remain. Extrapolating the sample gives
  5.51 hours including its loading overhead, or
  5.00 hours at the measured warm mean.
  **Plan 5–7 hours for inference**, with additional time for evidence reconciliation
  and the final acceptance report. This small, deliberately stratified sample is
  not a statistical confidence interval or a completed end-to-end measurement.
- Validated decisions: zero chain, zero independent, 20 unknown. Successful
  requests do not prove sufficient evidence or exclusion precision.

Raw calibration rows, exact requests, timings, manifest and summary remain in the
main checkout's ignored `output/chain-scorer/issue-200/calibration-20261002/`.
The runner is saved there as `calibrate.py`. It reads saved rows/contexts directly,
uses the existing exact-request model cache, and accesses no database. Prepared
rows and contexts remain untouched; calibration checkpoints are separate.

The full evaluation still needs the preconditions and acceptance checks below.

## Calibration procedure

After authorization to run inference, select 20 unknown rows spread across
current source-bundle sizes, including empty evidence, long bundles and excluded
controls. Use the existing `gemma_unresolved` function with those rows and saved
contexts, `Models(existing_output / 'models')`, and a separate ignored calibration
output directory. Never overwrite the prepared rows or contexts during calibration.

Use the scorer's exact bundle selection: at most eight sources, 5,000 characters
per source and a 20,000-character total source budget. Record row IDs, exact
request hashes, cache hits versus new calls, cold-start and total wall time,
per-request timing, errors/truncation and resulting decisions. Cache hits retain
historical `seconds`, so measure fresh wall time separately. If the selected
requests are all cached, choose fresh uncached rows before estimating throughput.

Recalculate the full ETA from uncached calls and the remaining workload. Continue
only after the full-run resume decision, using the same exact-request cache and
per-row checkpoints.

## Preconditions for the full evaluation

- Use the specified `prod-pre-154-20261001T035812Z.dump`, a Postgres 18 client,
  dedicated loopback database ending in `_scratch`, and SELECT-only role.
- Recover the existing pinned source-cache directory before rerunning the full
  cascade. The artifact directory and source-cache directory are distinct inputs;
  do not assume their paths are interchangeable.
- Do not load the production `.env`. Supply only an explicit scratch DSN.
- Verify the input dump checksum and compare all public-table fingerprints before
  and after evaluation. All output and real source evidence remain gitignored.

## Acceptance before #201 can use exclusion signals

- Produce a final row for every restaurant with `chain`, verified `independent`,
  or `unknown`, supporting signals and location counts.
- Report counts per decision/signal and recall against all 66 excluded controls.
- Compare against #199's F6 list, listing every disagreement and ambiguous alias.
- Audit five-to-seven-location cases, distinguishing current operating sites
  from closed/planned sites, duplicate branches and regional totals.
- Report the deferred Jev/Gemma comparison using the six-location worldwide rule.
  The current references contain 15 positive lower bounds and 47 unresolved cases,
  with no verified negatives; they cannot establish false-positive precision.
- Keep failed fetches, unsupported assertions and incomplete totals unknown.
  Independence requires an official complete worldwide total of five or fewer.
- Produce and inspect `results.jsonl`, `results.json` and `summary.json`, confirm
  database fingerprints are unchanged, and record per-signal precision limitations.
- Do not apply classifications to production as part of #200. #201's exclusion
  wiring requires its own precision assessment and validated scratch backfill.
