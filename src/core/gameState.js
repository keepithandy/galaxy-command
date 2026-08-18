export const GAME_STATE_VERSION = 1;
export const PLAYER_FACTION_ID = 'aurora';

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
        population: Number.parseFloat(String(planet.population).replace(/[^0-9.]/g, '')) || 1,
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
  return next;
}

export function recordEvent(state, type, payload = {}) {
  state.events.push({ turn: state.turn, type, payload });
  if (state.events.length > 100) state.events.shift();
}
