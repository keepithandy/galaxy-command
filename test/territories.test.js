import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createGameState, hydrateGalaxyState } from '../src/core/gameState.js';
import { buildTerritoryIndex, factionColor, systemFaction } from '../src/navigation/territories.js';

const galaxyData = JSON.parse(
  await readFile(new URL('../src/data/galaxy.json', import.meta.url), 'utf8')
);
const galaxy = galaxyData.galaxy;

test('territories derive ownership from hydrated planet state', () => {
  const state = hydrateGalaxyState(createGameState(), galaxy);
  const index = buildTerritoryIndex(galaxy, state.planets);

  assert.deepEqual(index.aurora, ['solara']);
  assert.deepEqual(index.vanguard, ['draconis']);
  assert.deepEqual(index.independent, ['veyra', 'orionis']);
  assert.equal(systemFaction(galaxy.systems[0], state.planets), 'aurora');
});

test('faction colors use galaxy data and preserve a neutral fallback', () => {
  assert.equal(factionColor('aurora', galaxy.factions), '#55b6ff');
  assert.equal(factionColor('missing', galaxy.factions), '#94a3b8');
});
