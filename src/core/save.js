import { GAME_STATE_VERSION } from './gameState.js';

const STORAGE_KEY = 'galaxy-command-save-v1';

export function serializeState(state) {
  return JSON.stringify({ ...state, version: GAME_STATE_VERSION });
}

export function saveGame(state, slot = 'autosave') {
  const key = `${STORAGE_KEY}:${slot}`;
  localStorage.setItem(key, serializeState(state));
  return key;
}

export function loadGame(slot = 'autosave') {
  const raw = localStorage.getItem(`${STORAGE_KEY}:${slot}`);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    if (state.version !== GAME_STATE_VERSION) return null;
    return state;
  } catch {
    return null;
  }
}

export function deleteSave(slot = 'autosave') {
  localStorage.removeItem(`${STORAGE_KEY}:${slot}`);
}
