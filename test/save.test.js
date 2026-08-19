import assert from 'node:assert/strict';
import test from 'node:test';

import { generateGalaxy } from '../src/core/galaxyGeneration.js';
import { createGameState, hydrateGalaxyState } from '../src/core/gameState.js';
import {
  exportSave,
  importSave,
  loadGame,
  loadRecoveryGame,
  migrateSave,
  SaveError,
  saveGame,
} from '../src/core/save.js';
import { simulateTurn } from '../src/core/simulation.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.failedSetKey = null;
  }

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failedSetKey) throw new Error(`Storage write failed for ${key}`);
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

function makeState(seed = 7) {
  return hydrateGalaxyState(
    createGameState(seed),
    generateGalaxy({ seed, systemCount: 4, planetsPerSystem: 2 }),
  );
}

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test('migrates a version 1 state to the current save schema', () => {
  const legacy = makeState(11);
  legacy.version = 1;
  delete legacy.lastTurnReport;
  delete legacy.planets[Object.keys(legacy.planets)[0]].development;
  delete legacy.fleets[Object.keys(legacy.fleets)[0]].movementStatus;

  const migrated = migrateSave(JSON.stringify(legacy));
  assert.equal(migrated.version, 2);
  assert.ok(migrated.lastTurnReport === null);
  assert.ok(Number.isFinite(Object.values(migrated.planets)[0].development));
  assert.equal(Object.values(migrated.fleets)[0].movementStatus, 'IDLE');
});

test('save and load round-trip through a versioned envelope', () => {
  const state = makeState(21);
  simulateTurn(state);
  const key = saveGame(state, 'manual');
  const loaded = loadGame('manual');

  assert.equal(key, 'galaxy-command-save-v2:manual');
  assert.equal(loaded.turn, state.turn);
  assert.deepEqual(loaded.planets, state.planets);
});

test('autosave preserves the previous valid copy for recovery', () => {
  const first = makeState(31);
  saveGame(first);
  const second = makeState(31);
  simulateTurn(second);
  saveGame(second);

  assert.equal(loadGame().turn, 2);
  assert.equal(loadRecoveryGame().turn, 1);

  localStorage.setItem('galaxy-command-save-v2:autosave', '{broken');
  assert.equal(loadGame().turn, 1);
});

test('a failed autosave does not overwrite the last known-good save', () => {
  const first = makeState(37);
  saveGame(first);
  const second = makeState(37);
  simulateTurn(second);
  localStorage.failedSetKey = 'galaxy-command-save-v2:autosave';

  assert.throws(() => saveGame(second), SaveError);
  localStorage.failedSetKey = null;
  assert.equal(loadGame().turn, 1);
  assert.equal(loadRecoveryGame().turn, 1);
});

test('corrupt saves report a recoverable error when no valid copy exists', () => {
  localStorage.setItem('galaxy-command-save-v2:autosave', '{broken');

  assert.throws(
    () => loadGame(),
    (error) => error instanceof SaveError && /current campaign was preserved/.test(error.message),
  );
});

test('current-schema saves are validated instead of silently repaired', () => {
  const envelope = JSON.parse(exportSave(makeState(39)));
  delete envelope.state.planets[Object.keys(envelope.state.planets)[0]].development;

  assert.throws(() => migrateSave(envelope), /failed validation.*development/);
});

test('import validates before replacing the selected slot', () => {
  const state = makeState(41);
  const raw = exportSave(state);
  const imported = importSave(raw, 'manual');

  assert.equal(imported.seed, 41);
  assert.equal(loadGame('manual').turn, 1);
  assert.throws(() => importSave('{"schemaVersion":99}', 'manual'), /newer than this build/);
  assert.equal(loadGame('manual').seed, 41);
});
