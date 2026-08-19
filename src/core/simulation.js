import { assertStateInvariants, recordEvent } from './gameState.js';
import { createSeededRandom } from './galaxyGeneration.js';
import { advanceFleetMovement } from './fleetMovement.js';
import { advanceDiplomacy, setWarState } from './diplomacy.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function planetRandom(state, planetId) {
  let hash = state.seed >>> 0;
  for (const character of planetId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  hash ^= Math.imul(state.turn, 2246822519);
  return createSeededRandom(hash >>> 0);
}

export function simulateTurn(state) {
  assertStateInvariants(state);
  state.turn += 1;
  state.year = Math.floor((state.turn - 1) / 12) + 1;
  const report = { turn: state.turn, year: state.year, planetsUpdated: [], factionIncome: {}, fleetsMoved: [], diplomacyUpdated: [] };

  for (const planet of Object.values(state.planets).sort((left, right) => left.id.localeCompare(right.id))) {
    const random = planetRandom(state, planet.id);
    const production = Math.max(1, planet.industry * 0.08);
    const resourceYield = Math.max(1, planet.resources * 0.06);
    const foodBalance = planet.food + production - 4;
    const energyBalance = planet.energy + resourceYield - 4;
    planet.food = clamp(foodBalance);
    planet.energy = clamp(energyBalance);

    const developmentDelta = ((planet.food + planet.energy + planet.stability) / 300 - 0.5) * 0.8;
    planet.development = clamp(round((planet.development ?? 0) + developmentDelta));
    planet.industry = clamp(round(planet.industry + (planet.development > 60 ? 0.12 : -0.04)));
    planet.resources = clamp(round(planet.resources + (random() - 0.5) * 0.4));

    if (planet.food > 20 && planet.energy > 20 && planet.stability > 45) {
      planet.population = round(planet.population * (1.0035 + random() * 0.001), 3);
    } else {
      planet.stability = clamp(planet.stability - 1);
    }

    if (planet.faction === state.playerFaction) {
      const credits = Math.floor(production + resourceYield);
      const research = Math.floor(Math.max(1, planet.industry * 0.015));
      state.factions[state.playerFaction].credits += credits;
      state.factions[state.playerFaction].research += research;
      report.factionIncome[state.playerFaction] ??= { credits: 0, research: 0 };
      report.factionIncome[state.playerFaction].credits += credits;
      report.factionIncome[state.playerFaction].research += research;
    }

    report.planetsUpdated.push({ id: planet.id, development: planet.development, population: planet.population });
  }

  for (const faction of Object.values(state.factions)) {
    faction.credits = Math.max(0, faction.credits);
  }

  report.fleetsMoved = advanceFleetMovement(state);
  report.diplomacyUpdated = advanceDiplomacy(state);

  recordEvent(state, 'TURN_ADVANCED', { year: state.year });
  state.history.push({ turn: state.turn, year: state.year });
  if (state.history.length > 120) state.history.shift();
  state.lastTurnReport = report;
  assertStateInvariants(state);
  return state;
}

export function transferPlanet(state, planetId, factionId) {
  const planet = state.planets[planetId];
  if (!planet || !state.factions[factionId]) return false;
  const previousFaction = planet.faction;
  planet.faction = factionId;
  planet.stability = clamp(planet.stability - 10);
  planet.loyalty = clamp(planet.loyalty - 15);
  recordEvent(state, 'PLANET_TRANSFERRED', { planetId, previousFaction, factionId });
  return true;
}

export function setWar(state, factionA, factionB, active = true) {
  return setWarState(state, factionA, factionB, active);
}
