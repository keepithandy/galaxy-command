# Galaxy Command

A browser-based 3D galaxy strategy game built around direct interaction with a living strategic map.

## Current milestone

The repository now contains the Phase 1 interactive 3D galaxy foundation plus the shared architecture for the long-term 19-phase strategy game: versioned state, deterministic simulation, diplomacy, economy, fleets, armies, technology, intelligence/events, AI decision foundations, and browser save persistence.

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
- `src/core/ai.js` — strategic faction evaluation and autonomous actions
- `src/core/military.js` — fleet/army models and battle resolution foundation
- `src/core/technology.js` — research tree and prerequisites
- `src/core/events.js` — dynamic events and intelligence-event hooks
- `src/core/save.js` — versioned browser save slots
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
