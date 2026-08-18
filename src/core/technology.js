export const TECHNOLOGIES = Object.freeze({
  efficientIndustry: { name: 'Efficient Industry', cost: 40, requires: [] },
  advancedEngines: { name: 'Advanced Engines', cost: 60, requires: [] },
  compositeArmor: { name: 'Composite Armor', cost: 75, requires: ['efficientIndustry'] },
  hyperspaceDrive: { name: 'Hyperspace Drive', cost: 120, requires: ['advancedEngines'] },
  deepSpaceLogistics: { name: 'Deep-Space Logistics', cost: 160, requires: ['hyperspaceDrive', 'efficientIndustry'] },
  strategicWeapons: { name: 'Strategic Weapons', cost: 220, requires: ['compositeArmor'] },
});

export function canResearch(state, factionId, techId) {
  const tech = TECHNOLOGIES[techId];
  if (!tech || !state.factions[factionId]) return false;
  const completed = state.technologies[factionId] ?? [];
  return !completed.includes(techId) && tech.requires.every((req) => completed.includes(req));
}

export function research(state, factionId, techId) {
  if (!canResearch(state, factionId, techId)) return false;
  const tech = TECHNOLOGIES[techId];
  const faction = state.factions[factionId];
  if (faction.research < tech.cost) return false;
  faction.research -= tech.cost;
  state.technologies[factionId] ??= [];
  state.technologies[factionId].push(techId);
  return true;
}
