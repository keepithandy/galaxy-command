const FACTION_COLORS = Object.freeze({
  aurora: '#55b6ff',
  vanguard: '#ff5f6d',
  independent: '#8ea2b8',
  neutral: '#94a3b8',
});

export function factionColor(faction = 'neutral', factions = []) {
  return factions.find((item) => item.id === faction)?.color
    ?? FACTION_COLORS[faction]
    ?? FACTION_COLORS.neutral;
}

export function systemFaction(system, planets = {}) {
  const counts = new Map();
  for (const planet of system.planets ?? []) {
    const faction = planets[planet.id]?.faction ?? planet.faction ?? 'neutral';
    counts.set(faction, (counts.get(faction) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'neutral';
}

export function buildTerritoryIndex(galaxy, planets = {}) {
  return (galaxy.systems ?? []).reduce((index, system) => {
    const faction = systemFaction(system, planets);
    index[faction] ??= [];
    index[faction].push(system.id);
    return index;
  }, {});
}
