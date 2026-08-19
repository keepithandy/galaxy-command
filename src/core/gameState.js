import { assertDiplomacyInvariants, createDiplomacyState, ensureDiplomacyState } from './diplomacy.js';

export const GAME_STATE_VERSION = 5;
export const PLAYER_FACTION_ID = 'aurora';

const POPULATION_SCALE = Object.freeze({
  K: 0.001,
  M: 1,
  B: 1000,
});

export function parsePopulation(value) {
  if (Number.isFinite(value)) return value;
  const match = String(value).trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMB])?$/i);
  if (!match) return 1;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  return Number((amount * (POPULATION_SCALE[unit] ?? 1)).toFixed(3));
}

export function createGameState(seed = 1337) {
  const factions = {
    independent: { credits: 1000, research: 0, reputation: 10, atWar: [] },
    aurora: { credits: 1000, research: 0, reputation: 0, atWar: [] },
    vanguard: { credits: 1000, research: 0, reputation: -10, atWar: [] },
  };
  return {
    version: GAME_STATE_VERSION,
    seed: Number(seed) >>> 0,
    turn: 1,
    year: 1,
    playerFaction: PLAYER_FACTION_ID,
    factions,
    planets: {},
    fleets: {},
    armies: {},
    technologies: {},
    diplomacy: createDiplomacyState(factions),
    events: [],
    history: [],
    lastTurnReport: null,
  };
}

export function validateGalaxyFactions(state, galaxy) {
  if (!state.factions[state.playerFaction]) {
    throw new Error(`Unknown player faction: ${state.playerFaction}`);
  }

  const unknownFactionIds = new Set();
  for (const system of galaxy.systems) {
    for (const planet of system.planets) {
      if (!state.factions[planet.faction]) unknownFactionIds.add(planet.faction);
    }
  }

  if (unknownFactionIds.size > 0) {
    throw new Error(`Unknown galaxy faction IDs: ${[...unknownFactionIds].join(', ')}`);
  }

  return true;
}

export function hydrateGalaxyState(state, galaxy) {
  validateGalaxyFactions(state, galaxy);
  const next = structuredClone(state);
  for (const system of galaxy.systems) {
    for (const planet of system.planets) {
      next.planets[planet.id] ??= {
        id: planet.id,
        systemId: system.id,
        faction: planet.faction,
        population: parsePopulation(planet.population),
        industry: planet.industry,
        resources: planet.resources,
        defense: planet.defense,
        stability: planet.status === 'STABLE' ? 80 : 55,
        development: Math.round((planet.industry * 0.45) + (planet.resources * 0.35) + (planet.defense * 0.2)),
        food: 50,
        energy: 50,
        loyalty: 60,
      };
      next.planets[planet.id].development ??= Math.round((planet.industry * 0.45) + (planet.resources * 0.35) + (planet.defense * 0.2));
      next.planets[planet.id].food ??= 50;
      next.planets[planet.id].energy ??= 50;
      next.planets[planet.id].loyalty ??= 60;
    }
  }

  for (const fleet of galaxy.fleets ?? []) {
    if (!next.factions[fleet.faction]) {
      throw new Error(`Unknown fleet faction ID: ${fleet.faction}`);
    }
    next.fleets[fleet.id] ??= structuredClone(fleet);
    next.fleets[fleet.id].destinationSystemId ??= null;
    next.fleets[fleet.id].movementStatus ??= 'IDLE';
    next.fleets[fleet.id].eta ??= 0;
    next.fleets[fleet.id].lastMovementEvent ??= null;
  }

  ensureDiplomacyState(next);
  assertStateInvariants(next);
  return next;
}

function assertRange(value, name, min = 0, max = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: expected a finite value between ${min} and ${max}`);
  }
}

export function assertStateInvariants(state) {
  if (!state || state.version !== GAME_STATE_VERSION) throw new Error(`Unsupported game state version: ${state?.version}`);
  if (!Number.isInteger(state.turn) || state.turn < 1) throw new Error(`Invalid turn: ${state.turn}`);
  const expectedYear = Math.floor((state.turn - 1) / 12) + 1;
  if (state.year !== expectedYear) throw new Error(`Invalid year ${state.year} for turn ${state.turn}`);

  for (const [factionId, faction] of Object.entries(state.factions)) {
    assertRange(faction.credits, `${factionId} credits`);
    assertRange(faction.research, `${factionId} research`);
    if (!Array.isArray(faction.atWar)) throw new Error(`Invalid war list for faction ${factionId}`);
  }

  assertDiplomacyInvariants(state);

  for (const [planetId, planet] of Object.entries(state.planets)) {
    if (planet.id !== planetId) throw new Error(`Planet key mismatch: ${planetId}`);
    assertRange(planet.population, `${planetId} population`);
    for (const field of ['industry', 'resources', 'defense', 'stability', 'development', 'food', 'energy', 'loyalty']) {
      assertRange(planet[field], `${planetId} ${field}`, 0, 100);
    }
    if (!state.factions[planet.faction]) throw new Error(`Unknown planet faction: ${planet.faction}`);
  }

  for (const [fleetId, fleet] of Object.entries(state.fleets)) {
    if (fleet.id !== fleetId) throw new Error(`Fleet key mismatch: ${fleetId}`);
    if (!state.factions[fleet.faction]) throw new Error(`Unknown fleet faction: ${fleet.faction}`);
    assertRange(fleet.strength, `${fleetId} strength`);
    if (!['IDLE', 'MOVING', 'ARRIVED', 'RETREATING'].includes(fleet.movementStatus)) {
      throw new Error(`Invalid fleet movement status: ${fleet.movementStatus}`);
    }
    if (!Number.isInteger(fleet.eta) || fleet.eta < 0) throw new Error(`Invalid fleet ETA: ${fleet.eta}`);
    if (fleet.movementStatus === 'MOVING' && (!fleet.destinationSystemId || fleet.eta < 1)) {
      throw new Error(`Moving fleet ${fleetId} must have a destination and positive ETA`);
    }
    if (fleet.movementStatus !== 'MOVING' && fleet.destinationSystemId) {
      throw new Error(`Inactive fleet ${fleetId} cannot have a destination`);
    }
  }

  return true;
}

export function recordEvent(state, type, payload = {}) {
  state.events.push({ turn: state.turn, type, payload });
  if (state.events.length > 100) state.events.shift();
}
