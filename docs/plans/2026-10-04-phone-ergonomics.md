# Phone ergonomics implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete #165's reported phone ergonomics while preserving explorer filters, keyboard access and existing visual style.

**Architecture:** Keep the current shared filter state and native map dialog. Put Saved/Unmapped in a fixed mobile action row so their labels remain readable at 320px without starving the facet rail. Use actual mask fades and 44px active-filter targets. Make the expanded mobile dialog fill the viewport, with safe-area controls and explicit close/Escape; outside pointer gestures close only when both start and end are outside the sheet. Fit the current filtered population after map sizing settles, while explicit restaurant focus takes precedence. Reuse lazy map initialization for desktop and batch marker additions for chunked clustering.

**Tech Stack:** Svelte 5, Leaflet/markercluster, Vitest component tests, Playwright responsive and keyboard regression suites.

The user authorized continuing the backlog plan and #165 supplies the desired behavior. We preserve typography, colors and existing controls. Moving the actions into a second fixed row costs one 44px row but avoids unreadable icon-only Saved/Unmapped controls and leaves the facet rail usable at 320px. An icon-only crowded single row and a replacement drawer were considered; the former loses clear labels and the latter expands scope. No restaurant geocode is changed: Da Rae's distant coordinate needs separate source verification.

## Task 1: Reproduce filter reachability and touch targets

Add a component regression proving Saved and Unmapped render in `.filter-actions`. Add `tests/phone-ergonomics.spec.ts` checks at 320/390px for fixed action reachability, no horizontal overflow, 44px active filter/Clear all targets and a real scroll-rail mask. Run the new tests against the old implementation and observe failures. Move only those two action blocks; keep existing state, labels and event behavior. Add mobile row layout and mask gradients; reveal activated facet triggers with `scrollIntoView({inline:'nearest'})`.

## Task 2: Correct reading and map geometry

Add a real browser regression for the full-screen modal geometry and close/focus behavior, and expanded-row sticky header behavior. Preserve the existing dialog trap, scroll lock and desktop in-flow map. Remove obsolete top-offset measurement; use full viewport sizing and safe-area padding. Add a dimmed backdrop and outside pointer dismissal without closing after a drag that began in the map. Give the expanded mobile row header a sticky top and opaque existing background.

## Task 3: Fit and initialize the map reliably

Use an IntersectionObserver on both viewport branches. Add markers through batch `addLayers` and enable `chunkedLoading`. Invalidate map size and fit the current mapped population on initialization and on every mobile open after the layout frame; preserve explicit map targets. Keep observer/frame cleanup. Set tooltip direction auto and use measured overflow panning because Leaflet Tooltip does not implement Popup's `autoPan` option. Link attribution to OpenStreetMap copyright. Validate cold-filter map bounds, reopening and direct Show on map with real Leaflet.

## Task 4: Verify and deliver

Run focused/full Vitest, Svelte check and the affected responsive/map/keyboard Playwright suites. Test 320×568, 390×844, tablet and desktop; preserve desktop compact controls, modal focus/Escape and existing URL/filter state. Reconcile any existing tests that intentionally pinned the old cramped geometry. Independently review the final diff, commit/push and open a draft PR. Record actual local/CI evidence separately; close #165 only after acceptance and landing. No model calls or production data writes are part of this work.


## Verification checkpoint

Implemented all four tasks on `knakamura/165-phone-ergonomics`. Saved and Unmapped remain labeled at 320px; very large counts can wrap instead of pushing the page sideways. The rail mask is suspended while a menu is open so its fixed panel can escape. Explicit phone card expansion brings its header into view before reading.

Fresh local validation on October 4, 2026:
- Svelte check: 0 errors, 0 warnings.
- Vitest: 320 passed across 42 files, including the existing marker debounce test and three new deferred-batch lifecycle regressions.
- Python pipeline: 301 passed; no inference calls.
- Affected phone chrome/map/card/keyboard Playwright suites: 42 passed and 42 expected project/viewport skips. Map geometry was checked at 320, 390, 600 and 768px; desktop behavior at 1024 and 1280px.
- Independent review approved the final diff after fixing pending marker filter, focus and unmount races.

These are local results, not CI or deployment proof. The browser checks read the existing dataset with analytics disabled; saved geocodes and production data were not changed. The reported Da Rae coordinate is a separate data follow-up. Full-screen map geometry exposes no normal outside region, so Close/Escape are its visible dismissal controls; outside-pointer handling remains available for an exposed backdrop.

PR #224's first CI run exposed two fixture-dependent assertions: the two-restaurant corpus does not always overflow the facet rail or provide a long enough comment to scroll. The rail assertion now compares the indicator with measured overflow; the sticky-header test supplies a long synthetic comment through the detail API. Independent review approved those test changes. The affected browser suites also passed against a separate local database seeded with CI's two restaurants: 42 passed, 42 expected skips. Current-head CI is still required before landing.
