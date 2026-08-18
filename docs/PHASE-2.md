# Phase 2 — Galaxy Navigation & Strategic Map

Phase 2 establishes the galaxy as the primary strategic navigation surface.

## Delivered

- Explicit galaxy/system/planet navigation state.
- System and planet focus helpers.
- Faction territory indexing and faction color mapping.
- Lightweight DOM label helpers suitable for a future CSS2DRenderer layer.
- Strategic-map styling hooks.

## Navigation contract

`galaxy` is the strategic galaxy view. `system` is a selected star-system view. `planet` is a selected planet view. Moving upward clears deeper selections so stale state cannot survive a navigation change.

## Remaining Phase 2 integration

Connect these contracts to the existing Three.js raycasting/UI layer, add visible system labels and fleet markers, and implement smooth camera transitions without changing simulation or combat rules.
