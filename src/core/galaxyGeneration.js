const SYSTEM_NAMES = ['Asterion', 'Borealis', 'Cygnus', 'Damaris', 'Erebus', 'Helion', 'Ilyra', 'Jovian', 'Kestrel', 'Luminara', 'Meridian', 'Nadir'];
const PLANET_NAMES = ['Prime', 'Minor', 'Reach', 'Haven', 'Crown', 'Bastion'];

export const DEFAULT_FACTIONS = Object.freeze([
  { id: 'independent', name: 'Independent', color: '#8ea2b8' },
  { id: 'aurora', name: 'Aurora Compact', color: '#55b6ff' },
  { id: 'vanguard', name: 'Vanguard Directorate', color: '#ff5f6d' },
]);

export function createSeededRandom(seed = 1337) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function integer(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function planetStatus(faction) {
  if (faction === 'aurora') return 'CONTROLLED';
  if (faction === 'vanguard') return 'HOSTILE';
  return 'NEUTRAL';
}

export function generateGalaxy({ seed = 1337, systemCount = 8, planetsPerSystem = 2, factions = DEFAULT_FACTIONS } = {}) {
  if (!Number.isInteger(systemCount) || systemCount < 1) throw new Error('systemCount must be a positive integer');
  if (!Number.isInteger(planetsPerSystem) || planetsPerSystem < 1) throw new Error('planetsPerSystem must be a positive integer');
  if (!Array.isArray(factions) || factions.length === 0) throw new Error('At least one faction is required');

  const random = createSeededRandom(seed);
  const systems = [];
  const fleets = [];

  for (let systemIndex = 0; systemIndex < systemCount; systemIndex += 1) {
    const id = `system-${systemIndex + 1}`;
    const angle = (systemIndex / systemCount) * Math.PI * 2 + random() * 0.35;
    const radius = 10 + random() * 34;
    const faction = factions[integer(random, 0, factions.length - 1)];
    const planets = [];

    for (let planetIndex = 0; planetIndex < planetsPerSystem; planetIndex += 1) {
      const planetId = `${id}-planet-${planetIndex + 1}`;
      const population = Number((0.6 + random() * 9.4).toFixed(1));
      planets.push({
        id: planetId,
        name: `${SYSTEM_NAMES[systemIndex % SYSTEM_NAMES.length]} ${PLANET_NAMES[planetIndex % PLANET_NAMES.length]}`,
        orbit: Number((3 + planetIndex * 1.8 + random() * 0.8).toFixed(2)),
        size: Number((0.35 + random() * 0.4).toFixed(2)),
        faction: faction.id,
        population: `${population}M`,
        industry: integer(random, 25, 90),
        resources: integer(random, 25, 95),
        defense: integer(random, 15, 85),
        status: planetStatus(faction.id),
      });
    }

    systems.push({
      id,
      name: SYSTEM_NAMES[systemIndex % SYSTEM_NAMES.length],
      position: [
        Number((Math.cos(angle) * radius).toFixed(2)),
        Number(((random() - 0.5) * 14).toFixed(2)),
        Number((Math.sin(angle) * radius).toFixed(2)),
      ],
      starColor: `hsl(${integer(random, 25, 220)} 75% 78%)`,
      planets,
    });

    if (systemIndex % 2 === 0) {
      fleets.push({
        id: `${faction.id}-fleet-${systemIndex + 1}`,
        name: `${faction.name} Patrol ${systemIndex + 1}`,
        faction: faction.id,
        systemId: id,
        strength: integer(random, 18, 60),
        status: 'PATROL',
      });
    }
  }

  return {
    name: `Seed ${Number(seed) >>> 0} Reach`,
    factions: structuredClone(factions),
    fleets,
    systems,
  };
}
