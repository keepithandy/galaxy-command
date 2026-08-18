export const UNIT_TYPES = Object.freeze({
  infantry: { category: 'army', power: 10, cost: 50 },
  armor: { category: 'army', power: 24, cost: 120 },
  artillery: { category: 'army', power: 20, cost: 100 },
  scout: { category: 'fleet', power: 8, cost: 80 },
  frigate: { category: 'fleet', power: 18, cost: 150 },
  destroyer: { category: 'fleet', power: 30, cost: 250 },
  cruiser: { category: 'fleet', power: 48, cost: 420 },
  battleship: { category: 'fleet', power: 80, cost: 800 },
});

export function createFleet(state, faction, systemId, units = {}) {
  const id = `fleet-${Object.keys(state.fleets).length + 1}`;
  state.fleets[id] = { id, faction, systemId, units, status: 'READY' };
  return state.fleets[id];
}

export function createArmy(state, faction, planetId, units = {}) {
  const id = `army-${Object.keys(state.armies).length + 1}`;
  state.armies[id] = { id, faction, planetId, units, status: 'READY' };
  return state.armies[id];
}

export function forcePower(units = {}) {
  return Object.entries(units).reduce((total, [type, count]) => total + (UNIT_TYPES[type]?.power ?? 0) * count, 0);
}

export function resolveBattle(attacker, defender) {
  const attackPower = forcePower(attacker.units);
  const defensePower = forcePower(defender.units);
  if (attackPower === defensePower) return { winner: 'draw', attackPower, defensePower };
  return {
    winner: attackPower > defensePower ? 'attacker' : 'defender',
    attackPower,
    defensePower,
  };
}
