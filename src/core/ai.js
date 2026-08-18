import { setWar, transferPlanet } from './simulation.js';

export function evaluateFaction(state, factionId) {
  const owned = Object.values(state.planets).filter((planet) => planet.faction === factionId);
  const hostile = Object.values(state.planets).filter((planet) => planet.faction !== factionId);
  const strength = owned.reduce((sum, planet) => sum + planet.industry + planet.defense, 0);
  const opportunities = hostile
    .map((planet) => ({ planet, score: planet.resources + planet.industry - planet.defense }))
    .sort((a, b) => b.score - a.score);
  return { factionId, ownedPlanets: owned.length, strength, bestOpportunity: opportunities[0]?.planet ?? null };
}

export function runFactionTurn(state, factionId) {
  if (factionId === state.playerFaction || !state.factions[factionId]) return null;
  const evaluation = evaluateFaction(state, factionId);
  const target = evaluation.bestOpportunity;
  if (!target) return evaluation;

  const targetOwner = target.faction;
  if (evaluation.strength > target.defense * 1.8 && !state.factions[factionId].atWar.includes(targetOwner)) {
    setWar(state, factionId, targetOwner, true);
  }

  if (state.factions[factionId].atWar.includes(targetOwner) && evaluation.strength > target.defense * 2.2) {
    transferPlanet(state, target.id, factionId);
  }
  return evaluation;
}

export function runAllFactionTurns(state) {
  return Object.keys(state.factions).map((id) => runFactionTurn(state, id)).filter(Boolean);
}
