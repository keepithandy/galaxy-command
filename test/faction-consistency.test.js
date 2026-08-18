import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateFaction } from '../src/core/ai.js';
import { createGameState, hydrateGalaxyState, validateGalaxyFactions } from '../src/core/gameState.js';

const galaxyData = JSON.parse(
  await readFile(new URL('../src/data/galaxy.json', import.meta.url), 'utf8')
);
const galaxy = galaxyData.galaxy;

test('simulation faction IDs match the galaxy data', () => {
  const state = createGameState();
  const simulationFactionIds = Object.keys(state.factions).sort();
  const galaxyFactionIds = galaxy.factions.map((faction) => faction.id).sort();

  assert.deepEqual(simulationFactionIds, galaxyFactionIds);
  assert.ok(simulationFactionIds.includes(state.playerFaction));
  assert.equal(validateGalaxyFactions(state, galaxy), true);
});

test('hydrated planets can be evaluated by each faction', () => {
  const state = hydrateGalaxyState(createGameState(), galaxy);

  for (const factionId of Object.keys(state.factions)) {
    const evaluation = evaluateFaction(state, factionId);
    assert.equal(evaluation.factionId, factionId);
    assert.ok(evaluation.ownedPlanets > 0);
  }
});

test('hydration rejects unknown planet faction IDs', () => {
  const invalidGalaxy = structuredClone(galaxy);
  invalidGalaxy.systems[0].planets[0].faction = 'missing-faction';

  assert.throws(
    () => hydrateGalaxyState(createGameState(), invalidGalaxy),
    /Unknown galaxy faction IDs: missing-faction/
  );
});
