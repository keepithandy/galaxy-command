const EVENT_TABLE = [
  { type: 'RESOURCE_SURGE', weight: 30 },
  { type: 'UNREST', weight: 25 },
  { type: 'DISCOVERY', weight: 20 },
  { type: 'TRADE_BOOM', weight: 15 },
  { type: 'PIRATE_RAID', weight: 10 },
];

export function rollEvent(seed = Math.random()) {
  const total = EVENT_TABLE.reduce((sum, event) => sum + event.weight, 0);
  let cursor = seed * total;
  for (const event of EVENT_TABLE) {
    cursor -= event.weight;
    if (cursor <= 0) return event.type;
  }
  return EVENT_TABLE.at(-1).type;
}

export function applyEvent(state, type, planetId) {
  const planet = state.planets[planetId];
  if (!planet) return false;
  switch (type) {
    case 'RESOURCE_SURGE':
      planet.resources = Math.min(100, planet.resources + 8);
      break;
    case 'UNREST':
      planet.stability = Math.max(0, planet.stability - 12);
      planet.loyalty = Math.max(0, planet.loyalty - 10);
      break;
    case 'DISCOVERY':
      planet.industry = Math.min(100, planet.industry + 6);
      break;
    case 'TRADE_BOOM':
      planet.energy = Math.min(100, planet.energy + 10);
      break;
    case 'PIRATE_RAID':
      planet.defense = Math.max(0, planet.defense - 6);
      break;
    default:
      return false;
  }
  state.events.push({ turn: state.turn, type, planetId });
  return true;
}
