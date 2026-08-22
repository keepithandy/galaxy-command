import assert from 'node:assert/strict';
import test from 'node:test';

import { generateGalaxy } from '../src/core/galaxyGeneration.js';
import { assertStateInvariants, createGameState, hydrateGalaxyState } from '../src/core/gameState.js';
import { assignFleetDestination, getReachableSystemIds } from '../src/core/fleetMovement.js';
import { parseCampaignSeed } from '../src/core/seed.js';
import { simulateTurn } from '../src/core/simulation.js';

function createSeededState(seed) {
  return hydrateGalaxyState(createGameState(seed), generateGalaxy({ seed, systemCount: 5, planetsPerSystem: 3 }));
}

test('procedural galaxy generation is deterministic by seed', () => {
  const first = generateGalaxy({ seed: 42, systemCount: 4, planetsPerSystem: 2 });
  const second = generateGalaxy({ seed: 42, systemCount: 4, planetsPerSystem: 2 });
  const different = generateGalaxy({ seed: 43, systemCount: 4, planetsPerSystem: 2 });

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, different);
  assert.equal(first.systems.length, 4);
  assert.equal(first.systems[0].planets.length, 2);
});

test('only explicit integer URL seeds select a procedural campaign', () => {
  assert.equal(parseCampaignSeed(null), null);
  assert.equal(parseCampaignSeed(''), null);
  assert.equal(parseCampaignSeed('9001'), 9001);
  assert.equal(parseCampaignSeed('not-a-seed'), null);
});

test('procedural galaxies form a structured core, spiral arms, and outer fringe', () => {
  const galaxy = generateGalaxy({ seed: 8675309, systemCount: 24, planetsPerSystem: 1 });
  const regions = galaxy.systems.reduce((counts, system) => {
    counts[system.region] = (counts[system.region] ?? 0) + 1;
    return counts;
  }, {});
  const radii = galaxy.systems.map((system) => Math.hypot(system.position[0], system.position[2]));

  assert.ok(regions.core >= 3);
  assert.ok(regions.arm >= 15);
  assert.ok(regions.outer >= 2);
  assert.ok(Math.min(...radii) < 10);
  assert.ok(Math.max(...radii) > 55);
  assert.ok(galaxy.systems.every((system) => Number.isInteger(system.strategicValue)));
});

test('turn simulation is deterministic and exposes a report', () => {
  const first = createSeededState(9001);
  const second = createSeededState(9001);

  for (let turn = 0; turn < 24; turn += 1) {
    simulateTurn(first);
    simulateTurn(second);
  }

  assert.deepEqual(first, second);
  assert.equal(first.turn, 25);
  assert.equal(first.year, 3);
  assert.equal(first.lastTurnReport.turn, 25);
  assert.equal(first.lastTurnReport.planetsUpdated.length, Object.keys(first.planets).length);
  assertStateInvariants(first);
});

test('simulation keeps world values within invariants over a long campaign', () => {
  const state = createSeededState(77);

  for (let turn = 0; turn < 240; turn += 1) simulateTurn(state);

  assert.equal(state.turn, 241);
  assert.equal(state.year, 21);
  assert.ok(state.history.length <= 120);
  for (const planet of Object.values(state.planets)) {
    assert.ok(planet.development >= 0 && planet.development <= 100);
    assert.ok(planet.population > 0);
  }
  assertStateInvariants(state);
});

test('invariants reject impossible planet state', () => {
  const state = createSeededState(12);
  state.planets[Object.keys(state.planets)[0]].development = 101;

  assert.throws(() => assertStateInvariants(state), /development/);
});

test('fleet movement validates routes and arrives deterministically', () => {
  const galaxy = generateGalaxy({ seed: 314, systemCount: 5, planetsPerSystem: 2 });
  const state = hydrateGalaxyState(createGameState(314), galaxy);
  const fleet = Object.values(state.fleets)[0];
  const destination = getReachableSystemIds(galaxy, fleet.systemId)[0];

  assert.ok(destination);
  assert.equal(assignFleetDestination(state, galaxy, fleet.id, 'missing-system'), false);
  assert.equal(assignFleetDestination(state, galaxy, fleet.id, destination), true);
  assert.equal(fleet.movementStatus, 'MOVING');
  assert.equal(fleet.destinationSystemId, destination);
  assert.equal(fleet.eta, 1);

  const report = simulateTurn(state).lastTurnReport;
  assert.deepEqual(report.fleetsMoved, [{
    fleetId: fleet.id,
    fromSystemId: 'system-1',
    toSystemId: destination,
  }]);
  assert.equal(fleet.systemId, destination);
  assert.equal(fleet.destinationSystemId, null);
  assert.equal(fleet.movementStatus, 'ARRIVED');
  assert.equal(fleet.eta, 0);
  assert.ok(state.events.some((event) => event.type === 'FLEET_ARRIVED'));
  assertStateInvariants(state);
});
