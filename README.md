# Galaxy Command

A browser-based 3D galaxy strategy game built around direct interaction with a living strategic map.

Current build: `0.0.2` — Galaxy Renderer v2

## Current milestone

Phases 1–3 are delivered: the interactive 3D galaxy, strategic navigation/map, and deterministic world simulation now work together. Players can move between galaxy, system, and planet focus; inspect live planet and fleet state; advance deterministic turns; use faction filters; and read territory ownership directly from the map. Versioned persistence and the first accessibility/performance release gates have also been delivered ahead of their broader roadmap phases.

Phase 4 — Factions & Diplomacy — is in progress. Phases 4A–4C now provide canonical bilateral relationships, deterministic diplomatic actions and drift, treaty proposals, non-aggression pacts, alliances, treaty expiry and breaking, war declarations, negotiated peace, vassalage, release and independence lifecycles, save migration, and an interactive diplomacy HUD. Autonomous diplomatic AI remains for Phase 4D.

Galaxy Renderer v2 now presents seeded campaigns as a coherent spiral galaxy with core, arm, and outer-fringe placement; camera pan/zoom limits; touch-aware controls; efficient particle-density scaling; system hover/selection feedback; and a system command surface. The command surface exposes the current controller, worlds, strategic value, resources, and fleet presence without coupling future conquest systems to the renderer.

The architecture is deliberately data-driven so the visible galaxy can remain the primary command surface as deeper systems are implemented.

## Run locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Start a deterministic procedural campaign by supplying a seed in the URL, for example `http://localhost:5173/?seed=9001`. Omitting `seed` loads the curated default galaxy.

Click a star system to inspect it, click empty space (or press `G`/`Escape`) to return to the galaxy, drag to rotate, use the scroll wheel to zoom, and use two fingers to pan on touch devices.

Run browser smoke tests across Chromium, Firefox, and WebKit:

```bash
npx playwright install chromium firefox webkit
npm run test:browser
```

Check the production bundle against the tracked JavaScript, CSS, and total-size budgets:

```bash
npm run check:performance
```

The CI workflow runs unit tests, production builds, performance budgets, and browser smoke tests on every pull request. If WebGL is unavailable or initialization fails, the app shows a recovery panel instead of leaving a blank screen.

## Saves and recovery

Saves use a versioned JSON envelope. The current schema is version 5; older version 1–4 saves are migrated when loaded. Autosaves are written through a pending copy and retain the previous valid payload as a recovery copy if a write fails. The HUD provides Save, Load, Export, and Import controls. Imported files are validated before they can replace the current campaign. See [`docs/SAVE_FORMAT.md`](docs/SAVE_FORMAT.md) for the schema and recovery contract.

Keyboard shortcuts: `G` returns to the galaxy view, `N` advances a turn, `D` opens diplomatic command, and `Escape` closes the inspection panel or returns to the galaxy view. The interface respects the operating system's reduced-motion preference.

## Architecture

```text
Galaxy View
  -> Star System
    -> Planet
      -> Economy / Population / Stability
      -> Military / Garrison
      -> Faction / Diplomacy
      -> Technology / Intelligence

Simulation State
  -> deterministic turns
  -> faction AI
  -> events
  -> persistence
```

Core modules currently include:

- `src/core/gameState.js` — versioned campaign state and galaxy hydration
- `src/core/simulation.js` — economy, population, diplomacy, war, and turn progression
- `src/core/diplomacy.js` — bilateral relationships, diplomatic actions, treaty and vassalage lifecycles, stance derivation, and war-state synchronization
- `src/core/ai.js` — strategic faction evaluation and autonomous actions
- `src/core/military.js` — fleet/army models and battle resolution foundation
- `src/core/technology.js` — research tree and prerequisites
- `src/core/events.js` — dynamic events and intelligence-event hooks
- `src/core/save.js` — versioned browser save slots
- `src/navigation/` — strategic navigation state, faction territories, and map labels
- `docs/ROADMAP.md` — complete 19-phase product roadmap

## 19-phase roadmap

1. Interactive 3D Galaxy Foundation
2. Galaxy Navigation & Strategic Map
3. Galaxy Data & World Simulation
4. Factions & Diplomacy
5. Economy & Industry
6. Military & Fleet System
7. Warfare & Conquest
8. Empire Management
9. Technology & Research
10. Intelligence, Espionage & Events
11. Living AI Factions
12. Advanced 3D Galaxy
13. Campaign & Story
14. Sandbox Mode
15. Persistence & Campaign Infrastructure
16. UX, Accessibility & Performance
17. Audio & Presentation
18. Endgame & Galactic Crisis
19. Multiplayer Foundation

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full implementation contract.

## Design rule

The galaxy is the game interface. Menus should expose information and commands, not replace the spatial simulation. Planet ownership, fleet movement, territory, conflict, trade, and major events should ultimately be understandable from the galaxy itself.

## Scope note

The 19 phases describe the complete product architecture. The current branch is a foundation milestone, not a claim that every production feature in Phases 1–19 is already finished. Multiplayer, large-scale rendering, content production, balance, deployment, and server infrastructure require subsequent implementation and validation.
