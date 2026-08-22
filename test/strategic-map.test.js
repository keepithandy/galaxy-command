import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';

import { createStrategicMap } from '../src/navigation/strategicMap.js';

test('strategic map moves cleanly between galaxy, system, and planet modes', () => {
  const camera = { position: new Vector3(0, 18, 36) };
  const controls = { target: new Vector3(0, 0, 0) };
  const scene = { updateMatrixWorld() {} };
  const map = createStrategicMap({ camera, controls, scene });
  const snapshots = [];
  map.subscribe((state) => snapshots.push(state));

  map.selectSystem('solara', new Vector3(-18, 3, 4));
  assert.equal(map.state.mode, 'system');
  assert.equal(map.state.selectedSystem, 'solara');
  assert.equal(map.state.selectedPlanet, null);

  map.selectPlanet('solara-prime', 'solara', new Vector3(-15, 3, 4));
  assert.equal(map.state.mode, 'planet');
  assert.equal(map.state.selectedPlanet, 'solara-prime');

  map.setFactionFilter('aurora');
  assert.equal(map.state.factionFilter, 'aurora');
  map.update(1);
  assert.deepEqual(camera.position.toArray(), [-10.5, 5.5, 8.5]);

  map.returnToGalaxy();
  map.update(1);
  assert.deepEqual(camera.position.toArray(), [0, 18, 36]);
  assert.deepEqual(controls.target.toArray(), [0, 0, 0]);
  assert.equal(map.state.mode, 'galaxy');
  assert.equal(snapshots.length, 4);
});

test('back navigation restores system and galaxy camera bookmarks one level at a time', () => {
  const camera = { position: new Vector3(0, 18, 36) };
  const controls = { target: new Vector3(0, 0, 0) };
  const scene = { updateMatrixWorld() {} };
  const map = createStrategicMap({ camera, controls, scene });

  map.selectSystem('solara', new Vector3(-18, 3, 4));
  map.update(1);
  camera.position.set(-7, 11, 13);
  controls.target.set(-17, 3, 4);
  map.selectPlanet('solara-prime', 'solara', new Vector3(-15, 3, 4));
  map.update(1);

  assert.equal(map.back(), true);
  map.update(1);
  assert.equal(map.state.mode, 'system');
  assert.equal(map.state.selectedSystem, 'solara');
  assert.equal(map.state.selectedPlanet, null);
  assert.deepEqual(camera.position.toArray(), [-7, 11, 13]);
  assert.deepEqual(controls.target.toArray(), [-17, 3, 4]);

  assert.equal(map.back(), true);
  map.update(1);
  assert.equal(map.state.mode, 'galaxy');
  assert.deepEqual(camera.position.toArray(), [0, 18, 36]);
  assert.deepEqual(controls.target.toArray(), [0, 0, 0]);
  assert.equal(map.back(), false);
});

test('an immediate planet selection preserves the pending system camera destination', () => {
  const camera = { position: new Vector3(0, 18, 36) };
  const controls = { target: new Vector3(0, 0, 0) };
  const map = createStrategicMap({ camera, controls, scene: { updateMatrixWorld() {} } });

  map.selectSystem('solara', new Vector3(-18, 3, 4));
  map.selectPlanet('solara-prime', 'solara', new Vector3(-15, 3, 4));
  map.update(1);
  map.back();
  map.update(1);

  assert.deepEqual(camera.position.toArray(), [-8, 9, 14]);
  assert.deepEqual(controls.target.toArray(), [-18, 3, 4]);
});
