# Chain policy UI implementation plan

**Goal:** Deliver #202 and #203, then prepare #200 for an informed resume decision.

**Design:** Remove the public chain toggle and its state throughout the explorer.
The shared restaurant filter always rejects `likely_chain`, retaining independent
and unknown rows. Legacy `mompop` parameters are ignored and dropped from new
share URLs. Reports acknowledge receipt, retain status/reason on reclassification,
and accept refreshed confidence. Explicit exclusions still win.

**Architecture:** Reuse the shared filter for list, map, facet and recency
populations. Keep reporting as its existing database flag operation. Change only
the user-report branch of the Python classification merge; other pending reasons
keep their existing semantics. No schema change or data backfill is required.

**Tech stack:** Svelte 5, TypeScript, Vitest, Playwright and Python unittest.

## Execution

1. Add regressions for chain visibility through legacy state, retired URL
   parameters, missing toggle, both report acknowledgments and refreshed report
   confidence. Confirm failures against the original implementation.
2. Remove toggle state, help copy, analytics event, URL serialization and metadata
   branches. Make the shared visibility filter unconditional.
3. Update report acknowledgments and the user-report classification merge.
4. Verify a synthetic chain never renders through the explorer, and run the
   legacy-link browser check on desktop and phone without database mutations.
5. Run `npm test`, `npm run test:pipeline`, `npm run check`, `npm run build`, and
   `git diff --check`. Review the resulting diff against both issue briefs.
6. Record #200's saved workload, model settings, calibration proposal and final
   acceptance checklist in `docs/CHAIN_SCORER_RESUME_PLAN.md`.

## Validation completed

The original regressions failed for the expected behaviors before implementation.
After implementation, 312 Vitest tests and 159 pipeline tests passed; the two
browser checks passed on Mobile Chrome and Desktop Chrome. Svelte check reported
zero errors and warnings, and the production build succeeded.

The browser checks used the existing read-only QA connection. No production
classification, ingestion, exclusion, merge, or seed operation was executed.
