import { Group } from 'three';

import { systemFaction } from './territories.js';

export const SYSTEM_LABEL_BUDGET = Object.freeze({ desktop: 28, compact: 10 });

function finiteValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function deriveSystemViewData(system, state) {
  const worlds = system.planets
    .map((planet) => {
      const current = state.planets[planet.id];
      if (!current) return null;
      return {
        id: planet.id,
        name: planet.name,
        faction: current.faction,
        status: current.status ?? planet.status ?? 'UNKNOWN',
        resources: finiteValue(current.resources),
        industry: finiteValue(current.industry),
        defense: finiteValue(current.defense),
        orbit: finiteValue(planet.orbit),
      };
    })
    .filter(Boolean);
  const fleets = Object.values(state.fleets)
    .filter((fleet) => fleet.systemId === system.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  const aggregate = worlds.reduce(
    (totals, world) => ({
      resources: totals.resources + world.resources,
      industry: totals.industry + world.industry,
      defense: totals.defense + world.defense,
    }),
    { resources: 0, industry: 0, defense: 0 }
  );
  const strategicValue = Number.isFinite(system.strategicValue)
    ? system.strategicValue
    : Math.round(
      (aggregate.resources + aggregate.industry + aggregate.defense)
        / Math.max(worlds.length * 3, 1)
    );

  return {
    systemId: system.id,
    controller: systemFaction(system, state.planets),
    worlds,
    fleets,
    resources: Math.round(aggregate.resources),
    industry: Math.round(aggregate.industry),
    defense: Math.round(aggregate.defense),
    strategicValue,
    fleetStrength: fleets.reduce((total, fleet) => total + finiteValue(fleet.strength), 0),
  };
}

export function isGalaxyLabelVisible({
  index,
  total,
  compact = false,
  selected = false,
  hovered = false,
  filtered = false,
  mode = 'galaxy',
}) {
  if (selected || hovered) return true;
  if (filtered || mode !== 'galaxy') return false;
  const budget = compact ? SYSTEM_LABEL_BUDGET.compact : SYSTEM_LABEL_BUDGET.desktop;
  if (total <= budget) return true;
  return index % Math.ceil(total / budget) === 0;
}

export function createSystemViewLayer(scene) {
  const group = new Group();
  group.name = 'system-view-layer';
  group.visible = false;
  scene?.add?.(group);

  const records = new Map();
  let activeSystemId = null;

  return {
    group,
    register(systemId, systemGroup) {
      if (!systemId || !systemGroup) throw new TypeError('A system ID and scene group are required');
      if (records.has(systemId)) throw new Error(`System view already registered: ${systemId}`);
      systemGroup.visible = false;
      systemGroup.userData.systemViewId = systemId;
      records.set(systemId, systemGroup);
      group.add(systemGroup);
      return systemGroup;
    },
    setActiveSystem(systemId = null) {
      activeSystemId = records.has(systemId) ? systemId : null;
      group.visible = activeSystemId !== null;
      for (const [id, systemGroup] of records) {
        systemGroup.visible = id === activeSystemId;
      }
      return activeSystemId;
    },
    get(systemId) {
      return records.get(systemId) ?? null;
    },
    get activeSystemId() {
      return activeSystemId;
    },
    get size() {
      return records.size;
    },
  };
}
