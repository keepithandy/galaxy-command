# Galaxy Command

A browser-based 3D galaxy strategy game built around direct interaction with a living strategic map.

## Phase 1 — Interactive 3D Galaxy Foundation

The first milestone establishes the technical and visual foundation:

- Vite + Three.js browser application
- Procedural starfield
- Multiple data-driven star systems
- Orbiting planets
- Mouse selection and planet inspection
- Faction-aware planet data
- Responsive command HUD
- JSON-backed galaxy seed data

## Run locally

```bash
npm install
npm run dev
```

Build for production with:

```bash
npm run build
```

## Direction

The long-term game loop will expand from galaxy navigation into planetary management, armies, fleets, diplomacy, economy, territory control, and eventually large-scale conquest.

Phase 1 intentionally does not implement combat or economy simulation. It establishes the galaxy as the primary command surface so later systems can be layered onto a stable spatial model.
