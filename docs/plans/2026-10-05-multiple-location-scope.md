# Multiple-location evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve A’s two existing records while explicitly presenting the broad recommendation as multiple locations, counted once, without an arbitrary pin.

**Architecture:** One versioned reviewed curation manifest shared by publication and ingestion. Scope masks geography before public projection and forces noindex; exact reviewed source keys route to the existing canonical record and fail closed on source drift. No schema migration, merge, source clone or score change.

**Tech Stack:** Svelte 5 / TypeScript, Python pipeline, PostgreSQL, Vitest / unittest / Playwright.

## Approved design

Retain a-s-burgers and a-s-burgers-2. The first covers Dana Point and San Juan Capistrano with separate informational addresses; it remains unmapped, outside radius/city hubs/sitemap, noindex, and counts existing eligible sources once. The second retains its Avery-led identity and comparative source wording. Source takedown gates remain authoritative. Preserve flags/roles on reviewed sources and all existing attachments to other restaurants. No raw source bodies or authors in git; source identity assertions use SHA256.

## Task 1: Shared scope and publication (publication agent)

Own data/restaurant-curation.json validation, src/lib/server/restaurants/restaurant-curation.ts and tests; home/public restaurant loaders, public-pages structured data and types propagation. Validate version, exact fields, unique slug/source keys, source hashes and roles. Apply policy before every list/detail/catalog serialization; set null location/street/coordinates, add location_scope and reviewed_locations, force noindex. Keep counts and existing public gates. Test accidental mapped geography, count preservation, ordinary records and corrupt manifests.

## Task 2: Ingestion protection (pipeline agent)

Own scripts/restaurant_curation.py, scripts/reddit_pipeline.py and tests/test_restaurant_curation.py plus package test script. Use same manifest. Before writes or source cleanup, verify scoped source hashes/roles and existing target/attachments; fail transaction on missing or duplicate target/conflicting A’s attachments. For only reviewed A’s source keys route the incoming A’s candidate to existing slug; preserve other brands. Keep curated flags and existing moderation status; mask scoped geo on insert/update. Abort if reviewed input is missing or changed so cleanup cannot delete it. Replay real upserts twice in isolated fixture DB; test changed bodies/role, unexpected attachment, missing target, conflicting geo and unrelated co-mention preservation. All fixtures synthetic.

## Task 3: Presentation (parent)

Own reusable LocationScope.svelte, detail page and RestaurantList integration. Use multiple-location label and explanation. Replace single map action with separately labeled external address links; no map markers/radius. Ensure collapsed and expanded presentation accessible at320px. No name matching in components. Preserve 973 wording without claiming exclusivity.

## Task 4: Verification and delivery

Run meaningful scope/public tests, pipeline replay, npm run check, npm test, npm run test:pipeline, build and e2e. Review final diff independently, resolve findings, commit/push/open focused PR and attach. Inspect hosted review threads and CI; authorized merge after green, then observe exact deployment SUCCESS, purge CDN and verify live scope/detail/API/sitemap plus unchanged production data. Reconcile Zait already-filtered evidence on #155/#174. Keep #155 open for unresolved identity evidence.
