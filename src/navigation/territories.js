const FACTION_COLORS = {
  player: 0x4fd1ff,
  federation: 0x65a30d,
  dominion: 0xdc2626,
  independent: 0xf59e0b,
  neutral: 0x94a3b8
};

export function factionColor(faction = 'neutral') {
  return FACTION_COLORS[faction] ?? FACTION_COLORS.neutral;
}

export function buildTerritoryIndex(galaxy) {
  return (galaxy.systems ?? []).reduce((index, system) => {
    const faction = system.faction ?? system.owner ?? 'neutral';
    index[faction] ??= [];
    index[faction].push(system.id);
    return index;
  }, {});
}
