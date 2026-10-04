# Confidence provenance implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish #199 D2 without treating identity or visibility overrides as worldwide independence evidence.

**Architecture:** Admin merge/restore operations assign `unknown`, rather than manufacturing an `independent` decision. Rename invalidates confidence bound to the former identity. Keep `reviewed_at` protections and the ordinary ingest/backfill guard unchanged. Correct only the fifteen historically identified active merge/rename locks through a private, explicitly guarded maintenance transaction after a fresh preview and full backup. An evidence-backed independent decision must not enter the repair set.

**Tech Stack:** SvelteKit/TypeScript, Vitest admin mutation tests, Python/psycopg private maintenance scripts, PostgreSQL backup client.

The user approved this continuation after #221 identified the remaining gap. This is a correction of the accepted D2 contract, not a new chain detector or a change to restaurant visibility. No models or schema migration are required.

## Task 1: Reproduce and fix unsupported admin confidence

Modify `src/lib/server/restaurants/admin-mutations.test.ts` to execute the real restore, merge and rename functions through the existing mocked database boundary. Assert restores and merges use `unknown`, retain status/reason semantics and review locks, and rename invalidates confidence when it changes identity. Run `npm test -- src/lib/server/restaurants/admin-mutations.test.ts` and verify the new assertions fail because current actions assign/preserve unsupported confidence. Change only those assignments in `src/lib/server/restaurants/admin.ts` and explain that review timestamps protect an edit, not a count. Rerun focused admin tests, then the full Vitest suite and `npm run check`.

## Task 2: Preview and verify the historical repair

Use `output/chain-scorer/issue-199/provenance-20261004/` in the primary checkout for private artifacts and scripts. Resolve Railway production and its PostgreSQL proxy explicitly; inject credentials with `railway run` without printing them. In read-only transactions, collect full public-table fingerprints and the fifteen expected active/independent/locked rows. Require merge/rename alias provenance and compare review timestamps to the original #201 backup preview. Re-evaluate each exact identity against the reviewed ledger and reject evidence-backed independence or other classification changes. Save the exact plan, all rows and backup metadata. Take a full custom-format dump including the migration ledger; verify its TOC and hash and that preview fingerprints did not change.

## Task 3: Apply, verify and reconcile

After review of the exact fifteen-row preview, lock and compare the planned rows and all table fingerprints before one confidence-only transaction. Change only `chain_confidence` from `independent` to `unknown`, preserving `updated_at`, `reviewed_at`, status, names, addresses and aliases. Require an exact returned ID set; verify all other columns/rows and all six other tables remain unchanged before commit. Re-read after commit. Confirm health and public visibility are unchanged, and record the real results in this document. Independently review the code diff, then commit/push/open a PR with the tests and live evidence. Keep #199 open until the admin correction lands and its deployment is verified.

## Completed validation and production correction

#221 merged as `e69b6daf32366154d4048a3af0045c1dfa993cf2` after both CI jobs passed. Railway deployment `1850097d-7606-48b0-817f-7ea03cb1ef2e` reached `SUCCESS` at that exact commit. It corrects the public acknowledgment and records the historical #201 application.

Four new admin regressions failed on the old implementation: restore, duplicate dismissal, merge and rename. They passed after the minimal confidence changes. All 13 admin mutation tests and two partition tests pass; the full Vitest suite passes 316 tests across 41 files. `npm run check` reports zero errors and warnings. No Python policy, database schema or ordinary ingest/backfill lock changed.

The read-only production preview identified exactly IDs 227, 517, 586, 591, 647, 714, 845, 893, 984, 986, 1000, 1014, 1064, 1158 and 1350. Their identity, status, confidence and timestamps match the historical #201 preview. Each has a merge/rename alias with `created_at` equal to `reviewed_at`; the current reviewed ledger returns `unknown` for each. No evidence-backed independent decision entered the repair set. All public-table fingerprints remained unchanged during preparation.

A fresh full PostgreSQL custom-format backup, including all seven public tables and the migration ledger, passed its TOC check. The private backup is `data/backups/prod-pre-199-provenance-20261004T070757Z.dump` (322,343 bytes; SHA-256 `c7c75fd4c8b7938aa0011e669cc21bb33b2e4333b441e84a5e4ac4e08ad22b40`). Independent review checked the saved row/provenance evidence, backup hash and exact transaction script before application.

At `2026-10-04T07:09:37Z`, the reviewed transaction changed only those fifteen `chain_confidence` values to `unknown`. It verified serializable isolation, locked restaurant writes, compared all rows and table fingerprints with the approved preview, and rechecked the unchanged ledger and alias proof before writing. Before commit, every resulting row matched the exact expected record and the other six table fingerprints were unchanged. A fresh connection verified committed readback.

Production now has **1,146 active restaurants, all `unknown`, and 78 excluded**. No names, aliases, addresses, statuses, review timestamps, update timestamps or unplanned fields changed. Public verification reports the same 1,146 restaurants, 73 threads and 2,379 mentions; both audited Polly's Pies slugs remain absent from the homepage and their mention APIs return empty arrays. No model request or schema/registry change ran.

Private artifacts remain under `output/chain-scorer/issue-199/provenance-20261004/`: `prepare.py`, `apply.py`, `plan.json`, `alias-proof.json`, `rows-before.json`, backup TOC, before/after fingerprints, `applied.json` and `http-after.json`. The script's one-hour preview limit, exact row-state guards and explicit `--apply` protect this completed maintenance operation; do not rerun it as a routine backfill. Keep #199 open until the admin correction is merged and its production deployment is verified.
