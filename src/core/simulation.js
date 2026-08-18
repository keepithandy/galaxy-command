import { recordEvent } from './gameState.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function simulateTurn(state) {
  state.turn += 1;
  state.year = Math.floor((state.turn - 1) / 12) + 1;

  for (const planet of Object.values(state.planets)) {
    const production = Math.max(1, planet.industry * 0.08);
    const resourceYield = Math.max(1, planet.resources * 0.06);
    const foodBalance = planet.food + production - 4;
    const energyBalance = planet.energy + resourceYield - 4;
    planet.food = clamp(foodBalance);
    planet.energy = clamp(energyBalance);

    if (planet.food > 20 && planet.energy > 20 && planet.stability > 45) {
      planet.population = Number((planet.population * 1.004).toFixed(3));
    } else {
      planet.stability = clamp(planet.stability - 1);
    }

    if (planet.faction === state.playerFaction) {
      state.factions[state.playerFaction].credits += Math.floor(production + resourceYield);
      state.factions[state.playerFaction].research += Math.floor(Math.max(1, planet.industry * 0.015));
    }
  }

  for (const faction of Object.values(state.factions)) {
    faction.credits = Math.max(0, faction.credits);
  }

  recordEvent(state, 'TURN_ADVANCED', { year: state.year });
  state.history.push({ turn: state.turn, year: state.year });
  if (state.history.length > 120) state.history.shift();
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
  if (!state.factions[factionA] || !state.factions[factionB] || factionA === factionB) return false;
  const listA = state.factions[factionA].atWar;
  const listB = state.factions[factionB].atWar;
  if (active) {
    if (!listA.includes(factionB)) listA.push(factionB);
    if (!listB.includes(factionA)) listB.push(factionA);
  } else {
    state.factions[factionA].atWar = listA.filter((id) => id !== factionB);
    state.factions[factionB].atWar = listB.filter((id) => id !== factionA);
  }
  recordEvent(state, active ? 'WAR_DECLARED' : 'PEACE_SIGNED', { factionA, factionB });
  return true;
}
