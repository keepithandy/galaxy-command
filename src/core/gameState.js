export const GAME_STATE_VERSION = 1;
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
  return {
    version: GAME_STATE_VERSION,
    seed,
    turn: 1,
    year: 1,
    playerFaction: PLAYER_FACTION_ID,
    factions: {
      independent: { credits: 1000, research: 0, reputation: 10, atWar: [] },
      aurora: { credits: 1000, research: 0, reputation: 0, atWar: [] },
      vanguard: { credits: 1000, research: 0, reputation: -10, atWar: [] },
    },
    planets: {},
    fleets: {},
    armies: {},
    technologies: {},
    diplomacy: {},
    events: [],
    history: [],
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
        food: 50,
        energy: 50,
        loyalty: 60,
      };
    }
  }

  for (const fleet of galaxy.fleets ?? []) {
    if (!next.factions[fleet.faction]) {
      throw new Error(`Unknown fleet faction ID: ${fleet.faction}`);
    }
    next.fleets[fleet.id] ??= structuredClone(fleet);
  }

  return next;
}

export function recordEvent(state, type, payload = {}) {
  state.events.push({ turn: state.turn, type, payload });
  if (state.events.length > 100) state.events.shift();
}
