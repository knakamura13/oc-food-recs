# Mobile Map Control Design

## Problem

At every layout below the 1024px desktop breakpoint, the collapsed map is a fixed
88-120px live preview above the virtualized restaurant list. Because rows continue
scrolling underneath it, the preview repeatedly covers restaurant content and the
Save and Expand controls. Browser hit-testing at 320px, 390px, 600px, and 768px
confirmed that taps intended for those controls are intercepted by the map shell.

The same shell is always exposed as a keyboard-focusable `role="button"` around an
interactive Leaflet application. While collapsed, keyboard users encounter the
shell, the map application, and several markers even though the only meaningful
action is to open the larger map. Once expanded, focus is not moved to Close,
Escape does not close the map, and the covered results remain keyboard reachable.

## Decision

Replace the live floating mobile preview with an explicit Map control in the
existing filter controls. Preserve the current expanded map sheet and the desktop
split map/list experience.

The mobile control will be a real button with a visible Map label,
`aria-expanded`, and `aria-controls`. The collapsed map surface will be hidden
from layout, pointer input, and the accessibility tree, so no restaurant row can
pass underneath it and Leaflet does not add hidden keyboard stops.

Opening the map will:

- remember the element that opened it, including a restaurant drawer's Show on
  map action;
- expose the existing sheet below the search and filter controls;
- move focus to the Close button once the sheet is rendered;
- make the covered result list inert while leaving the visible search and filter
  controls usable;
- support Escape; and
- restore focus to the opener on close when it is still connected.

The outer map shell will no longer pretend to be a button on desktop. Leaflet's
own application, markers, zoom controls, and location control remain interactive.

## Component responsibilities

### `src/lib/restaurants/components/FilterBar.svelte`

Accept the current mobile map state and an open callback. Render a mobile-only Map
button alongside the existing filter/share controls. CSS keeps it absent from the
desktop control bar, while its accessibility state remains explicit on narrow
viewports.

### `src/routes/+page.svelte`

Own the open/close lifecycle because it already owns `mapExpanded`, the mobile
breakpoint, scroll locking, and the map/list shell. Replace the map wrapper's
click-as-button behavior with named functions that:

- store the opener;
- open and close the sheet;
- focus Close after opening;
- close on Escape;
- restore focus after closing; and
- mark only the covered list pane inert while open.

Give the map sheet a stable ID and a labelled region state. On mobile, the closed
map pane is not rendered visually. On desktop, it remains the existing inline map
without disclosure semantics.

### `src/lib/restaurants/components/RestaurantList.svelte`

Pass the Show on map button element through the existing callback so closing the
map can restore focus to the action that opened it. No result-card presentation,
virtualization, lazy detail loading, filtering, sorting, or saved-state behavior
changes.

### `src/lib/restaurants/components/Map.svelte`

Continue to initialize Leaflet when the map becomes visible. If deferring the
collapsed mobile surface makes initialization perceptible, expose a lightweight
`aria-busy` loading treatment until Leaflet is ready. Do not add a dependency or
load decorative assets.

## Responsive behavior

- Below 1024px: show the Map control, hide the collapsed map pane, and display the
  existing fixed sheet only while expanded.
- At 1024px and above: hide the Map control and preserve the inline split layout.
- Preserve existing search/filter wrapping, mobile result cards, safe-area
  offsets, body scroll lock, and reduced-motion behavior.

## Accessibility behavior

- The opener is a native button with a stable accessible name and disclosure
  state.
- The hidden map contributes no collapsed keyboard stops.
- The expanded map is a named region rather than a button wrapping an
  application.
- Close receives focus after opening.
- Escape and Close both restore focus to the opener.
- The covered list is inert only while the mobile sheet is open.
- The visible controls above the sheet remain operable so users can refine the map
  population without closing it.
- Existing global focus-visible and reduced-motion rules remain authoritative.

## Error and loading states

The map's existing geolocation loading/disabled/error states remain unchanged. A
deferred Leaflet initialization must not present a blank unexplained sheet: the
map panel will expose a polite loading status until initialization completes if a
visible delay is possible.

## Validation

Extend `tests/mobile-map.spec.ts` before production changes. The browser tests must
first fail against the current floating preview, then prove:

- a visible labelled Map control and no collapsed map obstruction at 320px,
  390px, 600px, and 768px;
- no intersection between the closed map surface and visible Save/Expand targets;
- keyboard opening, Close focus, Escape closing, and focus restoration;
- the covered result list is inert only while open;
- the collapsed map is absent from the keyboard order;
- Show on map opens the sheet and restores focus correctly;
- the existing search/filter controls remain usable while the sheet is open;
- the desktop inline map remains visible and interactive at 1024px and 1280px;
- reduced-motion behavior remains stable; and
- no horizontal overflow, clipping, row overlap, or new console errors appear.

Run the focused browser test, the full Vitest suite, Svelte checks, the production
build, and final browser QA with screenshots at the representative narrow and
desktop viewports.
