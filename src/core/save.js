import { assertStateInvariants, GAME_STATE_VERSION } from './gameState.js';
import { ensureDiplomacyState } from './diplomacy.js';

export const SAVE_SCHEMA_VERSION = 4;
const STORAGE_KEY = `galaxy-command-save-v${SAVE_SCHEMA_VERSION}`;
const LEGACY_STORAGE_KEYS = ['galaxy-command-save-v3', 'galaxy-command-save-v2', 'galaxy-command-save-v1'];

export class SaveError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'SaveError';
  }
}

function storageForBrowser() {
  if (typeof localStorage === 'undefined') throw new SaveError('Browser storage is unavailable.');
  return localStorage;
}

function keys(slot) {
  const base = `${STORAGE_KEY}:${slot}`;
  return {
    base,
    legacy: LEGACY_STORAGE_KEYS.flatMap((key) => [`${key}:${slot}`, `${key}:${slot}:recovery`]),
    recovery: `${base}:recovery`,
    pending: `${base}:pending`,
  };
}

function migrateVersion1State(state) {
  const next = structuredClone(state);
  next.version = 2;
  next.events ??= [];
  next.history ??= [];
  next.lastTurnReport ??= null;
  for (const planet of Object.values(next.planets ?? {})) {
    planet.development ??= Math.round((planet.industry * 0.45) + (planet.resources * 0.35) + (planet.defense * 0.2));
    planet.food ??= 50;
    planet.energy ??= 50;
    planet.loyalty ??= 60;
  }
  for (const fleet of Object.values(next.fleets ?? {})) {
    fleet.destinationSystemId ??= null;
    fleet.movementStatus ??= 'IDLE';
    fleet.eta ??= 0;
    fleet.lastMovementEvent ??= null;
  }
  return next;
}

function migrateVersion2State(state) {
  const next = structuredClone(state);
  next.version = 3;
  ensureDiplomacyState(next);
  return next;
}

function migrateVersion3State(state) {
  const next = structuredClone(state);
  next.version = GAME_STATE_VERSION;
  ensureDiplomacyState(next);
  return next;
}

const MIGRATIONS = new Map([
  [1, migrateVersion1State],
  [2, migrateVersion2State],
  [3, migrateVersion3State],
]);

function validateCurrentState(state) {
  try {
    assertStateInvariants(state);
    return state;
  } catch (error) {
    throw new SaveError(`Save data failed validation: ${error.message}`, error);
  }
}

export function migrateSave(value) {
  let payload;
  try {
    payload = typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
  } catch (error) {
    throw new SaveError('Save data is not valid JSON.', error);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SaveError('Save data must be a JSON object.');
  }

  const isEnvelope = Object.hasOwn(payload, 'schemaVersion');
  const schemaVersion = isEnvelope ? payload.schemaVersion : (payload.version ?? 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new SaveError('Save data has no valid schema version.');
  }
  if (schemaVersion > SAVE_SCHEMA_VERSION) {
    throw new SaveError(`Save schema ${schemaVersion} is newer than this build supports.`);
  }

  let state = isEnvelope ? payload.state : payload;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new SaveError('Save data does not contain a campaign state.');
  }

  try {
    state = structuredClone(state);
    for (let version = schemaVersion; version < SAVE_SCHEMA_VERSION; version += 1) {
      const migrate = MIGRATIONS.get(version);
      if (!migrate) throw new SaveError(`No migration is available for save schema ${version}.`);
      state = migrate(state);
    }
  } catch (error) {
    if (error instanceof SaveError) throw error;
    throw new SaveError('Save data could not be migrated.', error);
  }

  return validateCurrentState(state);
}

export function serializeState(state) {
  let current;
  try {
    current = structuredClone(state);
  } catch (error) {
    throw new SaveError('Campaign state could not be copied for saving.', error);
  }
  validateCurrentState(current);
  return JSON.stringify({
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    state: current,
  });
}

export function exportSave(state) {
  return serializeState(state);
}

export function saveGame(state, slot = 'autosave') {
  const storage = storageForBrowser();
  const saveKeys = keys(slot);
  const raw = serializeState(state);
  try {
    let previous = storage.getItem(saveKeys.base);
    for (const legacyKey of saveKeys.legacy) previous ??= storage.getItem(legacyKey);
    storage.setItem(saveKeys.pending, raw);
    if (previous) storage.setItem(saveKeys.recovery, previous);
    storage.setItem(saveKeys.base, raw);
    storage.removeItem(saveKeys.pending);
  } catch (error) {
    try {
      storage.removeItem(saveKeys.pending);
    } catch {
      // The browser may have disabled storage entirely; the committed copy is untouched.
    }
    throw new SaveError(`Could not save slot "${slot}". The last known-good save was preserved.`, error);
  }
  return saveKeys.base;
}

function loadFromKeys(storage, candidates) {
  let foundCandidate = false;
  let lastError = null;
  for (const key of candidates) {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      throw new SaveError('Browser storage could not be read. The current campaign was preserved.', error);
    }
    if (!raw) continue;
    foundCandidate = true;
    try {
      return migrateSave(raw);
    } catch (error) {
      lastError = error;
      // Try the next recovery or legacy copy before reporting no usable save.
    }
  }
  if (foundCandidate) {
    throw new SaveError('No valid save or recovery copy was found. The current campaign was preserved.', lastError);
  }
  return null;
}

export function loadGame(slot = 'autosave') {
  const storage = storageForBrowser();
  const saveKeys = keys(slot);
  return loadFromKeys(storage, [saveKeys.base, saveKeys.recovery, ...saveKeys.legacy]);
}

export function loadRecoveryGame(slot = 'autosave') {
  const storage = storageForBrowser();
  return loadFromKeys(storage, [keys(slot).recovery]);
}

export function importSave(raw, slot = 'manual') {
  const state = migrateSave(raw);
  saveGame(state, slot);
  return state;
}

export function deleteSave(slot = 'autosave') {
  const storage = storageForBrowser();
  const saveKeys = keys(slot);
  storage.removeItem(saveKeys.base);
  storage.removeItem(saveKeys.recovery);
  storage.removeItem(saveKeys.pending);
  for (const legacyKey of saveKeys.legacy) {
    storage.removeItem(legacyKey);
  }
}
