import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Group, Scene } from 'three';

import { createGameState, hydrateGalaxyState } from '../src/core/gameState.js';
import {
  createSystemViewLayer,
  deriveSystemViewData,
  isGalaxyLabelVisible,
  SYSTEM_LABEL_BUDGET,
} from '../src/navigation/systemView.js';

const galaxyData = JSON.parse(
  await readFile(new URL('../src/data/galaxy.json', import.meta.url), 'utf8')
);
const galaxy = galaxyData.galaxy;

test('system view model deterministically aggregates spatial command data', () => {
  const state = hydrateGalaxyState(createGameState(), galaxy);
  const view = deriveSystemViewData(galaxy.systems[0], state);

  assert.equal(view.systemId, 'solara');
  assert.equal(view.controller, 'aurora');
  assert.deepEqual(view.worlds.map((world) => world.id), ['solara-prime', 'solara-ii']);
  assert.equal(view.resources, 160);
  assert.equal(view.industry, 137);
  assert.equal(view.defense, 96);
  assert.equal(view.strategicValue, 66);
  assert.deepEqual(view.fleets.map((fleet) => fleet.id), ['aurora-watch']);
  assert.equal(view.fleetStrength, 36);
});

test('system scene layer activates prebuilt groups without rebuilding them', () => {
  const scene = new Scene();
  const layer = createSystemViewLayer(scene);
  const solara = new Group();
  const veyra = new Group();

  layer.register('solara', solara);
  layer.register('veyra', veyra);
  assert.equal(layer.size, 2);
  assert.equal(scene.getObjectByName('system-view-layer'), layer.group);
  assert.equal(layer.setActiveSystem('solara'), 'solara');
  assert.equal(layer.group.visible, true);
  assert.equal(solara.visible, true);
  assert.equal(veyra.visible, false);

  layer.setActiveSystem('veyra');
  assert.equal(layer.get('solara'), solara);
  assert.equal(layer.get('veyra'), veyra);
  assert.equal(layer.size, 2);
  assert.equal(solara.visible, false);
  assert.equal(veyra.visible, true);
  assert.throws(() => layer.register('solara', new Group()), /already registered/);

  layer.setActiveSystem();
  assert.equal(layer.activeSystemId, null);
  assert.equal(layer.group.visible, false);
});

test('galaxy labels respect compact density budgets while keeping focus visible', () => {
  const total = SYSTEM_LABEL_BUDGET.compact * 4;
  const visible = Array.from({ length: total }, (_, index) => isGalaxyLabelVisible({
    index,
    total,
    compact: true,
  })).filter(Boolean);

  assert.equal(visible.length, SYSTEM_LABEL_BUDGET.compact);
  assert.equal(isGalaxyLabelVisible({ index: 1, total, compact: true, selected: true }), true);
  assert.equal(isGalaxyLabelVisible({ index: 1, total, compact: true, hovered: true }), true);
  assert.equal(isGalaxyLabelVisible({ index: 0, total, compact: true, filtered: true }), false);
  assert.equal(isGalaxyLabelVisible({ index: 0, total, mode: 'system' }), false);

  const filteredTotal = SYSTEM_LABEL_BUDGET.compact - 1;
  const filteredVisible = Array.from({ length: filteredTotal }, (_, index) => isGalaxyLabelVisible({
    index,
    total: filteredTotal,
    compact: true,
  })).filter(Boolean);
  assert.equal(filteredVisible.length, filteredTotal, 'matching labels below budget should all remain visible');
});
